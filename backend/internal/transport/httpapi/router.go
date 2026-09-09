// Package httpapi 把 HTTP 请求转换为应用调用，再把结果转换为公开或管理端 DTO。
// 阅读入口是 New；路由分散注册在 public_auth.go、comments.go 和 admin.go。
package httpapi

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
	"vpsmonitor/internal/application"
	"vpsmonitor/internal/domain"
	"vpsmonitor/internal/platform/apperror"
	"vpsmonitor/internal/platform/pagination"
	"vpsmonitor/internal/platform/ratelimit"
	"vpsmonitor/internal/platform/response"
	"vpsmonitor/internal/ports"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type API struct {
	S              *application.Service
	Env            string
	Origins        []string
	TrustedProxies []string
	limiter        *ratelimit.Memory
}

// New 注册公共中间件和各组路由。/health 用于探活，业务接口统一挂在 /api/v1 下。
func New(a *API) *gin.Engine {
	if a.limiter == nil {
		a.limiter = ratelimit.New()
	}
	g := gin.New()
	_ = g.SetTrustedProxies(a.TrustedProxies)
	g.Use(gin.Recovery(), a.base())
	if len(a.Origins) > 0 {
		g.Use(cors.New(cors.Config{
			AllowOrigins:     a.Origins,
			AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
			AllowHeaders:     []string{"Authorization", "Content-Type", "X-CSRF-Token", "X-Request-ID"},
			ExposeHeaders:    []string{"X-Request-ID", "Retry-After"},
			AllowCredentials: true,
			MaxAge:           12 * time.Hour,
		}))
	}
	g.GET("/health/live", func(c *gin.Context) { response.Write(c, 200, map[string]any{"status": "ok"}) })
	g.GET("/health/ready", func(c *gin.Context) {
		if e := a.S.Repo.Ping(c); e != nil {
			response.Error(c, apperror.DBUnavailable)
			return
		}
		response.Write(c, 200, map[string]any{"status": "ok"})
	})
	v := g.Group("/api/v1")
	a.public(v)
	a.auth(v)
	a.account(v)
	a.comments(v)
	a.admin(v)
	g.NoRoute(func(c *gin.Context) { response.Error(c, apperror.NotFound) })
	return g
}

// rate 返回中间件。按用户限流时须先运行 protected，才能从上下文读取用户。
func (a *API) rate(prefix string, max int, window time.Duration, userBased bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.ClientIP()
		if userBased {
			key = strconv.FormatInt(user(c).ID, 10)
		}
		ok, retry := a.limiter.Allow(prefix+":"+key, max, window)
		if !ok {
			c.Header("Retry-After", strconv.Itoa(retry))
			response.Error(c, apperror.RateLimited)
			return
		}
		c.Next()
	}
}

// base 附加请求追踪 ID、禁止缓存并限制请求体大小，然后用 c.Next 继续处理链。
func (a *API) base() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-ID")
		if len(id) < 8 || len(id) > 128 {
			id = uuid.NewString()
		}
		c.Set("request_id", id)
		c.Header("X-Request-ID", id)
		c.Header("Cache-Control", "no-store")
		if c.Request.ContentLength > 65536 {
			response.Error(c, apperror.BodyTooLarge)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 65536)
		c.Next()
	}
}

// protected 校验 Bearer 令牌，把数据库读取到的用户和会话存入本次请求的 Gin 上下文。
// 后续 handler 用 user(c)/session(c) 取回，无需再解析 Authorization。
func (a *API) protected(admin bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw, e := application.Bearer(c.GetHeader("Authorization"))
		if e != nil {
			response.Error(c, e)
			return
		}
		u, s, e := a.S.Authenticate(c, raw, admin)
		if e != nil {
			response.Error(c, e)
			return
		}
		c.Set("user", u)
		c.Set("session", s)
		c.Next()
	}
}

// csrf 同时核对 Cookie、X-CSRF-Token、签名和 Origin。
// 客户端从 /auth/csrf 响应正文取得令牌放入请求头，Cookie 则由浏览器自动携带。
func (a *API) csrf() gin.HandlerFunc {
	return func(c *gin.Context) {
		cookie, e := c.Cookie(a.csrfName())
		header := c.GetHeader("X-CSRF-Token")
		if e != nil || header == "" || subtle.ConstantTimeCompare([]byte(cookie), []byte(header)) != 1 || !a.S.CSRF.Valid(header) || !a.originOK(c.GetHeader("Origin")) {
			response.Error(c, apperror.CSRFRejected)
			return
		}
		c.Next()
	}
}
func (a *API) originOK(v string) bool {
	for _, x := range a.Origins {
		if v == x {
			return true
		}
	}
	return false
}
func (a *API) csrfName() string {
	if a.Env == "production" {
		return "__Host-vps_csrf"
	}
	return "vps_csrf"
}
func (a *API) refreshName() string {
	if a.Env == "production" {
		return "__Host-vps_refresh"
	}
	return "vps_refresh"
}
func (a *API) setCookie(c *gin.Context, name, value string, maxAge int, httpOnly bool) {
	http.SetCookie(c.Writer, &http.Cookie{Name: name, Value: value, Path: "/", MaxAge: maxAge, HttpOnly: httpOnly, Secure: a.Env == "production", SameSite: http.SameSiteLaxMode})
}
func (a *API) clearRefresh(c *gin.Context) { a.setCookie(c, a.refreshName(), "", -1, true) }

// bind 把 JSON 写进 dst 指向的结构体，并拒绝未知字段和第二段 JSON。
// 它检查格式；字段的业务含义（如价格不能为负）还需调用方另行校验。
func bind(c *gin.Context, dst any) error {
	if !strings.HasPrefix(c.GetHeader("Content-Type"), "application/json") {
		return apperror.UnsupportedMedia
	}
	dec := json.NewDecoder(io.LimitReader(c.Request.Body, 65537))
	dec.DisallowUnknownFields()
	if e := dec.Decode(dst); e != nil {
		var maxErr *http.MaxBytesError
		if errors.As(e, &maxErr) {
			return apperror.BodyTooLarge
		}
		return apperror.InvalidJSON
	}
	var extra any
	if e := dec.Decode(&extra); !errors.Is(e, io.EOF) {
		return apperror.InvalidJSON
	}
	return nil
}

// paging 默认第 1 页、每页 20 条；评论列表另用 limit 和游标。
func paging(c *gin.Context) (ports.Page, error) {
	p := 1
	s := 20
	var e error
	if x := c.Query("page"); x != "" {
		p, e = strconv.Atoi(x)
		if e != nil || p < 1 || p > 10000 {
			return ports.Page{}, apperror.InvalidArgument
		}
	}
	if x := c.Query("page_size"); x != "" {
		s, e = strconv.Atoi(x)
		if e != nil || s < 1 || s > 100 {
			return ports.Page{}, apperror.InvalidArgument
		}
	}
	return ports.Page{Page: p, Size: s}, nil
}
func limit(c *gin.Context) (int, error) {
	n := 20
	if x := c.Query("limit"); x != "" {
		v, e := strconv.Atoi(x)
		if e != nil || v < 1 || v > 50 {
			return 0, apperror.InvalidArgument
		}
		n = v
	}
	return n, nil
}
func parseOptionalID(c *gin.Context, key string) (*int64, error) {
	x := c.Query(key)
	if x == "" {
		return nil, nil
	}
	v, e := application.ParseID(x)
	return &v, e
}
func parseBool(c *gin.Context, key string) (*bool, error) {
	x := c.Query(key)
	if x == "" {
		return nil, nil
	}
	v, e := strconv.ParseBool(x)
	if e != nil {
		return nil, apperror.InvalidArgument
	}
	return &v, nil
}
func parseInt16(c *gin.Context, key string, allowed ...int16) (*int16, error) {
	x := c.Query(key)
	if x == "" {
		return nil, nil
	}
	v, e := strconv.Atoi(x)
	if e != nil {
		return nil, apperror.InvalidArgument
	}
	for _, a := range allowed {
		if int(a) == v {
			z := int16(v)
			return &z, nil
		}
	}
	return nil, apperror.InvalidArgument
}
func user(c *gin.Context) domain.User       { return c.MustGet("user").(domain.User) }
func session(c *gin.Context) domain.Session { return c.MustGet("session").(domain.Session) }
func idptr(v *int64) any {
	if v == nil {
		return nil
	}
	return strconv.FormatInt(*v, 10)
}
func ts(t time.Time) string { return t.UTC().Format(time.RFC3339Nano) }
func tsp(t *time.Time) any {
	if t == nil {
		return nil
	}
	return ts(*t)
}

// userDTO 明确列出可返回字段，排除 PasswordHash。
// int64 ID 转成字符串，以免前端 JavaScript 数字超过安全整数范围时丢失精度。
func userDTO(u domain.User) gin.H {
	return gin.H{"id": strconv.FormatInt(u.ID, 10), "username": u.Username, "nickname": u.Nickname, "role": u.Role, "enabled": u.Enabled, "created_at": ts(u.CreatedAt), "updated_at": ts(u.UpdatedAt)}
}
func merchantDTO(m domain.Merchant, admin bool) gin.H {
	x := gin.H{"id": strconv.FormatInt(m.ID, 10), "code": m.Code, "name": m.Name, "website_url": m.WebsiteURL}
	if admin {
		x["enabled"] = m.Enabled
		x["created_at"] = ts(m.CreatedAt)
		x["updated_at"] = ts(m.UpdatedAt)
	}
	return x
}

// stockDTO 在响应时判断过期：监控停用、从未检查、或超过两倍轮询间隔。
// is_stale 表示数据新鲜度，不会把数据库里最后一次库存状态直接改成未知。
func stockDTO(x ports.PublicVPS, admin bool) gin.H {
	enabled := x.Merchant.Enabled && x.VPS.Enabled && x.Config.Enabled
	stale := !enabled || x.Stock.LastCheckedAt == nil || (x.Stock.LastCheckedAt != nil && time.Since(*x.Stock.LastCheckedAt) > 2*time.Duration(x.Config.PollIntervalSeconds)*time.Second)
	d := gin.H{"vps_id": strconv.FormatInt(x.VPS.ID, 10), "status": x.Stock.Status, "quantity": x.Stock.Quantity, "last_checked_at": tsp(x.Stock.LastCheckedAt), "last_in_stock_at": tsp(x.Stock.LastInStockAt), "monitor_enabled": enabled, "is_stale": stale}
	if admin {
		d["last_error_code"] = x.Stock.LastErrorCode
	}
	return d
}
func monitorDTO(c domain.MonitorConfig) gin.H {
	return gin.H{"source_url": c.SourceURL, "collector_code": c.CollectorCode, "poll_interval_seconds": c.PollIntervalSeconds, "timeout_seconds": c.TimeoutSeconds, "enabled": c.Enabled, "next_check_at": ts(c.NextCheckAt), "config_version": c.ConfigVersion, "updated_at": ts(c.UpdatedAt), "is_running": c.LeaseExpiresAt != nil && c.LeaseExpiresAt.After(time.Now().UTC())}
}
func vpsDTO(x ports.PublicVPS, admin bool) gin.H {
	v := x.VPS
	d := gin.H{"id": strconv.FormatInt(v.ID, 10), "merchant": merchantDTO(x.Merchant, false), "code": v.Code, "name": v.Name, "description": v.Description, "cpu_cores": v.CPUCores, "memory_mb": v.MemoryMB, "disk_gb": v.DiskGB, "disk_type": v.DiskType, "transfer_gb": v.TransferGB, "port_mbps": v.PortMbps, "price_amount": v.PriceAmount.StringFixed(2), "currency": v.Currency, "billing_period": v.BillingPeriod, "purchase_url": x.Config.SourceURL, "stock": stockDTO(x, admin), "created_at": ts(v.CreatedAt), "updated_at": ts(v.UpdatedAt)}
	if admin {
		d["merchant_id"] = strconv.FormatInt(v.MerchantID, 10)
		d["enabled"] = v.Enabled
		d["monitor_config"] = monitorDTO(x.Config)
	}
	return d
}

// commentPublic 隐去作者身份；不可见但需保留树结构的节点显示占位文字。
// 匿名评论在数据库仍保留 UserID，公开匿名与后台可追溯是两回事。
func commentPublic(x ports.CommentRow) gin.H {
	c := x.Comment
	placeholder := c.Visibility != 1
	content := c.Content
	name := c.UserNickname
	var anon any = c.IsAnonymous
	if placeholder {
		content = "该评论暂不可见"
		name = "用户"
		anon = nil
	} else if c.IsAnonymous {
		name = "匿名用户"
	}
	return gin.H{"id": strconv.FormatInt(c.ID, 10), "vps_id": strconv.FormatInt(c.VPSID, 10), "parent_id": idptr(c.ParentID), "root_id": idptr(c.RootID), "depth": c.Depth, "content": content, "is_anonymous": anon, "display_nickname": name, "is_placeholder": placeholder, "reply_count": x.ReplyCount, "created_at": ts(c.CreatedAt)}
}
func commentPrivate(c domain.Comment) gin.H {
	return gin.H{"id": strconv.FormatInt(c.ID, 10), "vps_id": strconv.FormatInt(c.VPSID, 10), "parent_id": idptr(c.ParentID), "root_id": idptr(c.RootID), "depth": c.Depth, "content": c.Content, "is_anonymous": c.IsAnonymous, "visibility": c.Visibility, "created_at": ts(c.CreatedAt), "updated_at": ts(c.UpdatedAt), "can_delete": c.Visibility != 4}
}
func commentAdmin(x ports.CommentRow) gin.H {
	d := commentPrivate(x.Comment)
	d["author"] = gin.H{"id": strconv.FormatInt(x.User.ID, 10), "username": x.User.Username, "nickname": x.User.Nickname}
	return d
}
func pageData(items any, total int64, p ports.Page) gin.H {
	return gin.H{"items": items, "total": total, "page": p.Page, "page_size": p.Size}
}

// fail 写出错误响应并返回 true。调用方仍需 return，停止当前 Go 函数。
// Gin 的 Abort 阻止后续 handler，但不等于退出当前函数。
func fail(c *gin.Context, e error) bool {
	if e != nil {
		response.Error(c, e)
		return true
	}
	return false
}

var _ = fmt.Sprintf
var _ = pagination.Cursor{}

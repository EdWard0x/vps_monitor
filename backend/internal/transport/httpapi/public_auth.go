package httpapi

import (
	"errors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"net/http"
	"strconv"
	"strings"
	"time"
	"vpsmonitor/internal/application"
	"vpsmonitor/internal/platform/apperror"
	"vpsmonitor/internal/platform/pagination"
	"vpsmonitor/internal/platform/response"
	"vpsmonitor/internal/ports"
)

// public 注册无需登录的查询；仓储的 public=true 会过滤停用的商家或套餐。
func (a *API) public(v *gin.RouterGroup) {
	v.GET("/settings", func(c *gin.Context) {
		x, _, e := a.S.Repo.GetSettings(c, false)
		if fail(c, e) {
			return
		}
		response.Write(c, 200, gin.H{"site_name": x.SiteName, "registration_enabled": x.RegistrationEnabled, "comments_enabled": x.CommentsEnabled, "anonymous_comments_enabled": x.AnonymousCommentsEnabled, "comment_review_required": x.CommentReviewRequired, "comment_max_depth": x.CommentMaxDepth, "demo_mode": a.S.Demo})
	})
	v.GET("/merchants", a.listMerchants(false))
	v.GET("/merchants/:id", func(c *gin.Context) {
		id, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		x, e := a.S.Repo.GetMerchant(c, id, true)
		if fail(c, e) {
			return
		}
		response.Write(c, 200, merchantDTO(x, false))
	})
	v.GET("/vps", a.listVPS(false))
	v.GET("/vps/:id", func(c *gin.Context) {
		id, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		x, e := a.S.Repo.GetVPS(c, id, true)
		if fail(c, e) {
			return
		}
		response.Write(c, 200, vpsDTO(x, false))
	})
	v.GET("/vps/:id/stock", func(c *gin.Context) {
		id, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		x, e := a.S.Repo.GetVPS(c, id, true)
		if fail(c, e) {
			return
		}
		response.Write(c, 200, stockDTO(x, false))
	})
}

// listMerchants 是推荐的第一条阅读链：解析参数 → 查仓储 → 转换 DTO → 统一响应。
// admin 决定是否返回管理字段；传给仓储的 !admin 决定是否只查询公开数据。
func (a *API) listMerchants(admin bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		p, e := paging(c)
		if fail(c, e) {
			return
		}
		enabled, e := parseBool(c, "enabled")
		if fail(c, e) {
			return
		}
		xs, n, e := a.S.Repo.ListMerchants(c, ports.MerchantFilter{Q: c.Query("q"), Enabled: enabled, Page: p}, !admin)
		if fail(c, e) {
			return
		}
		// xs 是数据库记录，items 是 API 响应；显式转换让两者的字段可以分别演进。
		items := make([]gin.H, len(xs))
		for i, x := range xs {
			items[i] = merchantDTO(x, admin)
		}
		response.Write(c, 200, pageData(items, n, p))
	}
}
func (a *API) listVPS(admin bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		p, e := paging(c)
		if fail(c, e) {
			return
		}
		mid, e := parseOptionalID(c, "merchant_id")
		if fail(c, e) {
			return
		}
		status, e := parseInt16(c, "status", 1, 2, 3)
		if fail(c, e) {
			return
		}
		enabled, e := parseBool(c, "enabled")
		if fail(c, e) {
			return
		}
		sort := c.DefaultQuery("sort", "created_desc")
		if sort != "created_desc" && sort != "price_asc" && sort != "price_desc" {
			response.Error(c, apperror.InvalidArgument)
			return
		}
		currency := strings.ToUpper(c.Query("currency"))
		period := c.Query("billing_period")
		if (sort == "price_asc" || sort == "price_desc") && (currency == "" || period == "") {
			response.Error(c, apperror.InvalidArgument)
			return
		}
		xs, n, e := a.S.Repo.ListVPS(c, ports.VPSFilter{MerchantID: mid, Status: status, Q: c.Query("q"), Currency: currency, BillingPeriod: period, Sort: sort, Enabled: enabled, Page: p}, !admin)
		if fail(c, e) {
			return
		}
		items := make([]gin.H, len(xs))
		for i, x := range xs {
			items[i] = vpsDTO(x, admin)
		}
		response.Write(c, 200, pageData(items, n, p))
	}
}

// auth 注册 CSRF 获取、注册、登录、刷新和退出。
// 登录响应的 access 放在 JSON 中，refresh 放在 HttpOnly Cookie 中。
func (a *API) auth(v *gin.RouterGroup) {
	g := v.Group("/auth")
	g.GET("/csrf", a.rate("csrf", 60, time.Minute, false), func(c *gin.Context) {
		t, e := a.S.CSRF.Issue()
		if fail(c, e) {
			return
		}
		a.setCookie(c, a.csrfName(), t, 3600, true)
		response.Write(c, 200, gin.H{"csrf_token": t})
	})
	g.POST("/register", a.rate("register", 5, time.Hour, false), a.csrf(), func(c *gin.Context) {
		var in struct {
			Username string `json:"username"`
			Nickname string `json:"nickname"`
			Password string `json:"password"`
		}
		if e := bind(c, &in); fail(c, e) {
			return
		}
		u, e := a.S.Register(c, in.Username, in.Nickname, in.Password)
		if fail(c, e) {
			return
		}
		response.Write(c, 201, gin.H{"user": userDTO(u)})
	})
	g.POST("/login", a.rate("login", 10, time.Minute, false), a.csrf(), func(c *gin.Context) {
		var in struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if e := bind(c, &in); fail(c, e) {
			return
		}
		if ok, retry := a.limiter.Allow("login_username:"+application.NormalizeUsername(in.Username), 5, time.Minute); !ok {
			c.Header("Retry-After", strconv.Itoa(retry))
			response.Error(c, apperror.RateLimited)
			return
		}
		u, access, refresh, expires, e := a.S.Login(c, in.Username, in.Password)
		if fail(c, e) {
			return
		}
		a.setCookie(c, a.refreshName(), refresh, 7*24*3600, true)
		response.Write(c, 200, gin.H{"access_token": access, "token_type": "Bearer", "expires_in": expires, "user": userDTO(u)})
	})
	g.POST("/refresh", a.rate("refresh", 30, time.Minute, false), a.csrf(), func(c *gin.Context) {
		if !emptyBody(c) {
			return
		}
		raw, e := c.Cookie(a.refreshName())
		if e != nil {
			a.clearRefresh(c)
			response.Error(c, apperror.SessionRevoked)
			return
		}
		preClaims, preErr := a.S.Tokens.Verify(raw, "refresh")
		if preErr == nil {
			if ok, retry := a.limiter.Allow("refresh_session:"+preClaims.SessionID, 30, time.Minute); !ok {
				c.Header("Retry-After", strconv.Itoa(retry))
				response.Error(c, apperror.RateLimited)
				return
			}
		}
		claims, _ := a.S.Tokens.Verify(raw, "refresh")
		access, refresh, expires, e := a.S.Refresh(c, raw)
		if e != nil {
			a.clearRefresh(c)
			response.Error(c, e)
			return
		}
		remaining := 7 * 24 * 3600
		if !claims.ExpiresAt.IsZero() {
			remaining = int(time.Until(claims.ExpiresAt).Seconds())
			if remaining < 1 {
				remaining = 1
			}
		}
		a.setCookie(c, a.refreshName(), refresh, remaining, true)
		response.Write(c, 200, gin.H{"access_token": access, "token_type": "Bearer", "expires_in": expires})
	})
	g.POST("/logout", a.csrf(), func(c *gin.Context) {
		if !emptyBody(c) {
			return
		}
		raw, e := c.Cookie(a.refreshName())
		if e == nil {
			if cl, ve := a.S.Tokens.Verify(raw, "refresh"); ve == nil {
				if uid, pe := strconv.ParseInt(cl.Subject, 10, 64); pe == nil {
					_ = a.S.Repo.RevokeSession(c, cl.SessionID, uid)
				}
			}
		}
		a.clearRefresh(c)
		response.Write(c, 200, nil)
	})
	g.POST("/logout-all", a.protected(false), func(c *gin.Context) {
		if !emptyBody(c) {
			return
		}
		_, e := a.S.Repo.RevokeAllSessions(c, user(c).ID, time.Now().UTC())
		if fail(c, e) {
			return
		}
		a.clearRefresh(c)
		response.Write(c, 200, nil)
	})
}

// emptyBody 在这里指“无业务字段的 JSON 对象 {}”，不是完全不发请求体。
// 它复用 bind，因此仍须发送 application/json。
func emptyBody(c *gin.Context) bool {
	var in map[string]any
	if e := bind(c, &in); fail(c, e) {
		return false
	}
	if len(in) != 0 {
		response.Error(c, apperror.InvalidArgument)
		return false
	}
	return true
}

// account 的 /me 接口用鉴权得到的用户 ID 操作本人数据，不让客户端指定任意账户。
func (a *API) account(v *gin.RouterGroup) {
	g := v.Group("/me", a.protected(false))
	g.GET("", func(c *gin.Context) { response.Write(c, 200, userDTO(user(c))) })
	g.PATCH("", func(c *gin.Context) {
		var in struct {
			Nickname string `json:"nickname"`
		}
		if e := bind(c, &in); fail(c, e) {
			return
		}
		if n := len([]rune(strings.TrimSpace(in.Nickname))); n < 1 || n > 32 {
			response.Error(c, apperror.InvalidArgument)
			return
		}
		u, e := a.S.Repo.UpdateUser(c, user(c).ID, map[string]any{"nickname": strings.TrimSpace(in.Nickname)})
		if fail(c, e) {
			return
		}
		response.Write(c, 200, userDTO(u))
	})
	g.PATCH("/password", func(c *gin.Context) {
		var in struct {
			Current string `json:"current_password"`
			Next    string `json:"new_password"`
		}
		if e := bind(c, &in); fail(c, e) {
			return
		}
		if e := a.S.ChangePassword(c, user(c), in.Current, in.Next); fail(c, e) {
			return
		}
		a.clearRefresh(c)
		response.Write(c, 200, nil)
	})
	g.GET("/sessions", func(c *gin.Context) {
		p, e := paging(c)
		if fail(c, e) {
			return
		}
		xs, n, e := a.S.Repo.ListSessions(c, user(c).ID, p)
		if fail(c, e) {
			return
		}
		items := make([]gin.H, len(xs))
		for i, x := range xs {
			items[i] = gin.H{"id": x.ID, "created_at": ts(x.CreatedAt), "updated_at": ts(x.UpdatedAt), "refresh_expires_at": ts(x.RefreshExpiresAt), "is_current": x.ID == session(c).ID}
		}
		response.Write(c, 200, pageData(items, n, p))
	})
	g.DELETE("/sessions/:id", func(c *gin.Context) {
		if _, e := uuid.Parse(c.Param("id")); e != nil {
			response.Error(c, apperror.InvalidArgument)
			return
		}
		if e := a.S.Repo.RevokeSession(c, c.Param("id"), user(c).ID); fail(c, e) {
			return
		}
		if c.Param("id") == session(c).ID {
			a.clearRefresh(c)
		}
		response.Write(c, 200, nil)
	})
	g.GET("/comments", func(c *gin.Context) {
		p, e := paging(c)
		if fail(c, e) {
			return
		}
		vis, e := parseInt16(c, "visibility", 1, 2, 3, 4)
		if fail(c, e) {
			return
		}
		xs, n, e := a.S.Repo.ListOwnComments(c, user(c).ID, ports.CommentFilter{Visibility: vis, Page: p})
		if fail(c, e) {
			return
		}
		items := make([]gin.H, len(xs))
		for i, x := range xs {
			items[i] = commentPrivate(x)
		}
		response.Write(c, 200, pageData(items, n, p))
	})
}

// small UUID syntax validator without accepting arbitrary session selectors.
func strconvParseUUID(s string) bool { _, e := uuid.Parse(s); return e == nil }

var _ = errors.Is
var _ = http.StatusOK
var _ = pagination.Cursor{}

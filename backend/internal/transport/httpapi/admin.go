package httpapi

import (
	"encoding/json"
	"log/slog"
	"strconv"
	"strings"
	"time"
	"vpsmonitor/internal/application"
	"vpsmonitor/internal/domain"
	"vpsmonitor/internal/platform/apperror"
	"vpsmonitor/internal/platform/response"
	"vpsmonitor/internal/ports"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

type monitorCreateInput struct {
	SourceURL           string `json:"source_url"`
	CollectorCode       string `json:"collector_code"`
	PollIntervalSeconds int    `json:"poll_interval_seconds"`
	TimeoutSeconds      int    `json:"timeout_seconds"`
	Enabled             bool   `json:"enabled"`
}
type monitorPutInput struct {
	SourceURL           string `json:"source_url"`
	CollectorCode       string `json:"collector_code"`
	PollIntervalSeconds int    `json:"poll_interval_seconds"`
	TimeoutSeconds      int    `json:"timeout_seconds"`
	Enabled             bool   `json:"enabled"`
	ExpectedVersion     int64  `json:"expected_version"`
}
type vpsCreate struct {
	MerchantID              string `json:"merchant_id"`
	Code, Name, Description string
	CPUCores                int                `json:"cpu_cores"`
	MemoryMB                int                `json:"memory_mb"`
	DiskGB                  int                `json:"disk_gb"`
	DiskType                string             `json:"disk_type"`
	TransferGB              *int               `json:"transfer_gb"`
	PortMbps                *int               `json:"port_mbps"`
	PriceAmount             string             `json:"price_amount"`
	Currency                string             `json:"currency"`
	BillingPeriod           string             `json:"billing_period"`
	Enabled                 bool               `json:"enabled"`
	Monitor                 monitorCreateInput `json:"monitor_config"`
}

// admin 给整组管理接口挂上管理员鉴权，子路由无需重复注册 protected(true)。
func (a *API) admin(v *gin.RouterGroup) {
	g := v.Group("/admin", a.protected(true))
	g.GET("/dashboard", func(c *gin.Context) {
		x, e := a.S.Repo.Dashboard(c)
		if fail(c, e) {
			return
		}
		response.Write(c, 200, x)
	})
	a.adminMerchants(g)
	a.adminVPS(g)
	a.adminUsers(g)
	a.adminComments(g)
	a.adminSettings(g)
}
func (a *API) audit(c *gin.Context, action, kind, id string) {
	slog.Info("admin_audit", "actor_id", user(c).ID, "action", action, "resource_type", kind, "resource_id", id, "request_id", c.GetString("request_id"), "at", time.Now().UTC())
}

// adminMerchants 演示创建和局部更新。PATCH 的指针字段可区分“未传”与显式 false/空串。
// 普通指针不能区分未传与 JSON null；需要这种区分时参考下方 optInt。
func (a *API) adminMerchants(g *gin.RouterGroup) {
	g.GET("/merchants", a.listMerchants(true))
	g.POST("/merchants", func(c *gin.Context) {
		var in struct {
			Code       string `json:"code"`
			Name       string `json:"name"`
			WebsiteURL string `json:"website_url"`
			Enabled    *bool  `json:"enabled"`
		}
		if e := bind(c, &in); fail(c, e) {
			return
		}
		if e := a.S.ValidateMerchant(in.Code, in.Name, in.WebsiteURL); fail(c, e) {
			return
		}
		enabled := true
		if in.Enabled != nil {
			enabled = *in.Enabled
		}
		x, e := a.S.Repo.CreateMerchant(c, domain.Merchant{Code: in.Code, Name: strings.TrimSpace(in.Name), WebsiteURL: in.WebsiteURL, Enabled: enabled})
		if fail(c, e) {
			return
		}
		a.audit(c, "merchant.create", "merchant", strconv.FormatInt(x.ID, 10))
		response.Write(c, 201, merchantDTO(x, true))
	})
	g.PATCH("/merchants/:id", func(c *gin.Context) {
		id, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		var in struct {
			Name       *string `json:"name"`
			WebsiteURL *string `json:"website_url"`
			Enabled    *bool   `json:"enabled"`
		}
		if e = bind(c, &in); fail(c, e) {
			return
		}
		m, e := a.S.Repo.GetMerchant(c, id, false)
		if fail(c, e) {
			return
		}
		updates := map[string]any{}
		if in.Name != nil {
			updates["name"] = strings.TrimSpace(*in.Name)
			m.Name = *in.Name
		}
		if in.WebsiteURL != nil {
			updates["website_url"] = *in.WebsiteURL
			m.WebsiteURL = *in.WebsiteURL
		}
		if in.Enabled != nil {
			updates["enabled"] = *in.Enabled
		}
		if len(updates) == 0 || a.S.ValidateMerchant(m.Code, m.Name, m.WebsiteURL) != nil {
			response.Error(c, apperror.InvalidArgument)
			return
		}
		x, e := a.S.Repo.UpdateMerchant(c, id, updates)
		if fail(c, e) {
			return
		}
		a.audit(c, "merchant.update", "merchant", c.Param("id"))
		response.Write(c, 200, merchantDTO(x, true))
	})
}
func vpsFrom(in vpsCreate) (domain.VPS, domain.MonitorConfig, error) {
	mid, e := application.ParseID(in.MerchantID)
	if e != nil {
		return domain.VPS{}, domain.MonitorConfig{}, e
	}
	price, e := decimal.NewFromString(in.PriceAmount)
	if e != nil {
		return domain.VPS{}, domain.MonitorConfig{}, apperror.InvalidArgument
	}
	v := domain.VPS{
		MerchantID:    mid,
		Code:          in.Code,
		Name:          strings.TrimSpace(in.Name),
		Description:   in.Description,
		CPUCores:      in.CPUCores,
		MemoryMB:      in.MemoryMB,
		DiskGB:        in.DiskGB,
		DiskType:      in.DiskType,
		TransferGB:    in.TransferGB,
		PortMbps:      in.PortMbps,
		PriceAmount:   price,
		Currency:      strings.ToUpper(in.Currency),
		BillingPeriod: in.BillingPeriod,
		Enabled:       in.Enabled,
	}
	m := domain.MonitorConfig{
		SourceURL:           in.Monitor.SourceURL,
		CollectorCode:       in.Monitor.CollectorCode,
		PollIntervalSeconds: in.Monitor.PollIntervalSeconds,
		TimeoutSeconds:      in.Monitor.TimeoutSeconds,
		Enabled:             in.Monitor.Enabled,
	}
	return v, m, nil
}

// optInt 提供三态：未传 Set=false；传 null 为 Set=true、Null=true；
// 传整数为 Set=true、Null=false，让 PATCH 区分“保留旧值”和“清空旧值”。
type optInt struct {
	Set, Null bool
	Value     int
}

func (o *optInt) UnmarshalJSON(b []byte) error {
	o.Set = true
	if string(b) == "null" {
		o.Null = true
		return nil
	}
	return json.Unmarshal(b, &o.Value)
}

// adminVPS 集中注册套餐和监控路由，建议一次只读一个 g.GET/POST/PATCH 块。
func (a *API) adminVPS(g *gin.RouterGroup) {
	g.GET("/vps", a.listVPS(true))
	g.GET("/vps/:id", func(c *gin.Context) {
		id, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		x, e := a.S.Repo.GetVPS(c, id, false)
		if fail(c, e) {
			return
		}
		response.Write(c, 200, vpsDTO(x, true))
	})
	g.POST("/vps", func(c *gin.Context) {
		var in vpsCreate
		if e := bind(c, &in); fail(c, e) {
			return
		}
		v, m, e := vpsFrom(in)
		if fail(c, e) || fail(c, a.S.ValidateVPS(v)) || fail(c, a.S.ValidateMonitor(m)) {
			return
		}
		x, e := a.S.Repo.CreateVPS(c, v, m)
		if fail(c, e) {
			return
		}
		a.audit(c, "vps.create", "vps", strconv.FormatInt(x.VPS.ID, 10))
		response.Write(c, 201, vpsDTO(x, true))
	})
	g.PATCH("/vps/:id", func(c *gin.Context) {
		id, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		var in struct {
			Name          *string `json:"name"`
			Description   *string `json:"description"`
			DiskType      *string `json:"disk_type"`
			PriceAmount   *string `json:"price_amount"`
			Currency      *string `json:"currency"`
			BillingPeriod *string `json:"billing_period"`
			CPUCores      *int    `json:"cpu_cores"`
			MemoryMB      *int    `json:"memory_mb"`
			DiskGB        *int    `json:"disk_gb"`
			TransferGB    optInt  `json:"transfer_gb"`
			PortMbps      optInt  `json:"port_mbps"`
			Enabled       *bool   `json:"enabled"`
		}
		if e = bind(c, &in); fail(c, e) {
			return
		}
		old, e := a.S.Repo.GetVPS(c, id, false)
		if fail(c, e) {
			return
		}
		// v 用于合并后的完整校验；u 只放实际修改的数据库列，保留 PATCH 语义。
		v := old.VPS
		u := map[string]any{}
		if in.Name != nil {
			v.Name = *in.Name
			u["name"] = strings.TrimSpace(*in.Name)
		}
		if in.Description != nil {
			v.Description = *in.Description
			u["description"] = *in.Description
		}
		if in.CPUCores != nil {
			v.CPUCores = *in.CPUCores
			u["cpu_cores"] = *in.CPUCores
		}
		if in.MemoryMB != nil {
			v.MemoryMB = *in.MemoryMB
			u["memory_mb"] = *in.MemoryMB
		}
		if in.DiskGB != nil {
			v.DiskGB = *in.DiskGB
			u["disk_gb"] = *in.DiskGB
		}
		if in.DiskType != nil {
			v.DiskType = *in.DiskType
			u["disk_type"] = *in.DiskType
		}
		if in.TransferGB.Set {
			if in.TransferGB.Null {
				v.TransferGB = nil
				u["transfer_gb"] = nil
			} else {
				v.TransferGB = &in.TransferGB.Value
				u["transfer_gb"] = in.TransferGB.Value
			}
		}
		if in.PortMbps.Set {
			if in.PortMbps.Null {
				v.PortMbps = nil
				u["port_mbps"] = nil
			} else {
				v.PortMbps = &in.PortMbps.Value
				u["port_mbps"] = in.PortMbps.Value
			}
		}
		if in.PriceAmount != nil {
			x, e := decimal.NewFromString(*in.PriceAmount)
			if e != nil {
				response.Error(c, apperror.InvalidArgument)
				return
			}
			v.PriceAmount = x
			u["price_amount"] = x
		}
		if in.Currency != nil {
			v.Currency = strings.ToUpper(*in.Currency)
			u["currency"] = v.Currency
		}
		if in.BillingPeriod != nil {
			v.BillingPeriod = *in.BillingPeriod
			u["billing_period"] = *in.BillingPeriod
		}
		if in.Enabled != nil {
			v.Enabled = *in.Enabled
			u["enabled"] = *in.Enabled
		}
		if len(u) == 0 || a.S.ValidateVPS(v) != nil {
			response.Error(c, apperror.InvalidArgument)
			return
		}
		x, e := a.S.Repo.UpdateVPS(c, id, u)
		if fail(c, e) {
			return
		}
		a.audit(c, "vps.update", "vps", c.Param("id"))
		response.Write(c, 200, vpsDTO(x, true))
	})
	g.GET("/collectors", func(c *gin.Context) {
		items := []gin.H{}
		for _, x := range a.S.Collectors.List() {
			items = append(items, gin.H{"code": x.Code(), "name": x.Name(), "available": x.Available()})
		}
		response.Write(c, 200, items)
	})
	g.GET("/monitors", func(c *gin.Context) {
		p, e := paging(c)
		if fail(c, e) {
			return
		}
		mid, e := parseOptionalID(c, "merchant_id")
		if fail(c, e) {
			return
		}
		st, e := parseInt16(c, "status", 1, 2, 3)
		if fail(c, e) {
			return
		}
		en, e := parseBool(c, "enabled")
		if fail(c, e) {
			return
		}
		xs, n, e := a.S.Repo.ListMonitors(c, ports.MonitorFilter{MerchantID: mid, Status: st, Enabled: en, Q: c.Query("q"), Page: p})
		if fail(c, e) {
			return
		}
		items := make([]gin.H, len(xs))
		for i, x := range xs {
			d := monitorDTO(x.Config)
			d["vps_id"] = strconv.FormatInt(x.VPS.ID, 10)
			d["vps_name"] = x.VPS.Name
			d["merchant_id"] = strconv.FormatInt(x.Merchant.ID, 10)
			d["merchant_name"] = x.Merchant.Name
			d["stock"] = stockDTO(x.PublicVPS, true)
			items[i] = d
		}
		response.Write(c, 200, pageData(items, n, p))
	})
	g.PUT("/vps/:id/monitor-config", func(c *gin.Context) {
		id, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		var in monitorPutInput
		if e = bind(c, &in); fail(c, e) {
			return
		}
		if in.ExpectedVersion < 1 {
			response.Error(c, apperror.InvalidArgument)
			return
		}
		m := domain.MonitorConfig{VPSID: id, SourceURL: in.SourceURL, CollectorCode: in.CollectorCode, PollIntervalSeconds: in.PollIntervalSeconds, TimeoutSeconds: in.TimeoutSeconds, Enabled: in.Enabled}
		if e = a.S.ValidateMonitor(m); fail(c, e) {
			return
		}
		x, e := a.S.Repo.UpdateMonitor(c, id, m, in.ExpectedVersion)
		if fail(c, e) {
			return
		}
		a.audit(c, "monitor.update", "vps", c.Param("id"))
		response.Write(c, 200, monitorDTO(x))
	})
	g.POST("/vps/:id/check", func(c *gin.Context) {
		if !emptyBody(c) {
			return
		}
		id, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		x, e := a.S.Repo.QueueCheck(c, id)
		if fail(c, e) {
			return
		}
		a.audit(c, "monitor.queue", "vps", c.Param("id"))
		response.Write(c, 202, gin.H{"vps_id": c.Param("id"), "next_check_at": ts(x.NextCheckAt), "queued": true})
	})
}
func (a *API) adminUsers(g *gin.RouterGroup) {
	g.GET("/users", func(c *gin.Context) {
		p, e := paging(c)
		if fail(c, e) {
			return
		}
		en, e := parseBool(c, "enabled")
		if fail(c, e) {
			return
		}
		role := c.Query("role")
		if role != "" && role != "user" && role != "admin" {
			response.Error(c, apperror.InvalidArgument)
			return
		}
		xs, n, e := a.S.Repo.ListUsers(c, ports.UserFilter{Q: c.Query("q"), Role: role, Enabled: en, Page: p})
		if fail(c, e) {
			return
		}
		items := make([]gin.H, len(xs))
		for i, x := range xs {
			items[i] = userDTO(x)
		}
		response.Write(c, 200, pageData(items, n, p))
	})
	g.PATCH("/users/:id", func(c *gin.Context) {
		id, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		var in struct {
			Role    *string `json:"role"`
			Enabled *bool   `json:"enabled"`
		}
		if e = bind(c, &in); fail(c, e) {
			return
		}
		u := map[string]any{}
		if in.Role != nil {
			if *in.Role != "user" && *in.Role != "admin" {
				response.Error(c, apperror.InvalidArgument)
				return
			}
			u["role"] = *in.Role
		}
		if in.Enabled != nil {
			u["enabled"] = *in.Enabled
		}
		if len(u) == 0 {
			response.Error(c, apperror.InvalidArgument)
			return
		}
		x, e := a.S.Repo.UpdateUser(c, id, u)
		if fail(c, e) {
			return
		}
		a.audit(c, "user.update", "user", c.Param("id"))
		response.Write(c, 200, userDTO(x))
	})
	g.POST("/users/:id/revoke-sessions", func(c *gin.Context) {
		if !emptyBody(c) {
			return
		}
		id, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		n, e := a.S.Repo.RevokeAllSessions(c, id, time.Now().UTC())
		if fail(c, e) {
			return
		}
		a.audit(c, "user.revoke_sessions", "user", c.Param("id"))
		response.Write(c, 200, gin.H{"revoked_count": n})
	})
	g.POST("/users/:id/reset-password", func(c *gin.Context) {
		id, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		var in struct {
			NewPassword string `json:"new_password"`
		}
		if e = bind(c, &in); fail(c, e) {
			return
		}
		if e = a.S.ResetPassword(c, id, in.NewPassword); fail(c, e) {
			return
		}
		a.audit(c, "user.reset_password", "user", c.Param("id"))
		response.Write(c, 200, nil)
	})
}
func (a *API) adminComments(g *gin.RouterGroup) {
	g.GET("/comments", func(c *gin.Context) {
		p, e := paging(c)
		if fail(c, e) {
			return
		}
		vid, e := parseOptionalID(c, "vps_id")
		if fail(c, e) {
			return
		}
		uid, e := parseOptionalID(c, "user_id")
		if fail(c, e) {
			return
		}
		vis, e := parseInt16(c, "visibility", 1, 2, 3, 4)
		if fail(c, e) {
			return
		}
		anon, e := parseBool(c, "is_anonymous")
		if fail(c, e) {
			return
		}
		xs, n, e := a.S.Repo.ListAdminComments(c, ports.CommentFilter{VPSID: vid, UserID: uid, Visibility: vis, IsAnonymous: anon, Q: c.Query("q"), Page: p})
		if fail(c, e) {
			return
		}
		items := make([]gin.H, len(xs))
		for i, x := range xs {
			items[i] = commentAdmin(x)
		}
		a.audit(c, "comment.author_list", "comment", "")
		response.Write(c, 200, pageData(items, n, p))
	})
	g.PATCH("/comments/:id/visibility", func(c *gin.Context) {
		id, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		var in struct {
			Visibility int16 `json:"visibility"`
		}
		if e = bind(c, &in); fail(c, e) {
			return
		}
		if in.Visibility != 1 && in.Visibility != 3 {
			response.Error(c, apperror.InvalidArgument)
			return
		}
		x, e := a.S.Repo.SetCommentVisibility(c, id, in.Visibility)
		if fail(c, e) {
			return
		}
		a.audit(c, "comment.visibility", "comment", c.Param("id"))
		response.Write(c, 200, commentAdmin(x))
	})
	g.DELETE("/comments/:id", func(c *gin.Context) {
		id, e := application.ParseID(c.Param("id"))
		if fail(c, e) {
			return
		}
		if e = a.S.Repo.DeleteComment(c, id); fail(c, e) {
			return
		}
		a.audit(c, "comment.delete", "comment", c.Param("id"))
		response.Write(c, 200, nil)
	})
}

// adminSettings 列出可修改设置的白名单，再交给仓储在事务中统一更新。
func (a *API) adminSettings(g *gin.RouterGroup) {
	g.GET("/settings", func(c *gin.Context) {
		x, t, e := a.S.Repo.GetSettings(c, false)
		if fail(c, e) {
			return
		}
		response.Write(c, 200, gin.H{"settings": x, "updated_at": ts(t)})
	})
	g.PATCH("/settings", func(c *gin.Context) {
		var in struct {
			SiteName            *string `json:"site_name"`
			RegistrationEnabled *bool   `json:"registration_enabled"`
			CommentsEnabled     *bool   `json:"comments_enabled"`
			AnonymousEnabled    *bool   `json:"anonymous_comments_enabled"`
			ReviewRequired      *bool   `json:"comment_review_required"`
			MaxDepth            *int    `json:"comment_max_depth"`
		}
		if e := bind(c, &in); fail(c, e) {
			return
		}
		v := map[string]string{}
		if in.SiteName != nil {
			x := strings.TrimSpace(*in.SiteName)
			if len([]rune(x)) < 1 || len([]rune(x)) > 64 {
				response.Error(c, apperror.InvalidArgument)
				return
			}
			v["site_name"] = x
		}
		if in.RegistrationEnabled != nil {
			v["registration_enabled"] = strconv.FormatBool(*in.RegistrationEnabled)
		}
		if in.CommentsEnabled != nil {
			v["comments_enabled"] = strconv.FormatBool(*in.CommentsEnabled)
		}
		if in.AnonymousEnabled != nil {
			v["anonymous_comments_enabled"] = strconv.FormatBool(*in.AnonymousEnabled)
		}
		if in.ReviewRequired != nil {
			v["comment_review_required"] = strconv.FormatBool(*in.ReviewRequired)
		}
		if in.MaxDepth != nil {
			if *in.MaxDepth < 0 || *in.MaxDepth > 4 {
				response.Error(c, apperror.InvalidArgument)
				return
			}
			v["comment_max_depth"] = strconv.Itoa(*in.MaxDepth)
		}
		if len(v) == 0 {
			response.Error(c, apperror.InvalidArgument)
			return
		}
		x, t, e := a.S.Repo.UpdateSettings(c, v, user(c).ID)
		if fail(c, e) {
			return
		}
		a.audit(c, "settings.update", "site_settings", "")
		response.Write(c, 200, gin.H{"settings": x, "updated_at": ts(t)})
	})
}

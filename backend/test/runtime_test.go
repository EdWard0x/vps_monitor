package test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"vpsmonitor/api"
	"vpsmonitor/config"
	mailiface "vpsmonitor/iface/mail"
	"vpsmonitor/initialize"
	"vpsmonitor/middle"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/response"
	"vpsmonitor/router"
	"vpsmonitor/service"
	passwordutil "vpsmonitor/utils/password"
	"vpsmonitor/utils/redisfrozen"
)

type capturedMail struct{ message mailiface.Message }

func (s *capturedMail) Ready() error { return nil }

func (s *capturedMail) Send(_ context.Context, msg mailiface.Message) error {
	s.message = msg
	return nil
}
func (s *capturedMail) code(t *testing.T) string {
	t.Helper()
	code := regexp.MustCompile(`\b[0-9]{6}\b`).FindString(s.message.TextBody)
	if code == "" {
		t.Fatal("mail did not contain a verification code")
	}
	return code
}

type apiBrowser struct {
	t           *testing.T
	handler     http.Handler
	token, csrf string
	cookies     map[string]*http.Cookie
}

func (b *apiBrowser) call(method, path string, body any, status int) json.RawMessage {
	b.t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		b.t.Fatal(err)
	}
	req := httptest.NewRequest(method, "/api/v1"+path, bytes.NewReader(encoded))
	req.Header.Set("Content-Type", "application/json")
	if b.token != "" {
		req.Header.Set("Authorization", "Bearer "+b.token)
	}
	if b.csrf != "" {
		req.Header.Set("X-CSRF-Token", b.csrf)
	}
	for _, cookie := range b.cookies {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	b.handler.ServeHTTP(rec, req)
	if rec.Code != status {
		b.t.Fatalf("%s %s status %d want %d: %s", method, path, rec.Code, status, rec.Body.String())
	}
	for _, cookie := range rec.Result().Cookies() {
		if cookie.MaxAge < 0 {
			delete(b.cookies, cookie.Name)
		} else {
			b.cookies[cookie.Name] = cookie
		}
	}
	var envelope struct {
		Code      int             `json:"code"`
		Data      json.RawMessage `json:"data"`
		RequestID string          `json:"request_id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &envelope); err != nil {
		b.t.Fatal(err)
	}
	if envelope.RequestID == "" {
		b.t.Fatal("missing request_id")
	}
	if status < 300 && envelope.Code != 0 {
		b.t.Fatalf("unexpected business error: %s", rec.Body.String())
	}
	return envelope.Data
}
func decode[T any](t *testing.T, raw json.RawMessage) T {
	t.Helper()
	var value T
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatal(err)
	}
	return value
}
func (b *apiBrowser) login(username, password string) response.LoginResult {
	result := decode[response.LoginResult](b.t, b.call("POST", "/auth/login", gin.H{"username": username, "password": password}, 200))
	b.token = result.AccessToken
	return result
}

// 使用显式测试连接并为每次测试创建独立 schema；不在业务 schema 中清表。
func TestRuntimeRouterFlows(t *testing.T) {
	dsn, redisAddr := os.Getenv("TEST_DATABASE_URL"), os.Getenv("TEST_REDIS_ADDR")
	if dsn == "" || redisAddr == "" {
		t.Skip("set TEST_DATABASE_URL and TEST_REDIS_ADDR for PostgreSQL/Redis integration")
	}
	base, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	rawBase, _ := base.DB()
	t.Cleanup(func() { _ = rawBase.Close() })
	schema := "router_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if err := base.Exec("CREATE SCHEMA " + schema).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := base.Exec("DROP SCHEMA " + schema + " CASCADE").Error; err != nil {
			t.Error(err)
		}
	})
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	db, err := gorm.Open(postgres.Open(u.String()), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := db.DB()
	t.Cleanup(func() { _ = raw.Close() })
	if _, err := service.NewMigrationService(raw).Up(context.Background(), "../migrations"); err != nil {
		t.Fatal(err)
	}
	rc := redis.NewClient(&redis.Options{Addr: redisAddr, DB: 14})
	t.Cleanup(func() { _ = rc.Close() })
	if err := rc.Ping(context.Background()).Err(); err != nil {
		t.Fatal(err)
	}
	if err := rc.FlushDB(context.Background()).Err(); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{Application: config.Application{Mode: "runtime"}, HTTP: config.HTTP{Address: ":0", CSRFCookieName: "vps_csrf", CSRFSecret: strings.Repeat("c", 32), CSRFTokenTTL: time.Hour}, Database: config.Database{URL: u.String(), MaxOpenConns: 10, MaxIdleConns: 2}, Redis: config.Redis{Address: redisAddr, DB: 14, FrozenCacheTTL: time.Minute}, JWT: config.JWT{AccessSecret: strings.Repeat("a", 32), RefreshSecret: strings.Repeat("r", 32), Issuer: "test", AccessAudience: "api", RefreshAudience: "refresh", AccessTTL: time.Minute, RefreshTTL: time.Hour}}
	app, err := initialize.New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = app.Close() })
	ready := httptest.NewRecorder()
	app.Engine.ServeHTTP(ready, httptest.NewRequest("GET", "/health/ready", nil))
	if ready.Code != 200 {
		t.Fatalf("runtime readiness: %d", ready.Code)
	}
	services := initialize.BuildServices(cfg, db, redisfrozen.New(rc))
	sender := &capturedMail{}
	passwords := passwordutil.Provider{}
	services.Mail = service.NewMailService(db, sender, passwords)
	services.PasswordReset = service.NewPasswordResetService(db, sender, passwords)
	engine := gin.New()
	engine.Use(middle.RequestID(), middle.Recovery(), middle.CORS(nil))
	router.Init(engine, api.NewGroup(services, api.CookieOptions{Name: "vps_csrf", MaxAge: 3600}, api.CookieOptions{Name: "vps_refresh", MaxAge: 3600}), router.Middleware{Authenticate: middle.Authenticate(services.Auth), Admin: middle.RequireAdmin(), CSRF: middle.CSRF(services.Auth, "vps_csrf")}, nil)
	newBrowser := func() *apiBrowser {
		b := &apiBrowser{t: t, handler: engine, cookies: map[string]*http.Cookie{}}
		b.csrf = decode[response.CSRFResult](t, b.call("GET", "/auth/csrf", nil, 200)).Token
		return b
	}
	admin, user, public := newBrowser(), newBrowser(), newBrowser()
	public.call("GET", "/settings/info", nil, 200)
	public.call("POST", "/auth/register", gin.H{"username": "closed", "nickname": "Closed", "password": "test-password"}, 403)
	if err := db.Model(&entity.SiteSetting{}).Where("id = 1").Update("registration_enabled", true).Error; err != nil {
		t.Fatal(err)
	}
	register := func(b *apiBrowser, name string) response.PublicUser {
		return decode[response.PublicUser](t, b.call("POST", "/auth/register", gin.H{"username": name, "nickname": name, "password": "test-password"}, 200))
	}
	adminAccount, account := register(admin, "administrator"), register(user, "reader")
	t.Cleanup(func() {
		_ = rc.Del(context.Background(), "auth:frozen:"+adminAccount.ID, "auth:frozen:"+account.ID).Err()
	})
	admin.login("administrator", "test-password")
	admin.call("GET", "/admin/dashboard/info", nil, 403)
	mailCode := decode[response.CodeResult](t, admin.call("POST", "/me/mail/code", gin.H{"mail": "admin@example.test"}, 200))
	admin.call("POST", "/me/mail/verify", gin.H{"verification_id": mailCode.VerificationID, "code": sender.code(t)}, 200)
	if err := db.Model(&entity.User{}).Where("id = ?", adminAccount.ID).Updates(map[string]any{"role": "admin", "token_version": gorm.Expr("token_version + 1")}).Error; err != nil {
		t.Fatal(err)
	}
	admin.login("administrator", "test-password")
	user.login("reader", "test-password")
	user.call("GET", "/me/info", nil, 200)
	updatedMe := decode[response.AccountUser](t, user.call("PUT", "/me/update", gin.H{"nickname": "Reader Two"}, 200))
	if updatedMe.Nickname != "Reader Two" {
		t.Fatalf("nickname response was stale: %q", updatedMe.Nickname)
	}
	user.call("GET", "/admin/user/list", nil, 403)
	admin.call("GET", "/admin/user/list?q=Reader&role=user&frozen=false", nil, 200)
	admin.call("GET", "/admin/user/info?id="+account.ID, nil, 200)
	admin.call("PUT", "/admin/user/update", gin.H{"id": account.ID, "nickname": "Updated Reader"}, 200)
	// 管理员角色提升必须先验证目标邮箱。
	admin.call("PUT", "/admin/user/role", gin.H{"id": account.ID, "role": "admin"}, 403)
	userCode := decode[response.CodeResult](t, user.call("POST", "/me/mail/code", gin.H{"mail": "reader@example.test"}, 200))
	user.call("POST", "/me/mail/verify", gin.H{"verification_id": userCode.VerificationID, "code": sender.code(t)}, 200)
	user.login("reader", "test-password")
	admin.call("POST", "/admin/froze/freeze", gin.H{"user_id": adminAccount.ID}, 409)
	admin.call("PUT", "/admin/user/role", gin.H{"id": account.ID, "role": "admin"}, 200)
	admin.call("PUT", "/admin/user/role", gin.H{"id": account.ID, "role": "user"}, 200)
	user.login("reader", "test-password")
	admin.call("POST", "/admin/froze/freeze", gin.H{"user_id": account.ID}, 200)
	user.call("GET", "/me/info", nil, 403)
	admin.call("POST", "/admin/froze/unfreeze", gin.H{"user_id": account.ID}, 200)
	user.call("GET", "/me/info", nil, 401)
	user.login("reader", "test-password")
	admin.call("POST", "/admin/user/resetPassword", gin.H{"user_id": account.ID, "new_password": "admin-reset-pass"}, 200)
	user.call("POST", "/auth/refresh", gin.H{}, 401)
	user.login("reader", "admin-reset-pass")
	user.call("PUT", "/me/password", gin.H{"current_password": "admin-reset-pass", "new_password": "self-updated-pass"}, 200)
	user.call("GET", "/me/info", nil, 401)
	user.login("reader", "self-updated-pass")
	reset := decode[response.CodeResult](t, public.call("POST", "/auth/password-reset/code", gin.H{"mail": "reader@example.test"}, 202))
	public.call("POST", "/auth/password-reset/confirm", gin.H{"reset_id": reset.ResetID, "code": sender.code(t), "new_password": "recovered-password"}, 200)
	user.call("GET", "/me/info", nil, 401)
	user.login("reader", "recovered-password")
	user.token = decode[response.TokenResult](t, user.call("POST", "/auth/refresh", gin.H{}, 200)).AccessToken
	user.call("POST", "/auth/logout", gin.H{}, 200)
	user.call("POST", "/auth/refresh", gin.H{}, 401)
	admin.call("GET", "/admin/settings/info", nil, 200)
	settings := decode[response.AdminSettings](t, admin.call("PUT", "/admin/settings/update", gin.H{"site_name": "Integration Catalog", "collection_enabled": true}, 200))
	if settings.Settings.SiteName != "Integration Catalog" || !settings.CollectionEnabled || settings.CollectorImplemented {
		t.Fatal("settings response must contain persisted values and unimplemented collector capability")
	}
	m := decode[response.AdminMerchant](t, admin.call("POST", "/admin/merchant/create", gin.H{"code": "test", "name": "Test Merchant", "website_url": "https://example.test", "enabled": true, "collection_enabled": true}, 200))
	admin.call("POST", "/admin/merchant/create", gin.H{"code": "test", "name": "Duplicate", "website_url": "https://duplicate.example", "enabled": true, "collection_enabled": false}, 409)
	public.call("GET", "/merchant/list", nil, 200)
	public.call("GET", "/merchant/info?id="+m.ID, nil, 200)
	admin.call("GET", "/admin/merchant/list?enabled=true", nil, 200)
	admin.call("GET", "/admin/merchant/info?id="+m.ID, nil, 200)
	vpsInput := gin.H{"merchant_id": m.ID, "code": "small", "name": "Small VPS", "description": "Manually entered", "cpu_cores": 1, "memory_mb": 1024, "disk_gb": 20, "disk_type": "ssd", "has_ipv4": true, "ipv4_count": 1, "has_ipv6": false, "ipv6_count": 0, "price_amount": "4.125", "currency": "USD", "billing_period": "monthly", "purchase_url": "https://example.test/buy", "enabled": true, "collection_enabled": true}
	v := decode[response.AdminVPS](t, admin.call("POST", "/admin/vps/create", vpsInput, 200))
	if v.Stock.Status != 3 || v.Stock.Quantity != nil || v.Stock.LastCheckedAt != nil || !v.Stock.IsStale {
		t.Fatal("new VPS must have unknown stock")
	}
	if allowed, err := services.VPS.CollectionAllowed(context.Background(), v.ID); err != nil || !allowed {
		t.Fatalf("collection permission=%v err=%v", allowed, err)
	}
	public.call("GET", "/vps/list?status=3&sort=price_asc", nil, 200)
	public.call("GET", "/vps/info?id="+v.ID, nil, 200)
	public.call("GET", "/stock/info?vps_id="+v.ID, nil, 200)
	admin.call("GET", "/admin/vps/list?enabled=true", nil, 200)
	admin.call("GET", "/admin/vps/info?id="+v.ID, nil, 200)
	admin.call("DELETE", "/admin/merchant/delete?id="+m.ID, nil, 409)
	updatedMerchant := decode[response.AdminMerchant](t, admin.call("PUT", "/admin/merchant/update", gin.H{"id": m.ID, "name": "Hidden Merchant", "website_url": "https://example.test", "enabled": false, "collection_enabled": true}, 200))
	if updatedMerchant.Name != "Hidden Merchant" || updatedMerchant.Enabled || !updatedMerchant.CollectionEnabled {
		t.Fatal("merchant update response must contain persisted false and text values")
	}
	public.call("GET", "/vps/info?id="+v.ID, nil, 404)
	public.call("GET", "/stock/info?vps_id="+v.ID, nil, 404)
	if allowed, err := services.VPS.CollectionAllowed(context.Background(), v.ID); err != nil || allowed {
		t.Fatalf("hidden merchant collection permission=%v err=%v", allowed, err)
	}
	vpsInput["id"], vpsInput["enabled"], vpsInput["collection_enabled"] = v.ID, false, false
	updated := decode[response.AdminVPS](t, admin.call("PUT", "/admin/vps/update", vpsInput, 200))
	if updated.Enabled || updated.CollectionEnabled {
		t.Fatal("false switches must persist")
	}
	admin.call("GET", "/admin/dashboard/info", nil, 200)
	var stockCount int64
	if err := db.Model(&entity.Stock{}).Count(&stockCount).Error; err != nil {
		t.Fatal(err)
	}
	if stockCount != 0 {
		t.Fatal("catalog operations must never create inventory")
	}
	admin.call("DELETE", "/admin/vps/delete?id="+v.ID, nil, 200)
	admin.call("DELETE", "/admin/merchant/delete?id="+m.ID, nil, 200)
	empty := decode[response.List[response.Merchant]](t, public.call("GET", "/merchant/list", nil, 200))
	if empty.Items == nil || empty.Total != 0 {
		t.Fatal("empty API must return [] and zero total")
	}
}

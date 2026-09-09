package httpapi

import (
	"context"
	"encoding/json"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
	"vpsmonitor/internal/application"
	"vpsmonitor/internal/domain"
	"vpsmonitor/internal/infrastructure/collector"
	mockcollector "vpsmonitor/internal/infrastructure/collector/mock"
	"vpsmonitor/internal/infrastructure/database"
	"vpsmonitor/internal/infrastructure/persistence/gormrepo"
	"vpsmonitor/internal/infrastructure/security"
	"vpsmonitor/internal/platform/pagination"
)

// httpFixture 在真实 PostgreSQL 的 httpapi_test schema 中准备数据。
// httptest 只省去监听网络端口，不会模拟数据库；本测试仍需 TEST_DATABASE_URL。
func httpFixture(t *testing.T) (*API, *gormrepo.Store, domain.User, domain.User, portsPublic) {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is required for HTTP integration tests")
	}
	base, e := database.Open(context.Background(), dsn, 2, 1)
	if e != nil {
		t.Fatal(e)
	}
	if e = base.Exec("CREATE SCHEMA IF NOT EXISTS httpapi_test").Error; e != nil {
		t.Fatal(e)
	}
	sep := "?"
	if strings.Contains(dsn, "?") {
		sep = "&"
	}
	dsn += sep + "search_path=httpapi_test"
	db, e := database.Open(context.Background(), dsn, 10, 2)
	if e != nil {
		t.Fatal(e)
	}
	db.Exec("DROP TABLE IF EXISTS site_settings,comments,vps_stocks,vps_monitor_configs,user_sessions,vps_detail,users,merchant,schema_migrations CASCADE")
	b, e := os.ReadFile(filepath.Join("..", "..", "..", "..", "docs", "sql", "postgres", "001_init.up.sql"))
	if e != nil {
		t.Fatal(e)
	}
	if e = db.Exec(string(b)).Error; e != nil {
		t.Fatal(e)
	}
	repo := gormrepo.New(db)
	h, _ := security.HashPassword("integration password value")
	admin, e := repo.CreateUser(context.Background(), domain.User{Username: "admin_user", Nickname: "管理员", PasswordHash: h, Role: "admin", Enabled: true})
	if e != nil {
		t.Fatal(e)
	}
	normal, e := repo.CreateUser(context.Background(), domain.User{Username: "normal_user", Nickname: "真实昵称", PasswordHash: h, Role: "user", Enabled: true})
	if e != nil {
		t.Fatal(e)
	}
	m, e := repo.CreateMerchant(context.Background(), domain.Merchant{Code: "demo", Name: "Demo", WebsiteURL: "https://example.com", Enabled: true})
	if e != nil {
		t.Fatal(e)
	}
	x, e := repo.CreateVPS(context.Background(), domain.VPS{MerchantID: m.ID, Code: "plan", Name: "Plan", Description: "", CPUCores: 1, MemoryMB: 512, DiskGB: 10, DiskType: "ssd", PriceAmount: decimal.RequireFromString("1.00"), Currency: "USD", BillingPeriod: "monthly", Enabled: true}, domain.MonitorConfig{SourceURL: "https://example.com/buy", CollectorCode: "mock", PollIntervalSeconds: 60, TimeoutSeconds: 5, Enabled: true})
	if e != nil {
		t.Fatal(e)
	}
	tokens := security.Tokens{AccessSecret: []byte("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), RefreshSecret: []byte("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), Issuer: "test", AccessAudience: "api", RefreshAudience: "refresh"}
	svc := &application.Service{Repo: repo, Tokens: tokens, Passwords: security.Passwords{}, CSRF: security.CSRF{Secret: []byte("cccccccccccccccccccccccccccccccc")}, Cursor: pagination.Signer{Secret: []byte("dddddddddddddddddddddddddddddddd")}, Collectors: collector.New(mockcollector.Collector{Enabled: true}), Demo: true}
	return &API{S: svc, Env: "development", Origins: []string{"http://localhost:5173"}}, repo, admin, normal, portsPublic{VPSID: x.VPS.ID}
}

type portsPublic struct{ VPSID int64 }

func tokenFor(t *testing.T, a *API, repo *gormrepo.Store, u domain.User) string {
	t.Helper()
	sid := "00000000-0000-4000-8000-" + strings.Repeat("0", 11) + strconv.Itoa(int(u.ID%10))
	absolute := time.Now().Add(time.Hour)
	access, _, jti, _, e := a.S.Tokens.Issue(u.ID, sid, absolute)
	if e != nil {
		t.Fatal(e)
	}
	e = repo.CreateSession(context.Background(), domain.Session{ID: sid, UserID: u.ID, RefreshJTIHash: security.HashJTI(jti), RefreshExpiresAt: absolute, CreatedAt: time.Now(), UpdatedAt: time.Now()})
	if e != nil {
		t.Fatal(e)
	}
	return access
}
func TestPermissionsAndAnonymousProjection(t *testing.T) {
	gin.SetMode(gin.TestMode)
	a, repo, _, normal, vps := httpFixture(t)
	other, e := repo.CreateUser(context.Background(), domain.User{Username: "other_user", Nickname: "另一个人", PasswordHash: "!disabled-demo-account!", Role: "user", Enabled: true})
	if e != nil {
		t.Fatal(e)
	}
	c, e := repo.CreateComment(context.Background(), vps.VPSID, other.ID, "secret anonymous text", true, nil)
	if e != nil {
		t.Fatal(e)
	}
	normalToken := tokenFor(t, a, repo, normal)
	r := New(a)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/comments/"+strconv.FormatInt(c.ID, 10), nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 || strings.Contains(w.Body.String(), "另一个人") || strings.Contains(w.Body.String(), "user_id") || !strings.Contains(w.Body.String(), "匿名用户") {
		t.Fatalf("anonymous projection leaked: %d %s", w.Code, w.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/v1/admin/dashboard", nil)
	req.Header.Set("Authorization", "Bearer "+normalToken)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 403 {
		t.Fatalf("normal user admin status=%d body=%s", w.Code, w.Body.String())
	}
	req = httptest.NewRequest(http.MethodDelete, "/api/v1/comments/"+strconv.FormatInt(c.ID, 10), nil)
	req.Header.Set("Authorization", "Bearer "+normalToken)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 403 {
		t.Fatalf("delete other's comment status=%d body=%s", w.Code, w.Body.String())
	}
	var env map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &env)
	if env["code"] != float64(400005) {
		t.Fatalf("wrong code: %v", env)
	}
}

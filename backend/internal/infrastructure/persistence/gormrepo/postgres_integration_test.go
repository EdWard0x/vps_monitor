package gormrepo

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
	"vpsmonitor/internal/domain"
	"vpsmonitor/internal/infrastructure/database"
	"vpsmonitor/internal/infrastructure/security"
	"vpsmonitor/internal/platform/apperror"
	"vpsmonitor/internal/ports"
)

// testStore 使用显式测试库中的 gormrepo_test schema，并在每次测试前重建固定表。
// 未设置 TEST_DATABASE_URL 时是跳过，不是已验证数据库行为；同库多次测试运行也不可并行重建。
func testStore(t *testing.T) *Store {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is required for PostgreSQL contract tests")
	}
	base, e := database.Open(context.Background(), dsn, 2, 1)
	if e != nil {
		t.Fatal(e)
	}
	if e = base.Exec("CREATE SCHEMA IF NOT EXISTS gormrepo_test").Error; e != nil {
		t.Fatal(e)
	}
	sep := "?"
	if strings.Contains(dsn, "?") {
		sep = "&"
	}
	dsn += sep + "search_path=gormrepo_test"
	db, e := database.Open(context.Background(), dsn, 10, 2)
	if e != nil {
		t.Fatal(e)
	}
	db.Exec("DROP TABLE IF EXISTS site_settings,comments,vps_stocks,vps_monitor_configs,user_sessions,vps_detail,users,merchant,schema_migrations CASCADE")
	path := filepath.Join("..", "..", "..", "..", "..", "docs", "sql", "postgres", "001_init.up.sql")
	b, e := os.ReadFile(path)
	if e != nil {
		t.Fatal(e)
	}
	if e = db.Exec(string(b)).Error; e != nil {
		t.Fatal(e)
	}
	return New(db)
}
func fixture(t *testing.T, s *Store) (domain.User, ports.PublicVPS) {
	t.Helper()
	ctx := context.Background()
	h, _ := security.HashPassword("integration password value")
	u, e := s.CreateUser(ctx, domain.User{Username: "test_user", Nickname: "测试用户", PasswordHash: h, Role: "admin", Enabled: true})
	if e != nil {
		t.Fatal(e)
	}
	m, e := s.CreateMerchant(ctx, domain.Merchant{Code: "test", Name: "Test", WebsiteURL: "https://example.com", Enabled: true})
	if e != nil {
		t.Fatal(e)
	}
	v := domain.VPS{MerchantID: m.ID, Code: "plan", Name: "Plan", Description: "", CPUCores: 1, MemoryMB: 512, DiskGB: 10, DiskType: "ssd", PriceAmount: decimal.RequireFromString("1.00"), Currency: "USD", BillingPeriod: "monthly", Enabled: true}
	x, e := s.CreateVPS(ctx, v, domain.MonitorConfig{SourceURL: "https://example.com/buy", CollectorCode: "mock", PollIntervalSeconds: 60, TimeoutSeconds: 5, Enabled: true})
	if e != nil {
		t.Fatal(e)
	}
	return u, x
}
func TestPostgresConstraintsAndTransactions(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u, x := fixture(t, s)
	if _, e := s.CreateMerchant(ctx, domain.Merchant{Code: "test", Name: "dup", WebsiteURL: "https://example.com", Enabled: true}); e == nil {
		t.Fatal("duplicate merchant accepted")
	}
	bad := domain.Comment{VPSID: x.VPS.ID, UserID: u.ID, UserNickname: u.Nickname, Content: "bad", Visibility: 1, Depth: 1}
	if e := s.db.Create(&bad).Error; e == nil {
		t.Fatal("invalid comment shape accepted")
	}
	before := int64(0)
	s.db.Model(&domain.VPS{}).Count(&before)
	e := s.Transaction(ctx, func(r ports.Repository) error {
		_, e := r.CreateVPS(ctx, domain.VPS{MerchantID: x.Merchant.ID, Code: "rollback", Name: "R", Description: "", CPUCores: 1, MemoryMB: 1, DiskGB: 1, DiskType: "ssd", PriceAmount: decimal.Zero, Currency: "USD", BillingPeriod: "monthly", Enabled: true}, domain.MonitorConfig{SourceURL: "https://example.com", CollectorCode: "mock", PollIntervalSeconds: 60, TimeoutSeconds: 1, Enabled: false})
		if e != nil {
			return e
		}
		return context.Canceled
	})
	if e == nil {
		t.Fatal("rollback error lost")
	}
	var after int64
	s.db.Model(&domain.VPS{}).Count(&after)
	if after != before {
		t.Fatal("transaction did not roll back")
	}
}
func TestRefreshRaceRevokesReplay(t *testing.T) {
	s := testStore(t)
	u, _ := fixture(t, s)
	ctx := context.Background()
	now := time.Now().UTC()
	sid := uuid.NewString()
	if e := s.CreateSession(ctx, domain.Session{ID: sid, UserID: u.ID, RefreshJTIHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", RefreshExpiresAt: now.Add(time.Hour), CreatedAt: now, UpdatedAt: now}); e != nil {
		t.Fatal(e)
	}
	results := make(chan string, 2)
	var wg sync.WaitGroup
	for _, next := range []string{"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"} {
		wg.Add(1)
		go func(n string) {
			defer wg.Done()
			r, e := s.RotateSession(ctx, sid, u.ID, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", n, time.Now().UTC())
			if e != nil {
				results <- "error"
			} else {
				results <- r
			}
		}(next)
	}
	wg.Wait()
	close(results)
	seen := map[string]int{}
	for r := range results {
		seen[r]++
	}
	if seen["ok"] != 1 || seen["reused"] != 1 {
		t.Fatalf("unexpected race result %#v", seen)
	}
	sess, _, _ := s.GetSessionUser(ctx, sid)
	if sess.RevokedAt == nil {
		t.Fatal("replayed refresh did not commit revocation")
	}
}
func TestLeaseCompetition(t *testing.T) {
	s := testStore(t)
	_, x := fixture(t, s)
	s.db.Model(&domain.MonitorConfig{}).Where("vps_id=?", x.VPS.ID).Update("next_check_at", time.Now().Add(-time.Minute))
	ctx := context.Background()
	var wg sync.WaitGroup
	counts := make(chan int, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			xs, e := s.ClaimDue(ctx, time.Now().UTC(), 1)
			if e != nil {
				counts <- -1
			} else {
				counts <- len(xs)
			}
		}()
	}
	wg.Wait()
	close(counts)
	total := 0
	for n := range counts {
		if n < 0 {
			t.Fatal("claim error")
		}
		total += n
	}
	if total != 1 {
		t.Fatalf("expected one lease, got %d", total)
	}
}

func TestLastAdminAndConfigVersionSerialization(t *testing.T) {
	s := testStore(t)
	admin, x := fixture(t, s)
	h, _ := security.HashPassword("another integration password")
	second, e := s.CreateUser(context.Background(), domain.User{Username: "admin_two", Nickname: "管理员二", PasswordHash: h, Role: "admin", Enabled: true})
	if e != nil {
		t.Fatal(e)
	}
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for _, id := range []int64{admin.ID, second.ID} {
		wg.Add(1)
		go func(id int64) {
			defer wg.Done()
			_, e := s.UpdateUser(context.Background(), id, map[string]any{"role": "user"})
			results <- e
		}(id)
	}
	wg.Wait()
	close(results)
	ok, blocked := 0, 0
	for e := range results {
		if e == nil {
			ok++
		} else if errors.Is(e, apperror.LastAdmin) {
			blocked++
		} else {
			t.Fatal(e)
		}
	}
	if ok != 1 || blocked != 1 {
		t.Fatalf("admin results ok=%d blocked=%d", ok, blocked)
	}
	var count int64
	s.db.Model(&domain.User{}).Where("role='admin' AND enabled=true").Count(&count)
	if count != 1 {
		t.Fatalf("enabled admins=%d", count)
	}
	m := x.Config
	m.SourceURL = "https://example.com/new"
	updated, e := s.UpdateMonitor(context.Background(), x.VPS.ID, m, x.Config.ConfigVersion)
	if e != nil {
		t.Fatal(e)
	}
	if updated.ConfigVersion != x.Config.ConfigVersion+1 {
		t.Fatal("version not incremented")
	}
	if _, e = s.UpdateMonitor(context.Background(), x.VPS.ID, m, x.Config.ConfigVersion); !errors.Is(e, apperror.VersionConflict) {
		t.Fatalf("expected version conflict, got %v", e)
	}
}

func TestNestedDepthAndOldLeaseResult(t *testing.T) {
	s := testStore(t)
	u, x := fixture(t, s)
	ctx := context.Background()
	root, e := s.CreateComment(ctx, x.VPS.ID, u.ID, "root", false, nil)
	if e != nil {
		t.Fatal(e)
	}
	if _, _, e = s.UpdateSettings(ctx, map[string]string{"comment_max_depth": "0"}, u.ID); e != nil {
		t.Fatal(e)
	}
	if _, e = s.CreateComment(ctx, x.VPS.ID, u.ID, "too deep", false, &root.ID); !errors.Is(e, apperror.DepthExceeded) {
		t.Fatalf("expected depth error, got %v", e)
	}
	s.db.Model(&domain.MonitorConfig{}).Where("vps_id=?", x.VPS.ID).Update("next_check_at", time.Now().Add(-time.Minute))
	leases, e := s.ClaimDue(ctx, time.Now(), 1)
	if e != nil || len(leases) != 1 {
		t.Fatalf("claim %v %#v", e, leases)
	}
	cfg := leases[0].Config
	cfg.SourceURL = "https://example.com/changed"
	if _, e = s.UpdateMonitor(ctx, x.VPS.ID, cfg, cfg.ConfigVersion); e != nil {
		t.Fatal(e)
	}
	q := 5
	if e = s.CompleteLease(ctx, leases[0], domain.Observation{Status: 1, Quantity: &q}, time.Now()); e != nil {
		t.Fatal(e)
	}
	got, e := s.GetVPS(ctx, x.VPS.ID, false)
	if e != nil {
		t.Fatal(e)
	}
	if got.Stock.LastCheckedAt != nil {
		t.Fatal("stale lease overwrote stock")
	}
}

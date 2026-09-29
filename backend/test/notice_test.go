package test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"vpsmonitor/api"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/response"
	"vpsmonitor/router"
	"vpsmonitor/service"
)

func TestNoticeRoutesRequireAuthentication(t *testing.T) {
	app := skeletonApp(t)
	for _, tc := range []struct{ method, path string }{
		{"GET", "/notice"}, {"PUT", "/notice/server-key"},
		{"POST", "/notice/test"},
		{"POST", "/addNotice"}, {"DELETE", "/delNotice"},
	} {
		req := httptest.NewRequest(tc.method, "/api/v1/me"+tc.path, strings.NewReader(`{"send_key":"test-key"}`))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		app.Engine.ServeHTTP(rec, req)
		if rec.Code != 401 {
			t.Errorf("%s %s: want 401, got %d", tc.method, tc.path, rec.Code)
		}
	}
}

// Only uses the explicitly supplied test database. All schema/data changes roll back.
func TestNoticeRouterLifecycle(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL for PostgreSQL notification integration")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	raw, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = raw.Close() })
	tx := db.Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	t.Cleanup(func() { tx.Rollback() })
	schema := "notice_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	for _, sql := range []string{"CREATE SCHEMA " + schema, "SET LOCAL search_path TO " + schema} {
		if err := tx.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.AutoMigrate(&entity.User{}, &entity.Notice{}); err != nil {
		t.Fatal(err)
	}
	user := entity.User{Username: "notice_user", Nickname: "Notice", PasswordHash: "test-only", Role: "user"}
	other := entity.User{Username: "other_user", Nickname: "Other", PasswordHash: "test-only", Role: "user", ServerTurboKey: "other-key", NoticeEnabled: true}
	for _, row := range []*entity.User{&user, &other} {
		if err := tx.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	sentAt := time.Now().UTC().Truncate(time.Second)
	history := entity.Notice{UserID: user.ID, VpsID: 17, MerchantID: 3, SendNoticeTimes: 2, SendAt: &sentAt}
	if err := tx.Create(&history).Error; err != nil {
		t.Fatal(err)
	}

	actor := fmt.Sprint(user.ID)
	engine := gin.New()
	me := engine.Group("/api/v1/me", func(c *gin.Context) {
		// Authentication is supplied by the router in production; never read uid from payload.
		c.Set("user_id", actor)
		c.Next()
	})
	router.InitMeRouter(me, api.Group{NoticeApi: api.NoticeApi{Service: service.NewNoticeService(tx, nil)}})
	call := func(method, path, body string, status, code int) json.RawMessage {
		t.Helper()
		req := httptest.NewRequest(method, "/api/v1/me"+path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, req)
		var result struct {
			Code int             `json:"code"`
			Data json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if rec.Code != status || result.Code != code {
			t.Fatalf("%s %s: got status=%d code=%d, want %d/%d", method, path, rec.Code, result.Code, status, code)
		}
		if bytes.Contains(rec.Body.Bytes(), []byte("application-key")) || bytes.Contains(rec.Body.Bytes(), []byte("other-key")) {
			t.Fatal("response exposes a key")
		}
		return result.Data
	}
	assertSettings := func(data json.RawMessage, enabled, bound bool) {
		t.Helper()
		var settings response.NoticeSettings
		if err := json.Unmarshal(data, &settings); err != nil {
			t.Fatal(err)
		}
		if settings.NoticeEnabled != enabled || settings.KeyBound != bound {
			t.Fatalf("unexpected settings: %+v", settings)
		}
	}
	assertSettings(call("GET", "/notice", "", 200, 0), false, false)
	call("POST", "/notice/test", "{}", 500, errcode.ServerTurboNoRecord.Code)
	call("POST", "/addNotice", "{}", 500, errcode.ServerTurboNoRecord.Code)
	for _, body := range []string{`{}`, `{"send_key":"{key}"}`, `{"send_key":"a b"}`, `{"send_key":123}`, `{`} {
		call("PUT", "/notice/server-key", body, 400, errcode.InvalidArgument.Code)
	}
	body := fmt.Sprintf(`{"send_key":" application-key ","user_id":"%d"}`, other.ID)
	assertSettings(call("PUT", "/notice/server-key", body, 200, 0), false, true)
	assertSettings(call("PUT", "/notice/server-key", body, 200, 0), false, true)
	call("POST", "/addNotice", "{}", 200, 0)
	call("POST", "/addNotice", "{}", 200, 0)
	assertSettings(call("GET", "/notice", "", 200, 0), true, true)
	assertSettings(call("PUT", "/notice/server-key", `{"send_key":"replacement-application-key"}`, 200, 0), true, true)
	call("DELETE", "/delNotice", "", 200, 0)
	call("DELETE", "/delNotice", "", 200, 0)
	assertSettings(call("GET", "/notice", "", 200, 0), false, true)

	var saved, untouched entity.User
	if err := tx.First(&saved, user.ID).Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.First(&untouched, other.ID).Error; err != nil {
		t.Fatal(err)
	}
	if saved.ServerTurboKey != "replacement-application-key" || saved.NoticeEnabled || untouched.ServerTurboKey != "other-key" || !untouched.NoticeEnabled {
		t.Fatal("notification mutation changed another user, key, or wrong switch")
	}
	var retained entity.Notice
	if err := tx.First(&retained, history.ID).Error; err != nil {
		t.Fatal(err)
	}
	if retained.SendNoticeTimes != 2 || retained.SendAt == nil || !retained.SendAt.Equal(sentAt) {
		t.Fatal("closing notifications reset delivery history")
	}
	if err := tx.Delete(&saved).Error; err != nil {
		t.Fatal(err)
	}
	call("GET", "/notice", "", 404, errcode.ResourceNotFound.Code)
	call("PUT", "/notice/server-key", body, 404, errcode.ResourceNotFound.Code)
	call("POST", "/addNotice", "{}", 404, errcode.ResourceNotFound.Code)
	call("DELETE", "/delNotice", "", 404, errcode.ResourceNotFound.Code)
}

package test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"vpsmonitor/config"
	messageiface "vpsmonitor/iface/message"
	"vpsmonitor/initialize"
	"vpsmonitor/model/errcode"
	"vpsmonitor/task"
)

func skeletonApp(t *testing.T) *initialize.App {
	t.Helper()
	cfg := config.Config{Application: config.Application{Mode: "skeleton"}, HTTP: config.HTTP{Address: ":0", CSRFSecret: "0123456789abcdef0123456789abcdef", CSRFTokenTTL: 2 * time.Hour, CSRFCookieName: "vps_csrf"}, Redis: config.Redis{FrozenCacheTTL: 300 * time.Second}, Logging: config.Logging{Level: "error"}}
	app, err := initialize.New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = app.Close() })
	return app
}

func TestSkeletonHealthAndNotImplemented(t *testing.T) {
	app := skeletonApp(t)
	cases := []struct {
		path string
		want int
	}{{"/health/live", http.StatusOK}, {"/health/ready", http.StatusServiceUnavailable}, {"/api/v1/merchant/list", http.StatusNotImplemented}}
	for _, tc := range cases {
		req := httptest.NewRequest(http.MethodGet, tc.path, nil)
		rec := httptest.NewRecorder()
		app.Engine.ServeHTTP(rec, req)
		if rec.Code != tc.want {
			t.Fatalf("%s: got %d want %d", tc.path, rec.Code, tc.want)
		}
	}
}

func TestAuthenticationPlaceholderFailsClosed(t *testing.T) {
	app := skeletonApp(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/me/info", nil)
	req.Header.Set("Authorization", "Bearer placeholder")
	rec := httptest.NewRecorder()
	app.Engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotImplemented {
		t.Fatalf("got %d want 501", rec.Code)
	}
	var body struct {
		Code int `json:"code"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Code != errcode.NotImplemented.Code {
		t.Fatalf("got code %d", body.Code)
	}
}

func TestCSRFCookieHeaderFlow(t *testing.T) {
	app := skeletonApp(t)
	issueRequest := httptest.NewRequest(http.MethodGet, "/api/v1/auth/csrf", nil)
	issueResult := httptest.NewRecorder()
	app.Engine.ServeHTTP(issueResult, issueRequest)
	if issueResult.Code != http.StatusOK {
		t.Fatalf("issue status=%d body=%s", issueResult.Code, issueResult.Body.String())
	}
	var body struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(issueResult.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Data.Token == "" {
		t.Fatal("empty CSRF token")
	}
	cookies := issueResult.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != "vps_csrf" || cookies[0].Value != body.Data.Token || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode {
		t.Fatalf("unexpected CSRF cookie: %#v", cookies)
	}
	reuseRequest := httptest.NewRequest(http.MethodGet, "/api/v1/auth/csrf", nil)
	reuseRequest.AddCookie(cookies[0])
	reuseResult := httptest.NewRecorder()
	app.Engine.ServeHTTP(reuseResult, reuseRequest)
	var reusedBody struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(reuseResult.Body.Bytes(), &reusedBody); err != nil {
		t.Fatal(err)
	}
	if reusedBody.Data.Token != body.Data.Token {
		t.Fatal("valid CSRF cookie should be reused across tabs")
	}

	missingRequest := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBufferString(`{"username":"u","password":"p"}`))
	missingRequest.Header.Set("Content-Type", "application/json")
	missingRequest.AddCookie(cookies[0])
	missingResult := httptest.NewRecorder()
	app.Engine.ServeHTTP(missingResult, missingRequest)
	if missingResult.Code != http.StatusForbidden {
		t.Fatalf("missing header status=%d", missingResult.Code)
	}

	validRequest := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBufferString(`{"username":"u","password":"p"}`))
	validRequest.Header.Set("Content-Type", "application/json")
	validRequest.Header.Set("X-CSRF-Token", body.Data.Token)
	validRequest.AddCookie(cookies[0])
	validResult := httptest.NewRecorder()
	app.Engine.ServeHTTP(validResult, validRequest)
	if validResult.Code != http.StatusNotImplemented {
		t.Fatalf("valid CSRF should reach service, status=%d body=%s", validResult.Code, validResult.Body.String())
	}
}

func TestRouteContractHasNoRemovedModules(t *testing.T) {
	app := skeletonApp(t)
	required := map[string]bool{}
	for _, route := range []string{
		"GET /api/v1/auth/csrf", "POST /api/v1/auth/register", "POST /api/v1/auth/login", "POST /api/v1/auth/refresh", "POST /api/v1/auth/logout",
		"POST /api/v1/auth/password-reset/code", "POST /api/v1/auth/password-reset/confirm",
		"GET /api/v1/me/info", "PUT /api/v1/me/update", "PUT /api/v1/me/password", "POST /api/v1/me/mail/code", "POST /api/v1/me/mail/verify",
		"GET /api/v1/merchant/list", "GET /api/v1/merchant/info", "GET /api/v1/vps/list", "GET /api/v1/vps/info", "GET /api/v1/stock/info", "GET /api/v1/settings/info",
		"GET /api/v1/admin/user/list", "GET /api/v1/admin/user/info", "PUT /api/v1/admin/user/update", "PUT /api/v1/admin/user/role", "POST /api/v1/admin/user/resetPassword",
		"POST /api/v1/admin/froze/freeze", "POST /api/v1/admin/froze/unfreeze",
		"POST /api/v1/admin/merchant/create", "PUT /api/v1/admin/merchant/update", "DELETE /api/v1/admin/merchant/delete", "GET /api/v1/admin/merchant/list", "GET /api/v1/admin/merchant/info",
		"POST /api/v1/admin/vps/create", "PUT /api/v1/admin/vps/update", "DELETE /api/v1/admin/vps/delete", "GET /api/v1/admin/vps/list", "GET /api/v1/admin/vps/info",
		"GET /api/v1/admin/settings/info", "PUT /api/v1/admin/settings/update", "GET /api/v1/admin/dashboard/info",
	} {
		required[route] = false
	}
	for _, route := range app.Engine.Routes() {
		key := route.Method + " " + route.Path
		if _, ok := required[key]; ok {
			required[key] = true
		}
		for _, removed := range []string{"/session", "/comment", "/monitor", "/collector"} {
			if strings.Contains(route.Path, removed) {
				t.Fatalf("removed route remains: %s", route.Path)
			}
		}
	}
	for route, found := range required {
		if !found {
			t.Errorf("missing route %s", route)
		}
	}
}

type fakeMessages struct{ reads, acks int }

func (f *fakeMessages) Read(context.Context, messageiface.ReadOptions) ([]messageiface.Delivery, error) {
	f.reads++
	return []messageiface.Delivery{{ID: "1"}}, nil
}
func (f *fakeMessages) Ack(context.Context, string) error { f.acks++; return nil }
func TestDisabledStockConsumerTouchesNoMessages(t *testing.T) {
	fake := &fakeMessages{}
	consumer := task.StockConsumer{Enabled: false, Reader: fake, Acknowledger: fake}
	if err := consumer.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if fake.reads != 0 || fake.acks != 0 {
		t.Fatalf("reads=%d acks=%d", fake.reads, fake.acks)
	}
}

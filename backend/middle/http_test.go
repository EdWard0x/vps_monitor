package middle

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCORSRejectsUnknownOriginAndAllowsPreflight(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	called := false
	engine.Use(CORS([]string{"https://frontend.example"}))
	engine.POST("/api/v1/me/update", func(c *gin.Context) { called = true; c.Status(200) })
	for _, tc := range []struct {
		method, origin string
		status         int
	}{
		{"POST", "https://evil.example", 403},
		{"OPTIONS", "https://frontend.example", 204},
	} {
		req := httptest.NewRequest(tc.method, "/api/v1/me/update", nil)
		req.Header.Set("Origin", tc.origin)
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, req)
		if rec.Code != tc.status || called {
			t.Fatalf("unexpected CORS result: status %d, called %v", rec.Code, called)
		}
		if tc.status == 204 && (rec.Header().Get("Access-Control-Allow-Origin") != tc.origin || rec.Header().Get("Access-Control-Allow-Credentials") != "true") {
			t.Fatal("missing credentialed CORS headers")
		}
	}
}

func TestRateLimitSeparatesAuthenticationBudget(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(RateLimit())
	engine.POST("/api/v1/auth/login", func(c *gin.Context) { c.Status(200) })
	engine.GET("/api/v1/vps/list", func(c *gin.Context) { c.Status(200) })
	for i := 0; i < 31; i++ {
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, httptest.NewRequest("POST", "/api/v1/auth/login", nil))
		want := 200
		if i == 30 {
			want = 429
		}
		if rec.Code != want {
			t.Fatalf("attempt %d status %d want %d", i, rec.Code, want)
		}
		if i == 30 && rec.Header().Get("Retry-After") == "" {
			t.Fatal("missing retry hint")
		}
	}
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/vps/list", nil))
	if rec.Code != http.StatusOK {
		t.Fatal("catalog budget consumed by authentication")
	}
}

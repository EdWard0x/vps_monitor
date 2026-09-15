package middle

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"vpsmonitor/model/errcode"
)

type fakeCSRFProvider struct {
	verified  string
	verifyErr error
}

func (p *fakeCSRFProvider) VerifyCSRF(_ context.Context, token string) error {
	p.verified = token
	return p.verifyErr
}

func TestCSRFMiddlewareRequiresMatchingCookieAndHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	provider := &fakeCSRFProvider{}
	engine := gin.New()
	engine.POST("/", CSRF(provider, "vps_csrf"), func(c *gin.Context) { c.Status(http.StatusNoContent) })

	valid := httptest.NewRequest(http.MethodPost, "/", nil)
	valid.Header.Set("X-CSRF-Token", "signed-token")
	valid.AddCookie(&http.Cookie{Name: "vps_csrf", Value: "signed-token"})
	validResult := httptest.NewRecorder()
	engine.ServeHTTP(validResult, valid)
	if validResult.Code != http.StatusNoContent || provider.verified != "signed-token" {
		t.Fatalf("valid request: status=%d verified=%q", validResult.Code, provider.verified)
	}

	provider.verified = ""
	mismatch := httptest.NewRequest(http.MethodPost, "/", nil)
	mismatch.Header.Set("X-CSRF-Token", "attacker-token")
	mismatch.AddCookie(&http.Cookie{Name: "vps_csrf", Value: "browser-token"})
	mismatchResult := httptest.NewRecorder()
	engine.ServeHTTP(mismatchResult, mismatch)
	if mismatchResult.Code != http.StatusForbidden || provider.verified != "" {
		t.Fatalf("mismatch: status=%d verified=%q", mismatchResult.Code, provider.verified)
	}
}

func TestCSRFMiddlewareMapsVerifierFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	provider := &fakeCSRFProvider{verifyErr: errcode.CSRFRejected}
	engine := gin.New()
	engine.POST("/", CSRF(provider, "vps_csrf"), func(c *gin.Context) { c.Status(http.StatusNoContent) })
	request := httptest.NewRequest(http.MethodPost, "/", nil)
	request.Header.Set("X-CSRF-Token", "expired")
	request.AddCookie(&http.Cookie{Name: "vps_csrf", Value: "expired"})
	result := httptest.NewRecorder()
	engine.ServeHTTP(result, request)
	if result.Code != http.StatusForbidden {
		t.Fatalf("got %d", result.Code)
	}
}

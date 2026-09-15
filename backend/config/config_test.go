package config

import (
	"testing"
	"time"
)

func TestFrozenCacheTTLIsPositive(t *testing.T) {
	cfg := Config{Application: Application{Mode: "skeleton"}, HTTP: HTTP{CSRFTokenTTL: time.Hour, CSRFCookieName: "vps_csrf"}, Redis: Redis{FrozenCacheTTL: 0}, JWT: JWT{AccessTTL: time.Minute, RefreshTTL: time.Hour}, Database: Database{MaxOpenConns: 1}}
	if cfg.Validate() == nil {
		t.Fatal("zero frozen cache TTL must be rejected")
	}
}

func TestRuntimeRequiresStrongCSRFConfiguration(t *testing.T) {
	base := Config{Application: Application{Environment: "development", Mode: "runtime"}, HTTP: HTTP{CSRFTokenTTL: time.Hour, CSRFCookieName: "vps_csrf"}, Redis: Redis{Address: "localhost:6379", FrozenCacheTTL: time.Minute}, JWT: JWT{AccessSecret: "0123456789abcdef0123456789abcdef", RefreshSecret: "abcdef0123456789abcdef0123456789", AccessTTL: time.Minute, RefreshTTL: time.Hour}, Database: Database{URL: "postgres://example", MaxOpenConns: 1}}
	if base.Validate() == nil {
		t.Fatal("short CSRF secret must fail in runtime mode")
	}
	base.HTTP.CSRFSecret = "0123456789abcdef0123456789abcdef"
	if err := base.Validate(); err != nil {
		t.Fatalf("valid runtime CSRF config rejected: %v", err)
	}
	base.HTTP.CSRFCookieName = "__Host-vps_csrf"
	if base.Validate() == nil {
		t.Fatal("__Host- cookie without Secure must fail")
	}
}

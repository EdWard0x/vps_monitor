package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Application struct {
	Environment string
	Mode        string
}
type HTTP struct {
	Address          string
	FrontendOrigins  []string
	TrustedProxies   []string
	CSRFSecret       string
	CSRFTokenTTL     time.Duration
	CSRFCookieName   string
	CSRFCookieSecure bool
	RateLimitEnabled bool
	FlareResolverUrl string
}
type Database struct {
	URL          string
	MaxOpenConns int
	MaxIdleConns int
}
type Redis struct {
	Address        string
	Password       string
	DB             int
	FrozenCacheTTL time.Duration
	Stream         string
	ConsumerGroup  string
	ConsumerName   string
}
type JWT struct {
	AccessSecret    string
	RefreshSecret   string
	Issuer          string
	AccessAudience  string
	RefreshAudience string
	AccessTTL       time.Duration
	RefreshTTL      time.Duration
}
type Mail struct {
	Enabled  bool
	Host     string
	Port     int
	Username string
	Password string
	From     string
	TLSMode  string
	Timeout  time.Duration
}
type Worker struct {
	Enabled   bool
	ReadCount int64
	Block     time.Duration
}
type Logging struct {
	Level  string
	Format string
}
type Config struct {
	Application Application
	HTTP        HTTP
	Database    Database
	Redis       Redis
	JWT         JWT
	Mail        Mail
	Worker      Worker
	Logging     Logging
}

// Load 可选加载 .env，并把环境变量映射为显式配置组。
func Load() (Config, error) {
	_ = godotenv.Load(".env")
	applicationEnvironment := env("APP_ENV", "development")
	secureCookies := boolean("CSRF_COOKIE_SECURE", applicationEnvironment == "production")
	defaultCSRFCookieName := "vps_csrf"
	if secureCookies {
		defaultCSRFCookieName = "__Host-vps_csrf"
	}
	c := Config{
		Application: Application{Environment: applicationEnvironment, Mode: env("APP_MODE", "runtime")},
		HTTP: HTTP{
			Address:          env("HTTP_ADDR", ":8080"),
			FrontendOrigins:  csv("FRONTEND_ORIGINS"),
			TrustedProxies:   csv("TRUSTED_PROXIES"),
			CSRFSecret:       os.Getenv("CSRF_SECRET"),
			CSRFTokenTTL:     durationMinutes("CSRF_TOKEN_TTL_MINUTES", 120),
			CSRFCookieName:   env("CSRF_COOKIE_NAME", defaultCSRFCookieName),
			CSRFCookieSecure: secureCookies,
			RateLimitEnabled: boolean("RATE_LIMIT_ENABLED", true),
			FlareResolverUrl: env("FLARE_RESOLVER_URL", "http://localhost:8191/v1"),
		},
		Database: Database{
			URL:          os.Getenv("DATABASE_URL"),
			MaxOpenConns: integer("DB_MAX_OPEN_CONNS", 20),
			MaxIdleConns: integer("DB_MAX_IDLE_CONNS", 5),
		},
		Redis: Redis{
			Address:        env("REDIS_ADDR", "127.0.0.1:6379"),
			Password:       os.Getenv("REDIS_PASSWORD"),
			DB:             integer("REDIS_DB", 0),
			FrozenCacheTTL: durationSeconds("FROZEN_CACHE_TTL_SECONDS", 300),
			Stream:         env("STOCK_STREAM", "stock:observations"),
			ConsumerGroup:  env("STOCK_CONSUMER_GROUP", "vps-monitor"),
			ConsumerName:   env("STOCK_CONSUMER_NAME", "worker-1"),
		},
		JWT: JWT{
			AccessSecret:    os.Getenv("JWT_ACCESS_SECRET"),
			RefreshSecret:   os.Getenv("JWT_REFRESH_SECRET"),
			Issuer:          env("JWT_ISSUER", "vps-monitor"),
			AccessAudience:  env("JWT_ACCESS_AUDIENCE", "vps-monitor-api"),
			RefreshAudience: env("JWT_REFRESH_AUDIENCE", "vps-monitor-refresh"),
			AccessTTL:       durationMinutes("JWT_ACCESS_TTL_MINUTES", 15),
			RefreshTTL:      durationHours("JWT_REFRESH_TTL_HOURS", 168),
		},
		Mail: Mail{
			Enabled:  boolean("MAIL_ENABLED", false),
			Host:     os.Getenv("SMTP_HOST"),
			Port:     integer("SMTP_PORT", 587),
			Username: os.Getenv("SMTP_USERNAME"),
			Password: os.Getenv("SMTP_PASSWORD"),
			From:     os.Getenv("SMTP_FROM"),
			TLSMode:  env("SMTP_TLS_MODE", "starttls"),
			Timeout:  durationSeconds("SMTP_TIMEOUT_SECONDS", 10),
		},
		Worker: Worker{
			Enabled:   boolean("WORKER_ENABLED", false),
			ReadCount: int64(integer("WORKER_READ_COUNT", 10)),
			Block:     durationSeconds("WORKER_BLOCK_SECONDS", 5)},
		Logging: Logging{Level: env("LOG_LEVEL", "info"), Format: env("LOG_FORMAT", "json")},
	}
	if err := c.Validate(); err != nil {
		return Config{}, err
	}
	return c, nil
}

func (c Config) Validate() error {
	if c.Application.Mode != "skeleton" && c.Application.Mode != "runtime" {
		return errors.New("APP_MODE must be skeleton or runtime")
	}
	if c.Redis.FrozenCacheTTL <= 0 {
		return errors.New("FROZEN_CACHE_TTL_SECONDS must be positive")
	}
	if c.JWT.AccessTTL <= 0 || c.JWT.RefreshTTL <= 0 {
		return errors.New("JWT TTL values must be positive")
	}
	if c.HTTP.CSRFTokenTTL <= 0 {
		return errors.New("CSRF_TOKEN_TTL_MINUTES must be positive")
	}
	if strings.TrimSpace(c.HTTP.CSRFCookieName) == "" {
		return errors.New("CSRF_COOKIE_NAME must not be empty")
	}
	if strings.HasPrefix(c.HTTP.CSRFCookieName, "__Host-") && !c.HTTP.CSRFCookieSecure {
		return errors.New("a __Host- CSRF cookie requires CSRF_COOKIE_SECURE=true")
	}
	if c.Application.Environment == "production" && !c.HTTP.CSRFCookieSecure {
		return errors.New("production requires CSRF_COOKIE_SECURE=true")
	}
	if c.Application.Mode == "runtime" && len([]byte(c.HTTP.CSRFSecret)) < 32 {
		return errors.New("runtime requires CSRF_SECRET with at least 32 bytes")
	}
	if c.Application.Mode == "runtime" && (len([]byte(c.JWT.AccessSecret)) < 32 || len([]byte(c.JWT.RefreshSecret)) < 32) {
		return errors.New("runtime requires JWT secrets with at least 32 bytes")
	}
	if c.Application.Mode == "runtime" && c.JWT.AccessSecret == c.JWT.RefreshSecret {
		return errors.New("JWT access and refresh secrets must differ")
	}
	if c.Database.MaxOpenConns < 1 || c.Database.MaxIdleConns < 0 {
		return errors.New("database pool sizes are invalid")
	}
	if c.Application.Mode == "runtime" && (c.Database.URL == "" || c.Redis.Address == "") {
		return errors.New("runtime mode requires DATABASE_URL and REDIS_ADDR")
	}
	if c.Mail.Enabled {
		if c.Mail.Host == "" || c.Mail.From == "" || c.Mail.Port < 1 || c.Mail.Port > 65535 || c.Mail.Timeout <= 0 {
			return errors.New("mail requires SMTP_HOST, SMTP_FROM, valid SMTP_PORT and positive timeout")
		}
		if c.Mail.TLSMode != "starttls" && c.Mail.TLSMode != "tls" && c.Mail.TLSMode != "none" {
			return errors.New("SMTP_TLS_MODE must be starttls, tls or none")
		}
	}
	return nil
}

func env(k, d string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return d
}
func csv(k string) []string {
	raw := strings.TrimSpace(os.Getenv(k))
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
func integer(k string, d int) int {
	raw := strings.TrimSpace(os.Getenv(k))
	if raw == "" {
		return d
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return d
	}
	return v
}
func boolean(k string, d bool) bool {
	raw := strings.TrimSpace(os.Getenv(k))
	if raw == "" {
		return d
	}
	v, err := strconv.ParseBool(raw)
	if err != nil {
		return d
	}
	return v
}
func durationSeconds(k string, d int) time.Duration {
	return time.Duration(integer(k, d)) * time.Second
}
func durationMinutes(k string, d int) time.Duration {
	return time.Duration(integer(k, d)) * time.Minute
}
func durationHours(k string, d int) time.Duration { return time.Duration(integer(k, d)) * time.Hour }
func (c Config) String() string {
	return fmt.Sprintf("env=%s mode=%s http=%s", c.Application.Environment, c.Application.Mode, c.HTTP.Address)
}

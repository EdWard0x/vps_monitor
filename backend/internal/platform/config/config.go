package config

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Env, HTTPAddr, DatabaseURL, AccessSecret, RefreshSecret, Issuer, AccessAudience, RefreshAudience, CSRFSecret, CursorSecret, SearchBackend, Processor_Url string
	Origins, TrustedProxies                                                                                                                                  []string
	DemoMode                                                                                                                                                 bool
	DBMaxOpen, DBMaxIdle, WorkerScan, WorkerConcurrency, WorkerMerchantConcurrency                                                                           int
}

// Load 为 API、Worker 和管理员 CLI 加载配置。
// 注意当前实现要求工作目录存在 .env；文件不存在会直接返回错误。
// godotenv.Load 不覆盖已有进程环境变量，所以终端中的 $env:变量名 优先。
// cmd/migrate 和 cmd/seed 不调用本函数，需单独设置它们要求的环境变量。
func Load() (Config, error) {
	err := godotenv.Load(".env")
	if err != nil {
		slog.Error("failed to load .env file, proceeding with environment variables", "error", err)
	}
	c := Config{
		Env:          get("APP_ENV", "development"),
		HTTPAddr:     get("HTTP_ADDR", ":8080"),
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		AccessSecret: os.Getenv("JWT_ACCESS_SECRET"),
		//Processor_Url:    os.Getenv("PROCESSOR_URL"),
		RefreshSecret:   os.Getenv("JWT_REFRESH_SECRET"),
		Issuer:          get("JWT_ISSUER", "vps-monitor"),
		AccessAudience:  get("JWT_ACCESS_AUDIENCE", "vps-monitor-api"),
		RefreshAudience: get("JWT_REFRESH_AUDIENCE", "vps-monitor-refresh"),
		CSRFSecret:      os.Getenv("CSRF_SECRET"), CursorSecret: os.Getenv("CURSOR_SECRET"),
		SearchBackend: get("SEARCH_BACKEND", "sql"), Origins: split(os.Getenv("FRONTEND_ORIGINS")),
		TrustedProxies:            split(os.Getenv("TRUSTED_PROXIES")),
		DemoMode:                  boolean("DEMO_MODE", false),
		DBMaxOpen:                 number("DB_MAX_OPEN_CONNS", 20),
		DBMaxIdle:                 number("DB_MAX_IDLE_CONNS", 5),
		WorkerScan:                number("WORKER_SCAN_SECONDS", 5),
		WorkerConcurrency:         number("WORKER_CONCURRENCY", 10),
		WorkerMerchantConcurrency: number("WORKER_MERCHANT_CONCURRENCY", 2),
	}
	if c.DatabaseURL == "" {
		return c, fmt.Errorf("DATABASE_URL is required")
	}
	if len(c.AccessSecret) < 32 || len(c.RefreshSecret) < 32 || len(c.CSRFSecret) < 32 || len(c.CursorSecret) < 32 {
		return c, fmt.Errorf("JWT/CSRF/CURSOR secrets must each be at least 32 bytes")
	}
	if c.AccessSecret == c.RefreshSecret {
		return c, fmt.Errorf("JWT secrets must differ")
	}
	if c.SearchBackend != "sql" {
		return c, fmt.Errorf("SEARCH_BACKEND=%s is not implemented in the first release", c.SearchBackend)
	}
	if c.Env == "production" && c.DemoMode {
		return c, fmt.Errorf("DEMO_MODE is forbidden in production")
	}
	return c, nil
}
func get(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
func number(k string, d int) int {
	v, e := strconv.Atoi(os.Getenv(k))
	if e == nil && v > 0 {
		return v
	}
	return d
}
func boolean(k string, d bool) bool {
	v, e := strconv.ParseBool(os.Getenv(k))
	if e == nil {
		return v
	}
	return d
}
func split(s string) []string {
	var out []string
	for _, v := range strings.Split(s, ",") {
		if v = strings.TrimSpace(v); v != "" {
			out = append(out, v)
		}
	}
	return out
}

package initialize

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"vpsmonitor/api"
	"vpsmonitor/config"
	frozeiface "vpsmonitor/iface/froze"
	"vpsmonitor/middle"
	"vpsmonitor/router"
	"vpsmonitor/utils/redisfrozen"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type App struct {
	Config config.Config
	Engine *gin.Engine
	Server *http.Server
	Logger *slog.Logger
	sqlDB  *sql.DB
	redis  *RedisConnection
	ready  bool
}

func New(cfg config.Config) (*App, error) {
	logger := NewLogger(cfg.Logging)
	var raw *sql.DB
	var dbForServices *gorm.DB
	var redisConnection *RedisConnection
	var frozenCache frozeiface.Cache
	if cfg.Application.Mode == "runtime" {
		var err error
		dbForServices, raw, err = OpenDatabase(cfg.Database)
		if err != nil {
			return nil, err
		}
		redisConnection, err = OpenRedis(cfg.Redis)
		if err != nil {
			_ = raw.Close()
			return nil, err
		}
		frozenCache = redisfrozen.New(redisConnection.Client)
	}
	services := BuildServices(cfg, dbForServices, frozenCache)
	apis := api.NewGroup(
		services,
		api.CookieOptions{
			Name:   cfg.HTTP.CSRFCookieName,
			MaxAge: int(cfg.HTTP.CSRFTokenTTL / time.Second),
			Secure: cfg.HTTP.CSRFCookieSecure},
		api.CookieOptions{
			Name:   "vps_refresh",
			MaxAge: int(cfg.JWT.RefreshTTL / time.Second),
			Secure: cfg.HTTP.CSRFCookieSecure},
	)
	engine := gin.New()
	engine.Use(middle.RequestID(), middle.Logging(logger), middle.Recovery())
	if err := engine.SetTrustedProxies(cfg.HTTP.TrustedProxies); err != nil {
		if redisConnection != nil {
			_ = redisConnection.Close()
		}
		if raw != nil {
			_ = raw.Close()
		}
		return nil, err
	}
	engine.Use(middle.CORS(cfg.HTTP.FrontendOrigins))
	if cfg.HTTP.RateLimitEnabled {
		engine.Use(middle.RateLimit())
	}
	router.Init(
		engine,
		apis,
		router.Middleware{
			Authenticate: middle.Authenticate(services.Auth),
			Admin:        middle.RequireAdmin(),
			CSRF:         middle.CSRF(services.Auth, cfg.HTTP.CSRFCookieName)},
		func() bool {
			if raw == nil || redisConnection == nil {
				return false
			}
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			var migrationCount, firstVersion, lastVersion int
			if err := raw.QueryRowContext(ctx, "SELECT COUNT(*), COALESCE(MIN(version), 0), COALESCE(MAX(version), 0) FROM schema_migrations").Scan(&migrationCount, &firstVersion, &lastVersion); err != nil || migrationCount != 3 || firstVersion != 1 || lastVersion != 3 {
				return false
			}
			return redisConnection.Ping(ctx) == nil
		},
	)
	return &App{
		Config: cfg,
		Engine: engine,
		Server: &http.Server{Addr: cfg.HTTP.Address, Handler: engine, ReadHeaderTimeout: 5 * time.Second},
		Logger: logger,
		sqlDB:  raw,
		redis:  redisConnection,
		ready:  false,
	}, nil
}

func (a *App) Run(ctx context.Context) error {
	errCh := make(chan error, 1)
	go func() { errCh <- a.Server.ListenAndServe() }()
	select {
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return a.Server.Shutdown(shutdown)
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}
func (a *App) Close() error {
	if a.redis != nil {
		_ = a.redis.Close()
	}
	if a.sqlDB != nil {
		return a.sqlDB.Close()
	}
	return nil
}

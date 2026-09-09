package bootstrap

import (
	"context"
	"fmt"
	"vpsmonitor/internal/application"
	"vpsmonitor/internal/domain"
	"vpsmonitor/internal/infrastructure/collector"
	"vpsmonitor/internal/infrastructure/collector/akko"
	"vpsmonitor/internal/infrastructure/collector/dmit"
	"vpsmonitor/internal/infrastructure/database"
	"vpsmonitor/internal/infrastructure/persistence/gormrepo"
	"vpsmonitor/internal/infrastructure/security"
	"vpsmonitor/internal/platform/config"
	"vpsmonitor/internal/platform/pagination"
)

// Build 是依赖装配入口：创建具体实现，再把它们注入应用服务的接口字段。
// 例如 Repo 的声明是 ports.Repository，实际保存的是 *gormrepo.Store。
// Service 因而能调用仓储方法，无需自己创建数据库连接或导入 GORM。
func Build(ctx context.Context, c config.Config) (*application.Service, error) {
	db, e := database.Open(ctx, c.DatabaseURL, c.DBMaxOpen, c.DBMaxIdle)
	if e != nil {
		return nil, e
	}
	repo := gormrepo.New(db)
	// 这里只检查表结构版本；建表由 cmd/migrate 显式执行，启动不会自动迁移。
	var schemaVersion int64
	if e := db.Table("schema_migrations").Select("MAX(version)").Scan(&schemaVersion).Error; e != nil {
		return nil, fmt.Errorf("schema version check failed: %w", e)
	}
	if schemaVersion != 1 {
		return nil, fmt.Errorf("database schema version %d is unsupported; expected 1", schemaVersion)
	}
	if !c.DemoMode {
		var n int64
		if e := db.Model(&domain.MonitorConfig{}).Where("enabled=true AND collector_code='mock'").Count(&n).Error; e != nil {
			return nil, e
		}
		if n > 0 {
			return nil, fmt.Errorf("%d enabled mock monitor configuration(s) found while DEMO_MODE=false", n)
		}
	}
	//reg := collector.New(mock.Collector{Enabled: c.DemoMode})
	reg := collector.New(dmit.Collector{Enabled: true}, akko.Collector{Enabled: true})
	return &application.Service{
		Repo: repo,
		Tokens: security.Tokens{
			AccessSecret:    []byte(c.AccessSecret),
			RefreshSecret:   []byte(c.RefreshSecret),
			Issuer:          c.Issuer,
			AccessAudience:  c.AccessAudience,
			RefreshAudience: c.RefreshAudience,
		},
		Passwords:           security.Passwords{},
		CSRF:                security.CSRF{Secret: []byte(c.CSRFSecret)},
		Cursor:              pagination.Signer{Secret: []byte(c.CursorSecret)},
		Collectors:          reg,
		Demo:                c.DemoMode,
		MerchantConcurrency: c.WorkerMerchantConcurrency,
	}, nil
}

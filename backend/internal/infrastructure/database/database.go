package database

import (
	"context"
	"fmt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"net/url"
	"time"
)

// Open 校验 PostgreSQL URL、创建 GORM 连接、设置底层连接池并探测数据库。
// GORM 把方法链翻译为 SQL，sqlDB 管理实际连接；本函数不负责建表。
func Open(ctx context.Context, dsn string, maxOpen, maxIdle int) (*gorm.DB, error) {
	u, e := url.Parse(dsn)
	if e != nil {
		return nil, fmt.Errorf("parse database url: %w", e)
	}
	if u.Scheme != "postgres" && u.Scheme != "postgresql" {
		return nil, fmt.Errorf("database scheme %q unsupported in first release (PostgreSQL only)", u.Scheme)
	}
	db, e := gorm.Open(postgres.Open(dsn), &gorm.Config{TranslateError: true, Logger: logger.Default.LogMode(logger.Silent)})
	if e != nil {
		return nil, fmt.Errorf("open database: %w", e)
	}
	sqlDB, e := db.DB()
	if e != nil {
		return nil, e
	}
	sqlDB.SetMaxOpenConns(maxOpen)
	sqlDB.SetMaxIdleConns(maxIdle)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)
	if e = sqlDB.PingContext(ctx); e != nil {
		return nil, fmt.Errorf("ping database: %w", e)
	}
	return db, nil
}

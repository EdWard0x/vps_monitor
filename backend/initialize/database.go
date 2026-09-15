package initialize

import (
	"database/sql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"vpsmonitor/config"
)

func OpenDatabase(cfg config.Database) (*gorm.DB, *sql.DB, error) {
	db, err := gorm.Open(postgres.Open(cfg.URL), &gorm.Config{})
	if err != nil {
		return nil, nil, err
	}
	raw, err := db.DB()
	if err != nil {
		return nil, nil, err
	}
	raw.SetMaxOpenConns(cfg.MaxOpenConns)
	raw.SetMaxIdleConns(cfg.MaxIdleConns)
	if err := raw.Ping(); err != nil {
		_ = raw.Close()
		return nil, nil, err
	}
	return db, raw, nil
}

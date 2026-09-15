package initialize

import (
	"log/slog"
	"os"
	"vpsmonitor/config"
)

func NewLogger(cfg config.Logging) *slog.Logger {
	level := slog.LevelInfo
	if cfg.Level == "debug" {
		level = slog.LevelDebug
	}
	options := &slog.HandlerOptions{Level: level}
	if cfg.Format == "text" {
		return slog.New(slog.NewTextHandler(os.Stdout, options))
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, options))
}

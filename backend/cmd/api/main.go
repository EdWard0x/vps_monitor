package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"
	"vpsmonitor/config"
	"vpsmonitor/initialize"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	app, err := initialize.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer app.Close()
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	app.Logger.Info("api_starting", "config", cfg.String())
	if err := app.Run(ctx); err != nil {
		log.Fatal(err)
	}
}

package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"
	"vpsmonitor/config"
	"vpsmonitor/task"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	consumer := &task.StockConsumer{
		Enabled: cfg.Worker.Enabled,
	}
	if err := consumer.Run(ctx); err != nil {
		log.Fatal(err)
	}
	<-ctx.Done()
}

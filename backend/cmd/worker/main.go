package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"
	"vpsmonitor/config"
	ifacecollect "vpsmonitor/iface/collect"
	messageiface "vpsmonitor/iface/message"
	"vpsmonitor/initialize"
	"vpsmonitor/service"
	"vpsmonitor/task"
	utilcollect "vpsmonitor/utils/collect"
	"vpsmonitor/utils/redisstream"

	"github.com/redis/go-redis/v9"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	redisClient := redis.NewClient(&redis.Options{
		Addr:     cfg.Redis.Address,
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	})
	defer redisClient.Close()
	redisstreamClient := redisstream.New(redisClient)
	gormDb, sqlDb, _ := initialize.OpenDatabase(cfg.Database)
	defer sqlDb.Close()
	stockSvc := service.NewStockService(gormDb)

	dmitCollect := utilcollect.DmitCollector{Enabled: true}
	akkoCollect := utilcollect.AkkoCollector{Enabled: true}

	option := messageiface.ReadOptions{
		Stream:   cfg.Redis.Stream,
		Group:    cfg.Redis.ConsumerGroup,
		Consumer: cfg.Redis.ConsumerName,
		Count:    cfg.Worker.ReadCount,
		Block:    cfg.Worker.Block,
	}
	consumer := &task.StockConsumer{
		Enabled:      cfg.Worker.Enabled,
		Reader:       redisstreamClient,
		Acknowledger: redisstreamClient,
		Service:      stockSvc,
		Options:      option,
		Collect:      []ifacecollect.Collector{dmitCollect, akkoCollect},
	}
	if err := consumer.Run(ctx); err != nil {
		log.Fatal(err)
	}

}

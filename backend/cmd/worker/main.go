package main

import (
	"context"
	"log"
	"os/signal"
	"strings"
	"syscall"
	"time"
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

	vpsService := service.NewVPSService(gormDb)

	option := messageiface.ReadOptions{
		Stream:   cfg.Redis.Stream,
		Group:    cfg.Redis.ConsumerGroup,
		Consumer: cfg.Redis.ConsumerName,
		Count:    cfg.Worker.ReadCount,
		Block:    cfg.Worker.Block,
	}
	consumer := &task.StockConsumer{
		Enabled:          cfg.Worker.Enabled,
		FlareResolverUrl: cfg.HTTP.FlareResolverUrl,
		Reader:           redisstreamClient,
		Acknowledger:     redisstreamClient,
		Service:          stockSvc,
		Options:          option,
		Collect:          []ifacecollect.Collector{dmitCollect, akkoCollect},
		Reclaimer:        redisstreamClient,
	}

	scheduler := &task.CollectionScheduler{
		Enabled:  cfg.Worker.Enabled,
		Interval: time.Minute,
		Stream:   cfg.Redis.Stream,
		VPS:      vpsService,
		Producer: redisstreamClient,
	}
	err = redisstreamClient.Redis.XGroupCreateMkStream(ctx, cfg.Redis.Stream, cfg.Redis.ConsumerGroup, "$").Err()
	if err != nil && !strings.Contains(err.Error(), "BUSYGROUP") {
		log.Printf("Error creating stream %s: %v", cfg.Redis.Stream, err)
		return
	}

	go func() {
		err := scheduler.Run(ctx)
		if err != nil {
			log.Printf("scheduler stopped: %v", err)
		}
	}()

	go func() {
		err := consumer.Run(ctx)
		if err != nil {
			log.Printf("consumer stopped: %v", err)
		}
	}()
	go func() {
		if err := consumer.RecoverPending(ctx); err != nil {
			log.Printf("pending recovery stopped: %v", err)
		}
	}()
	<-ctx.Done()
}

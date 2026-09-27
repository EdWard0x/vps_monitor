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
	redisStreamClient := redisstream.New(redisClient)
	gormDb, sqlDb, err := initialize.OpenDatabase(cfg.Database)
	if err != nil {
		log.Fatal(err)
	}
	defer sqlDb.Close()
	stockSvc := service.NewStockService(gormDb)

	dmitCollect := utilcollect.DmitCollector{Enabled: true}
	akkoCollect := utilcollect.AkkoCollector{Enabled: true}

	vpsService := service.NewVPSService(gormDb, redisStreamClient.Redis)

	stockOption := messageiface.ReadOptions{
		Stream:   cfg.Redis.StockStream,
		Group:    cfg.Redis.StockConsumerGroup,
		Consumer: cfg.Redis.StockConsumerName,
		Count:    cfg.Worker.ReadCount,
		Block:    cfg.Worker.Block,
	}
	stockConsumer := &task.StockConsumer{
		Enabled:          cfg.Worker.Enabled,
		FlareResolverUrl: cfg.HTTP.FlareResolverUrl,
		Reader:           redisStreamClient,
		Acknowledger:     redisStreamClient,
		Service:          stockSvc,
		Options:          stockOption,
		Collect:          []ifacecollect.Collector{dmitCollect, akkoCollect},
		Reclaimer:        redisStreamClient,
	}
	noticeOption := messageiface.ReadOptions{
		Stream:         cfg.Redis.NoticeStream,
		Group:          cfg.Redis.NoticeConsumerGroup,
		Consumer:       cfg.Redis.NoticeConsumerName,
		Count:          cfg.Worker.ReadCount,
		Block:          cfg.Worker.Block,
		NoticeDuration: cfg.Worker.NoticeDuration,
	}
	noticeConsumer := &task.NoticeConsumer{
		Enabled:      cfg.Worker.Enabled,
		Reader:       redisStreamClient,
		Acknowledger: redisStreamClient,
		Service:      stockSvc,
		Options:      noticeOption,
		Reclaimer:    redisStreamClient,
	}

	collectScheduler := &task.CollectionScheduler{
		Enabled:  cfg.Worker.Enabled,
		Interval: time.Minute * 5,
		Stream:   cfg.Redis.StockStream,
		VPS:      vpsService,
		Producer: redisStreamClient,
	}
	noticeScheduler := &task.NoticeScheduler{
		Enabled:  cfg.Worker.Enabled,
		Interval: time.Minute * 2,
		Stream:   cfg.Redis.NoticeStream,
		VPS:      vpsService,
		Producer: redisStreamClient,
	}
	err = redisStreamClient.Redis.XGroupCreateMkStream(ctx, cfg.Redis.StockStream, cfg.Redis.StockConsumerGroup, "$").Err()
	if err != nil && !strings.Contains(err.Error(), "BUSYGROUP") {
		log.Printf("Error creating stream %s: %v", cfg.Redis.StockStream, err)
		return
	}
	err = redisStreamClient.Redis.XGroupCreateMkStream(ctx, cfg.Redis.NoticeStream, cfg.Redis.NoticeConsumerGroup, "$").Err()
	if err != nil && !strings.Contains(err.Error(), "BUSYGROUP") {
		log.Printf("Error creating stream %s: %v", cfg.Redis.StockStream, err)
		return
	}

	//监控vps collect开启状态，推送消息
	go func() {
		err := collectScheduler.Run(ctx)
		if err != nil {
			log.Printf("scheduler stopped: %v", err)
		}
	}()
	//消费vps collect
	go func() {
		err := stockConsumer.Run(ctx)
		if err != nil {
			log.Printf("consumer stopped: %v", err)
		}
	}()
	//处理vps collect pending消息
	go func() {
		if err := stockConsumer.RecoverPending(ctx); err != nil {
			log.Printf("pending recovery stopped: %v", err)
		}
	}()

	//监控用户通知开启状态，推送消息
	go func() {
		err := noticeScheduler.Run(ctx)
		if err != nil {
			log.Printf("scheduler stopped: %v", err)
		}
	}()
	//消费notice
	go func() {
		err := noticeConsumer.Run(ctx)
		if err != nil {
			log.Printf("consumer stopped: %v", err)
		}
	}()
	//处理notice pending消息
	go func() {
		if err := noticeConsumer.RecoverPending(ctx); err != nil {
			log.Printf("pending recovery stopped: %v", err)
		}
	}()

	select {
	case <-ctx.Done():
	}
}

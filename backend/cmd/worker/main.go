package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"
	"vpsmonitor/internal/bootstrap"
	"vpsmonitor/internal/platform/config"
)

// main 启动独立于 API 的监控进程；它不接收 HTTP 请求，而是定期扫描数据库。
// API 修改监控配置，Worker 读取配置、调用采集器并写回库存，两者通过数据库协作。
func main() {
	c, e := config.Load()
	if e != nil {
		slog.Error("configuration invalid", "error", e)
		os.Exit(1)
	}
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	svc, e := bootstrap.Build(ctx, c)
	if e != nil {
		slog.Error("startup failed", "error", e)
		os.Exit(1)
	}
	ticker := time.NewTicker(time.Duration(c.WorkerScan) * time.Second)
	defer ticker.Stop()
	// 每批完成后才进入下一轮；RunWorkerOnce 内部负责同一批任务的并发。
	for {
		//fmt.Println("进入for死循环")
		if e := svc.RunWorkerOnce(ctx, c.WorkerConcurrency); e != nil {
			slog.Error("worker scan failed", "error", e)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

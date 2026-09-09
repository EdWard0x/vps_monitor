package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	"vpsmonitor/internal/bootstrap"
	"vpsmonitor/internal/platform/config"
	"vpsmonitor/internal/transport/httpapi"
)

// main 是 HTTP 服务入口：加载配置 → 装配依赖 → 注册路由 → 开始监听。
// 第一次阅读可先跟到 httpapi.New，再追踪一个商家列表请求。
func main() {
	//err := godotenv.Load(".env")
	//if err != nil {
	//	slog.Error("failed to load .env file, proceeding with environment variables", "error", err)
	//}
	c, e := config.Load()
	if e != nil {
		slog.Error("configuration invalid", "error", e)
		os.Exit(1)
	}
	svc, e := bootstrap.Build(context.Background(), c)
	if e != nil {
		slog.Error("startup failed", "error", e)
		os.Exit(1)
	}
	server := &http.Server{
		Addr:              c.HTTPAddr,
		Handler:           httpapi.New(&httpapi.API{S: svc, Env: c.Env, Origins: c.Origins, TrustedProxies: c.TrustedProxies}),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
		WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second,
	}
	// 监听会阻塞，所以放到 goroutine；主 goroutine 留下来等待退出信号。
	go func() {
		slog.Info("api listening", "addr", c.HTTPAddr)
		if e := server.ListenAndServe(); e != nil && !errors.Is(e, http.ErrServerClosed) {
			slog.Error("api failed", "error", e)
			os.Exit(1)
		}
	}()
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	// 收到 Ctrl+C 后给正在处理的请求最多 10 秒收尾，而非立刻切断连接。
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(ctx)
}

package task

import (
	"context"
	"encoding/json"
	"log"
	"time"
	enqueueiface "vpsmonitor/iface/enqueue"
	"vpsmonitor/service"
)

type NoticeScheduler struct {
	Enabled  bool
	Interval time.Duration
	Stream   string
	VPS      *service.VPSService
	Producer enqueueiface.Producer
}

func (c *NoticeScheduler) dispatch(ctx context.Context) error {
	userTargets, err := c.VPS.ListNoticeEnabledUserTargets(ctx)
	if err != nil {
		return err
	}
	noticeEnabledTask, err := c.VPS.ListVpsWithNoticeEnabledTargets(ctx, userTargets)
	if err != nil {
		return err
	}
	//推送下发通知消息
	for _, task := range noticeEnabledTask {
		marshal, err := json.Marshal(task)
		if err != nil {
			return err
		}
		_, err = c.Producer.Enqueue(ctx, c.Stream, marshal)
		if err != nil {
			return err
		}
	}
	return nil
}

func (c *NoticeScheduler) Run(ctx context.Context) error {
	if !c.Enabled {
		return nil
	}

	// 启动后立即调度一次，不必先等一分钟。
	if err := c.dispatch(ctx); err != nil {
		return err
	}

	ticker := time.NewTicker(c.Interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil

		case <-ticker.C:
			if err := c.dispatch(ctx); err != nil {
				// 一次扫描失败不一定要结束整个调度器。
				log.Printf("dispatch collection tasks: %v", err)
			}
		}
	}
}

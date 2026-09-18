package task

import (
	"context"
	"encoding/json"
	"log"
	"time"
	enqueueiface "vpsmonitor/iface/enqueue"
	"vpsmonitor/service"
)

type CollectionScheduler struct {
	Enabled  bool
	Interval time.Duration
	Stream   string
	VPS      *service.VPSService
	Producer enqueueiface.Producer
}

func (c *CollectionScheduler) dispatch(ctx context.Context) error {
	targets, err := c.VPS.ListCollectionTargets(ctx)
	if err != nil {
		return err
	}
	for _, target := range targets {
		payload, err := json.Marshal(target)
		//fmt.Println(string(payload))
		if err != nil {
			return err
		}
		_, err = c.Producer.Enqueue(ctx, c.Stream, payload)
		if err != nil {
			return err
		}
	}
	return nil
}

func (c *CollectionScheduler) Run(ctx context.Context) error {
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

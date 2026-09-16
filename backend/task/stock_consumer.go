package task

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	collectiface "vpsmonitor/iface/collect"
	messageiface "vpsmonitor/iface/message"
	"vpsmonitor/model/errcode"
	"vpsmonitor/service"

	"github.com/redis/go-redis/v9"
)

type StockConsumer struct {
	Enabled      bool
	Reader       messageiface.Reader
	Acknowledger messageiface.Acknowledger
	Service      *service.StockService
	Options      messageiface.ReadOptions
	Collect      []collectiface.Collector
}

// Run 默认不读取消息；启用后在处理和确认语义完成前也拒绝消费，防止真实消息丢失。
func (c *StockConsumer) Run(ctx context.Context) error {
	if !c.Enabled {
		return nil
	}

	for {
		var wg sync.WaitGroup
		delivery, err := c.Reader.Read(ctx, c.Options)
		if errors.Is(err, redis.Nil) {
			continue
		}
		if err != nil {
			return err
		}
		for _, d := range delivery {
			wg.Add(1)
			go func() {
				defer wg.Done()
				var p struct {
					Id           string `json:"id"`
					MerchantCode string `json:"merchant"`
					Url          string `json:"url"`
				}
				err := json.Unmarshal(d.Payload, &p)
				if err != nil {
					return
				}
				for _, collector := range c.Collect {
					if !collector.Available() {
						continue
					}
					if collector.Code() != p.MerchantCode {
						continue
					}
					observation, err := collector.Collect(ctx, collectiface.CollectRequest{
						SourceURL:    p.Url,
						ProcessorURL: "https://127.0.0.1:8080/flare-resolver",
					})
					if err != nil {
						return
					}
					err = c.Service.UpdateStock(ctx, p.Id, p.MerchantCode, observation)
					if err != nil {
						return
					}
				}
				if err := c.Acknowledger.Ack(ctx, c.Options, d.ID); err != nil {
					return
				}
			}()
		}
		wg.Wait()
	}

	return errcode.NotImplemented
}

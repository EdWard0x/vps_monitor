package task

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"
	collectiface "vpsmonitor/iface/collect"
	messageiface "vpsmonitor/iface/message"
	"vpsmonitor/model/dto"
	"vpsmonitor/model/errcode"
	"vpsmonitor/service"

	"github.com/redis/go-redis/v9"
)

type StockConsumer struct {
	Enabled          bool
	FlareResolverUrl string
	Reader           messageiface.Reader
	Acknowledger     messageiface.Acknowledger
	Service          *service.StockService
	Options          messageiface.ReadOptions
	Collect          []collectiface.Collector
	Reclaimer        messageiface.Reclaimer
}

// Run 默认不读取消息；启用后在处理和确认语义完成前也拒绝消费，防止真实消息丢失。
func (c *StockConsumer) Run(ctx context.Context) error {
	if !c.Enabled {
		return nil
	}

	for {
		deliveries, err := c.Reader.Read(ctx, c.Options)
		if errors.Is(err, redis.Nil) {
			continue
		}
		if err != nil {
			return err
		}
		for _, delivery := range deliveries {
			if err := c.processDelivery(ctx, delivery); err != nil {
				log.Printf("process message id=%s: %v", delivery.ID, err)
			}
		}
	}

}
func (c *StockConsumer) RecoverPending(ctx context.Context) error {
	if !c.Enabled {
		return nil
	}
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil

		case <-ticker.C:
			start := "0-0"
			for {
				msgs, nextStart, err := c.Reclaimer.AutoClaim(ctx, messageiface.ClaimOptions{
					Stream:   c.Options.Stream,
					Group:    c.Options.Group,
					Consumer: c.Options.Consumer + "-recovery",
					MinIdle:  1 * time.Minute,
					Start:    start,
					Count:    5,
				})
				if err != nil {
					log.Printf("auto claim: %v", err)
					break
				}
				for _, msg := range msgs {
					//if err := c.processDelivery(ctx, msg); err != nil {
					//	log.Printf("process claimed message id=%s: %v", msg.ID, err)
					//}

					//由于pending消息不适合再进行一次业务处理，否则会多次触发网站风控，选择直接ack
					err := c.Acknowledger.Ack(ctx, c.Options, msg.ID)
					if err != nil {
						log.Printf("pending message ack failed, message id=%s: %v", msg.ID, err)
					}
				}
				if nextStart == "0-0" {
					break
				}
				start = nextStart
			}
		}
	}
}

// 拿到消息进行对应业务逻辑处理
func (c *StockConsumer) processDelivery(ctx context.Context, delivery messageiface.Delivery) error {
	var p dto.CollectionTask
	err := json.Unmarshal(delivery.Payload, &p)
	if err != nil {
		return err
	}
	for _, collector := range c.Collect {
		if !collector.Available() {
			continue
		}
		if collector.Code() != p.MerchantCode {
			continue
		}
		observation, err := collector.Collect(ctx, collectiface.CollectRequest{
			SourceURL:    p.SourceURL,
			ProcessorURL: c.FlareResolverUrl,
		})
		if err != nil {
			if errors.Is(err, errcode.FlareResolveFailed) { //如果是flare解析错误，直接判定为是被短暂风控，不进行处理，让消息自动claim交给下一个消费者
				return errcode.FlareResolveFailed
			} else if errors.Is(err, errcode.QueryHtmlFailed) { //如果是goquery解析html错误，则表示网页结构发生变化，需要将消息ack，并且将错误抛出，上层判断该错误并结束此次逻辑，重新调整代码
				if err := c.Acknowledger.Ack(ctx, c.Options, delivery.ID); err != nil {
					return err
				}
				return errcode.QueryHtmlFailed
			}
			return fmt.Errorf("collect stock: %w", err) //其他不可预计错误
		}
		err = c.Service.UpdateStock(ctx, p.VpsId, p.MerchantCode, observation, delivery.ID)
		if err != nil {
			return fmt.Errorf("update stock: %w", err)
		}
	}

	if err := c.Acknowledger.Ack(ctx, c.Options, delivery.ID); err != nil {
		return err
	}
	return nil
}

func (c *StockConsumer) discard(ctx context.Context, delivery messageiface.Delivery, cause error) error {
	log.Printf(
		"discard collection task id=%s: %v",
		delivery.ID,
		cause,
	)

	if err := c.Acknowledger.Ack(ctx, c.Options, delivery.ID); err != nil {
		log.Printf("ack discarded task id=%s: %v", delivery.ID, err)
		return err
	}

	//if err := c.Acknowledger.Del(ctx, c.Options, delivery.ID, ); err != nil {
	//	// ACK 已经成功，DEL 失败只代表清理失败。
	//	// 消息不会重新进入消费流程，可以等待 MAXLEN 清理。
	//	log.Printf("delete discarded task id=%s: %v", delivery.ID, err)
	//}
	return nil
}

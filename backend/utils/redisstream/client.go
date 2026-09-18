package redisstream

import (
	"context"
	"fmt"
	messageiface "vpsmonitor/iface/message"

	"github.com/redis/go-redis/v9"
)

// Client 是 Redis Streams 外壳；骨架不会读取或确认真实消息。
type Client struct{ Redis *redis.Client }

func New(client *redis.Client) *Client { return &Client{Redis: client} }

func (c Client) Read(ctx context.Context, msg messageiface.ReadOptions) ([]messageiface.Delivery, error) {
	delivery := make([]messageiface.Delivery, 0)
	xreadGroup := c.Redis.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    msg.Group,
		Consumer: msg.Consumer,
		Streams:  []string{msg.Stream, ">"},
		Block:    msg.Block,
		Count:    msg.Count,
	})
	res, err := xreadGroup.Result()
	if err != nil {
		return nil, err
	}
	for _, msg := range res {
		for _, m := range msg.Messages {
			//fmt.Println("m: ", m)
			delivery = append(delivery, messageiface.Delivery{
				ID:      m.ID,
				Payload: []byte(m.Values["payload"].(string)),
			})
		}
	}
	//fmt.Printf("%v", delivery)
	return delivery, nil
}
func (c Client) Ack(ctx context.Context, msg messageiface.ReadOptions, id string) error {
	i, err := c.Redis.XAck(ctx, msg.Stream, msg.Group, id).Result()
	if err != nil {
		return err
	}
	if i == 0 {
		return fmt.Errorf("acknowledge failed for message ID %s", id)
	}

	return nil
}
func (c Client) Del(ctx context.Context, msg messageiface.ReadOptions, id string) error {
	result, err := c.Redis.XDel(ctx, msg.Stream, id).Result()
	if err != nil {
		return err
	}
	if result == 0 {
		return fmt.Errorf("delete failed for message ID %s", id)
	}
	return nil
}
func (c Client) Enqueue(ctx context.Context, stream string, payload []byte) (string, error) {
	id, err := c.Redis.XAdd(ctx, &redis.XAddArgs{
		Stream: stream,
		// 可选：最多保留约 10000 条历史消息。
		MaxLen: 10000,
		Approx: true,
		Values: map[string]any{
			"payload": string(payload),
		},
	}).Result()
	if err != nil {
		return "", fmt.Errorf("add message to stream %s: %w", stream, err)
	}
	return id, nil
}

// AutoClaim 处理pending状态消息，返回对应消息列表和cursor起始ID
func (c Client) AutoClaim(ctx context.Context, op messageiface.ClaimOptions) ([]messageiface.Delivery, string, error) {
	messages, nextStart, err := c.Redis.XAutoClaim(ctx, &redis.XAutoClaimArgs{
		Stream:   op.Stream,
		Group:    op.Group,
		MinIdle:  op.MinIdle,
		Start:    op.Start,
		Count:    op.Count,
		Consumer: op.Consumer,
	}).Result()
	if err != nil {
		return nil, op.Start, err
	}
	deliveries := make([]messageiface.Delivery, 0, len(messages))
	for _, message := range messages {
		payload, ok := message.Values["payload"].(string)
		if !ok {
			return nil, nextStart, fmt.Errorf("message %s payload is not string", message.ID)
		}

		deliveries = append(deliveries, messageiface.Delivery{
			ID:      message.ID,
			Payload: []byte(payload),
		})
	}
	return deliveries, nextStart, nil
}

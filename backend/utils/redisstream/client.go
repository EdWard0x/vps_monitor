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
			delivery = append(delivery, messageiface.Delivery{
				ID:      m.ID,
				Payload: []byte(fmt.Sprintf("%v", m.Values)),
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
	result, err := c.Redis.XDel(ctx, msg.Stream, id).Result()
	if err != nil {
		return err
	}
	if result == 0 {
		return fmt.Errorf("delete failed for message ID %s", id)
	}
	return nil
}

package redisstream

import (
	"context"

	messageiface "vpsmonitor/iface/message"
	"vpsmonitor/model/errcode"

	"github.com/redis/go-redis/v9"
)

// Client 是 Redis Streams 外壳；骨架不会读取或确认真实消息。
type Client struct{ Redis *redis.Client }

func New(client *redis.Client) *Client { return &Client{Redis: client} }
func (c Client) Read(ctx context.Context, msg messageiface.ReadOptions) ([]messageiface.Delivery, error) {
	return nil, errcode.NotImplemented
}
func (Client) Ack(context.Context, string) error { return errcode.NotImplemented }

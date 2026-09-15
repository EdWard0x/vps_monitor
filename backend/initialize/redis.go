package initialize

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
	"vpsmonitor/config"
)

type RedisConnection struct{ Client *redis.Client }

func OpenRedis(cfg config.Redis) (*RedisConnection, error) {
	client := redis.NewClient(&redis.Options{Addr: cfg.Address, Password: cfg.Password, DB: cfg.DB})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return nil, err
	}
	return &RedisConnection{Client: client}, nil
}
func (r *RedisConnection) Ping(ctx context.Context) error { return r.Client.Ping(ctx).Err() }
func (r *RedisConnection) Close() error {
	if r == nil || r.Client == nil {
		return nil
	}
	return r.Client.Close()
}

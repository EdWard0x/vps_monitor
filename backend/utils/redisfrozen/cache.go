package redisfrozen

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

type Cache struct{ Client *redis.Client }

func New(client *redis.Client) *Cache { return &Cache{Client: client} }
func key(userID string) string        { return "auth:frozen:" + userID }
func (c *Cache) Exists(ctx context.Context, userID string) (bool, error) {
	count, err := c.Client.Exists(ctx, key(userID)).Result()
	return count > 0, err
}
func (c *Cache) Set(ctx context.Context, userID string, ttl time.Duration) error {
	return c.Client.Set(ctx, key(userID), "1", ttl).Err()
}
func (c *Cache) Delete(ctx context.Context, userID string) error {
	return c.Client.Del(ctx, key(userID)).Err()
}

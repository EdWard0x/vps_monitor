package redisstream

import (
	"context"
	"fmt"
	"testing"

	"github.com/redis/go-redis/v9"
)

func TestClient_Read(t *testing.T) {

	redisstream_client := New(redis.NewClient(&redis.Options{
		Addr:     "127.0.0.1:6379",
		Password: "123456",
		DB:       0,
	}))

	defer redisstream_client.Redis.Close()
	for {
		xr := redisstream_client.Redis.XReadGroup(context.Background(), &redis.XReadGroupArgs{
			Group:    "mygroup1",
			Consumer: "myconsumer1",
			Streams:  []string{"stock:observations", ">"},
			Block:    0,
			Count:    1,
		})
		msgs, err := xr.Result()
		if err != nil {
			panic(err)
		}
		for _, msg := range msgs {
			fmt.Printf("stream: %s\n", msg.Stream)
			for _, m := range msg.Messages {
				fmt.Printf("id: %s, values: %v\n", m.ID, m.Values)
			}
		}
	}
}

func TestClient_Pub(t *testing.T) {
	redisstream_client := redis.NewClient(&redis.Options{
		Addr:     "127.0.0.1:6379",
		Password: "123456",
		DB:       0,
	})
	err := redisstream_client.Publish(context.Background(), "stock:observations", "payload").Err()
	if err != nil {
		panic(err)
	}
}

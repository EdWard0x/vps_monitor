package enqueue

import (
	"context"
)

type Producer interface {
	/*
		发送消息，返回消息id
	*/
	Enqueue(ctx context.Context, stream string, payload []byte) (string, error)
}

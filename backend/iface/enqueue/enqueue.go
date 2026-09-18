package enqueue

import (
	"context"
)

type Producer interface {
	Enqueue(ctx context.Context, stream string, payload []byte) (string, error)
}

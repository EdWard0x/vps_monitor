package message

import (
	"context"
	"time"
)

type ReadOptions struct {
	Stream   string
	Group    string
	Consumer string
	Count    int64
	Block    time.Duration
}

type Delivery struct {
	ID      string
	Payload []byte
}

type Reader interface {
	Read(context.Context, ReadOptions) ([]Delivery, error)
}
type Acknowledger interface {
	Ack(context.Context, ReadOptions, string) error
	Del(context.Context, ReadOptions, string) error
}

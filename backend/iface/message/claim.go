package message

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

type ClaimOptions struct {
	Stream   string
	Group    string
	Consumer string
	MinIdle  time.Duration
	Start    string
	Count    int64
}
type PendingOptions struct {
	Stream   string
	Group    string
	Idle     time.Duration
	Start    string
	End      string
	Count    int64
	Consumer string
}

type Reclaimer interface {
	AutoClaim(context.Context, ClaimOptions) ([]Delivery, string, error)
	GetPending(context.Context, PendingOptions) ([]redis.XPendingExt, error)
}

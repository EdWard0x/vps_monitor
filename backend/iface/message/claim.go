package message

import (
	"context"
	"time"
)

type ClaimOptions struct {
	Stream   string
	Group    string
	Consumer string
	MinIdle  time.Duration
	Start    string
	Count    int64
}

type Reclaimer interface {
	AutoClaim(context.Context, ClaimOptions) ([]Delivery, string, error)
}

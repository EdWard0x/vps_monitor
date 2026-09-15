package froze

import (
	"context"
	"time"
)

type Checker interface {
	Check(context.Context, string) error
}

type Cache interface {
	Exists(context.Context, string) (bool, error)
	Set(context.Context, string, time.Duration) error
	Delete(context.Context, string) error
}

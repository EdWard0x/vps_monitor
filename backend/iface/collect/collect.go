package collect

import "context"

type Collector interface {
	Code() string
	Name() string
	Available() bool
	Collect(ctx context.Context, r CollectRequest) (Observation, error)
}

type CollectRequest struct {
	SourceURL    string
	ProcessorURL string
}

type Observation struct {
	Quantity *int `json:"quantity,omitempty"`
	InStock  bool `json:"in_stock,omitempty"` // Quantity 为空时，明确表示有货但数量未知。
}

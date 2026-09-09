package mock

import (
	"context"
	"vpsmonitor/internal/domain"
	"vpsmonitor/internal/ports"
)

// Collector 是确定性的演示采集器：只看套餐 code，不访问 SourceURL 或真实商家网站。
// 两个已知 code 返回有货/无货，其余返回未知，方便学习和测试，不代表真实库存。
type Collector struct{ Enabled bool }

func (c Collector) Code() string    { return "mock" }
func (c Collector) Name() string    { return "Mock Collector" }
func (c Collector) Available() bool { return c.Enabled }
func (c Collector) Collect(_ context.Context, r ports.CollectRequest) (domain.Observation, error) {
	if !c.Enabled {
		return domain.Observation{Status: 3, ErrorCode: "SOURCE_URL_REJECTED"}, nil
	}
	switch r.Code {
	case "demo-lax-mini":
		q := 5
		return domain.Observation{Status: 1, Quantity: &q}, nil
	case "demo-hkg-standard":
		q := 0
		return domain.Observation{Status: 2, Quantity: &q}, nil
	default:
		return domain.Observation{Status: 3, ErrorCode: "PARSE_UNRECOGNIZED"}, nil
	}
}

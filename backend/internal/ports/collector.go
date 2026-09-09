package ports

import (
	"context"
	"vpsmonitor/internal/domain"
)

type CollectRequest struct {
	VPSID           int64
	Code, SourceURL string
}

// Collector 是库存采集器约定：根据套餐信息返回一次观测，不负责写数据库。
// ctx 用来传递任务取消和超时；真实采集器应把它传给网络请求。
type Collector interface {
	Code() string
	Name() string
	Available() bool
	Collect(context.Context, CollectRequest) (domain.Observation, error)
}
type CollectorRegistry interface {
	Get(string) (Collector, bool)
	List() []Collector
}

package dto

import "time"

// StockObservation 是外部采集程序写入 Redis Stream 的稳定边界。
// ObservationVersion 由同一 source/vps_id 组合单调递增；具体来源映射待实现。
type StockObservation struct {
	SchemaVersion      string    `json:"schema_version"`
	EventID            string    `json:"event_id"`
	Source             string    `json:"source"`
	VPSID              string    `json:"vps_id"`
	ObservedAt         time.Time `json:"observed_at"`
	ObservationVersion uint64    `json:"observation_version"`
	Status             int       `json:"status"`
	Quantity           *int      `json:"quantity"`
}

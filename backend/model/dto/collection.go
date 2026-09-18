package dto

import "time"

type CollectionTask struct {
	VpsId        string    `json:"vps_id"`
	MerchantCode string    `json:"merchant_code"`
	SourceURL    string    `json:"source_url"`
	ScheduledAt  time.Time `json:"scheduled_at"`
}

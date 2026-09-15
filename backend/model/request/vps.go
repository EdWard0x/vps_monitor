package request

type VPSEditable struct {
	MerchantID        string `json:"merchant_id" binding:"required"`
	Code              string `json:"code" binding:"required"`
	Name              string `json:"name" binding:"required"`
	Description       string `json:"description"`
	CPUCores          int    `json:"cpu_cores"`
	MemoryMB          int    `json:"memory_mb"`
	DiskGB            int    `json:"disk_gb"`
	DiskType          string `json:"disk_type"`
	TransferGB        *int   `json:"transfer_gb"`
	PortMbps          *int   `json:"port_mbps"`
	HasIPv4           bool   `json:"has_ipv4"`
	IPv4Count         int    `json:"ipv4_count"`
	HasIPv6           bool   `json:"has_ipv6"`
	IPv6Count         int    `json:"ipv6_count"`
	PriceAmount       string `json:"price_amount"`
	Currency          string `json:"currency"`
	BillingPeriod     string `json:"billing_period"`
	PurchaseURL       string `json:"purchase_url"`
	Enabled           bool   `json:"enabled"`
	CollectionEnabled bool   `json:"collection_enabled"`
}
type VPSCreate struct{ VPSEditable }
type VPSUpdate struct {
	ID string `json:"id" binding:"required"`
	VPSEditable
}
type VPSListQuery struct {
	Page          int    `form:"page"`
	PageSize      int    `form:"page_size"`
	Q             string `form:"q"`
	MerchantID    string `form:"merchant_id"`
	Currency      string `form:"currency"`
	BillingPeriod string `form:"billing_period"`
	Status        *int   `form:"status"`
	Sort          string `form:"sort"`
	Enabled       *bool  `form:"enabled"`
}

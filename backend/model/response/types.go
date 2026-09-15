package response

import "time"

type PublicUser struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Nickname  string    `json:"nickname"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
type AccountUser struct {
	PublicUser
	Mail           *string    `json:"mail"`
	MailVerified   bool       `json:"mail_verified"`
	MailVerifiedAt *time.Time `json:"mail_verified_at"`
	MailRequired   bool       `json:"mail_required"`
}
type AdminUser struct {
	PublicUser
	Frozen bool `json:"frozen"`
}
type LoginResult struct {
	User        AccountUser `json:"user"`
	AccessToken string      `json:"access_token"`
	TokenType   string      `json:"token_type"`
	ExpiresIn   int64       `json:"expires_in"`
}
type TokenResult struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int64  `json:"expires_in"`
}
type CSRFResult struct {
	Token string `json:"token"`
}
type CodeResult struct {
	VerificationID string `json:"verification_id,omitempty"`
	ResetID        string `json:"reset_id,omitempty"`
	ExpiresIn      int64  `json:"expires_in"`
	RetryAfter     int64  `json:"retry_after"`
	Message        string `json:"message,omitempty"`
}
type MailStatus struct {
	Mail     *string `json:"mail"`
	Verified bool    `json:"verified"`
}
type FrozeResult struct {
	UserID      string `json:"user_id"`
	Frozen      bool   `json:"frozen"`
	CacheSynced bool   `json:"cache_synced"`
}
type Merchant struct {
	ID         string `json:"id"`
	Code       string `json:"code"`
	Name       string `json:"name"`
	WebsiteURL string `json:"website_url"`
}
type AdminMerchant struct {
	Merchant
	CollectionEnabled bool      `json:"collection_enabled"`
	Enabled           bool      `json:"enabled"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}
type Stock struct {
	VPSID         string     `json:"vps_id"`
	Status        int        `json:"status"`
	Quantity      *int       `json:"quantity"`
	LastCheckedAt *time.Time `json:"last_checked_at"`
	LastInStockAt *time.Time `json:"last_in_stock_at"`
	IsStale       bool       `json:"is_stale"`
}
type VPS struct {
	ID            string    `json:"id"`
	Merchant      Merchant  `json:"merchant"`
	Code          string    `json:"code"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	CPUCores      int       `json:"cpu_cores"`
	MemoryMB      int       `json:"memory_mb"`
	DiskGB        int       `json:"disk_gb"`
	DiskType      string    `json:"disk_type"`
	TransferGB    *int      `json:"transfer_gb"`
	PortMbps      *int      `json:"port_mbps"`
	HasIPv4       bool      `json:"has_ipv4"`
	IPv4Count     int       `json:"ipv4_count"`
	HasIPv6       bool      `json:"has_ipv6"`
	IPv6Count     int       `json:"ipv6_count"`
	PriceAmount   string    `json:"price_amount"`
	Currency      string    `json:"currency"`
	BillingPeriod string    `json:"billing_period"`
	PurchaseURL   string    `json:"purchase_url"`
	Stock         Stock     `json:"stock"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}
type AdminVPS struct {
	VPS
	CollectionEnabled bool   `json:"collection_enabled"`
	MerchantID        string `json:"merchant_id"`
	Enabled           bool   `json:"enabled"`
}
type PublicSettings struct {
	SiteName            string `json:"site_name"`
	RegistrationEnabled bool   `json:"registration_enabled"`
}
type AdminSettings struct {
	CollectionEnabled    bool           `json:"collection_enabled"`
	CollectorImplemented bool           `json:"collector_implemented"`
	Settings             PublicSettings `json:"settings"`
	UpdatedAt            time.Time      `json:"updated_at"`
}
type DashboardSummary struct {
	UserCount         int64 `json:"user_count"`
	FrozenUserCount   int64 `json:"frozen_user_count"`
	MerchantCount     int64 `json:"merchant_count"`
	VPSCount          int64 `json:"vps_count"`
	InStockCount      int64 `json:"in_stock_count"`
	UnknownStockCount int64 `json:"unknown_stock_count"`
}

package request

type MerchantCreate struct {
	Code              string `json:"code" binding:"required"`
	Name              string `json:"name" binding:"required"`
	WebsiteURL        string `json:"website_url" binding:"required,url"`
	Enabled           bool   `json:"enabled"`
	CollectionEnabled bool   `json:"collection_enabled"`
}
type MerchantUpdate struct {
	ID                string `json:"id" binding:"required"`
	Name              string `json:"name" binding:"required"`
	WebsiteURL        string `json:"website_url" binding:"required,url"`
	Enabled           bool   `json:"enabled"`
	CollectionEnabled bool   `json:"collection_enabled"`
}
type MerchantListQuery struct {
	Page     int    `form:"page"`
	PageSize int    `form:"page_size"`
	Q        string `form:"q"`
	Enabled  *bool  `form:"enabled"`
}

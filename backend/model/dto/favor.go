package dto

type Favor struct {
	MerchantCode string `json:"merchant_code"`
	VpsId        string `json:"vps_id"`
	VpsCode      string `json:"vps_code"`
	VpsName      string `json:"vps_name"`
}

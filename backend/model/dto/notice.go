package dto

type NoticeEnabledTask struct {
	UserId  string `json:"user_id"`
	VpsId   string `json:"vps_id"`
	VpsName string `json:"vps_name"`
}

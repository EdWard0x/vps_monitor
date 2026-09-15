package request

type UpdateMe struct {
	Nickname string `json:"nickname" binding:"required"`
}
type ChangePassword struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required"`
}
type UpdateUser struct {
	ID       string `json:"id" binding:"required"`
	Nickname string `json:"nickname" binding:"required"`
}
type ChangeRole struct {
	ID   string `json:"id" binding:"required"`
	Role string `json:"role" binding:"required"`
}
type AdminResetPassword struct {
	UserID      string `json:"user_id" binding:"required"`
	NewPassword string `json:"new_password" binding:"required"`
}
type UserListQuery struct {
	Page     int    `form:"page"`
	PageSize int    `form:"page_size"`
	Q        string `form:"q"`
	Role     string `form:"role"`
	Frozen   *bool  `form:"frozen"`
}

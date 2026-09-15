package request

type Register struct {
	Username string `json:"username" binding:"required"`
	Nickname string `json:"nickname" binding:"required"`
	Password string `json:"password" binding:"required"`
}
type Login struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}
type PasswordResetCode struct {
	Mail string `json:"mail" binding:"required,email"`
}
type PasswordResetConfirm struct {
	ResetID     string `json:"reset_id" binding:"required"`
	Code        string `json:"code" binding:"required"`
	NewPassword string `json:"new_password" binding:"required"`
}

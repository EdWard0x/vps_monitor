package request

type MailCode struct {
	Mail            string  `json:"mail" binding:"required,email"`
	CurrentPassword *string `json:"current_password"`
}
type MailConfirm struct {
	VerificationID string `json:"verification_id" binding:"required"`
	Code           string `json:"code" binding:"required"`
}

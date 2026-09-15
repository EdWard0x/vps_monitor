package request

type Froze struct {
	UserID string `json:"user_id" binding:"required"`
}

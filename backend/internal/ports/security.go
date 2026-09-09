package ports

import "time"

type TokenClaims struct {
	Subject, SessionID, ID string
	ExpiresAt              time.Time
}

// TokenService 隔离 JWT 实现。Issue 依次返回 access、refresh、刷新 JTI、access 剩余秒数、错误。
// absolute 是会话的绝对到期时间；刷新并不会把它延长为新的七天。
type TokenService interface {
	Issue(userID int64, sessionID string, absolute time.Time) (string, string, string, int, error)
	Verify(raw, kind string) (TokenClaims, error)
	HashJTI(string) string
}
type PasswordService interface {
	Hash(string) (string, error)
	Verify(string, string) bool
}
type CSRFService interface {
	Issue() (string, error)
	Valid(string) bool
}

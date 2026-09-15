package auth

import (
	"context"
	"time"
)

type TokenKind string

const (
	AccessToken  TokenKind = "access"
	RefreshToken TokenKind = "refresh"
)

// Principal 是鉴权后写入单次请求上下文的当前身份。
type Principal struct {
	UserID       string
	Role         string
	MailVerified bool
	TokenVersion uint64
}

type TokenIssueInput struct {
	UserID           string
	Role             string
	TokenVersion     uint64
	RefreshExpiresAt time.Time
}

type TokenPair struct {
	AccessToken      string
	RefreshToken     string
	AccessExpiresAt  time.Time
	RefreshExpiresAt time.Time
}

type TokenClaims struct {
	Subject      string
	TokenVersion uint64
	TokenType    TokenKind
	Issuer       string
	Audience     string
	IssuedAt     time.Time
	ExpiresAt    time.Time
}

type Authenticator interface {
	Authenticate(context.Context, string) (Principal, error)
}

type CSRFVerifier interface {
	VerifyCSRF(context.Context, string) error
}

type TokenProvider interface {
	Issue(context.Context, TokenIssueInput) (TokenPair, error)
	Verify(context.Context, string, TokenKind) (TokenClaims, error)
}

type PasswordProvider interface {
	Validate(password string) error
	Hash(password string) (string, error)
	Verify(storedHash, password string) error
}

type CSRFProvider interface {
	Issue(context.Context) (string, error)
	Verify(context.Context, string) error
}

package jwt

import (
	"context"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	authiface "vpsmonitor/iface/auth"
	"vpsmonitor/model/errcode"
)

type Provider struct {
	accessSecret, refreshSecret             []byte
	issuer, accessAudience, refreshAudience string
	accessTTL, refreshTTL                   time.Duration
}

type claims struct {
	TokenVersion uint64              `json:"token_version"`
	TokenType    authiface.TokenKind `json:"token_type"`
	jwt.RegisteredClaims
}

func New(accessSecret, refreshSecret, issuer, accessAudience, refreshAudience string, accessTTL, refreshTTL time.Duration) *Provider {
	return &Provider{
		[]byte(accessSecret), []byte(refreshSecret), issuer, accessAudience, refreshAudience,
		accessTTL, refreshTTL,
	}
}

func (p *Provider) Issue(ctx context.Context, in authiface.TokenIssueInput) (authiface.TokenPair, error) {
	if err := ctx.Err(); err != nil {
		return authiface.TokenPair{}, err
	}
	if len(p.accessSecret) < 32 || len(p.refreshSecret) < 32 || p.accessTTL <= 0 || p.refreshTTL <= 0 || in.UserID == "" || in.TokenVersion == 0 {
		return authiface.TokenPair{}, errcode.InvalidToken
	}

	now := time.Now().UTC()
	refreshExpiresAt := in.RefreshExpiresAt
	if refreshExpiresAt.IsZero() {
		refreshExpiresAt = now.Add(p.refreshTTL)
	}
	if !refreshExpiresAt.After(now) {
		return authiface.TokenPair{}, errcode.InvalidToken
	}
	accessExpiresAt := now.Add(p.accessTTL)
	if refreshExpiresAt.Before(accessExpiresAt) {
		accessExpiresAt = refreshExpiresAt
	}

	accessToken, err := p.sign(in, authiface.AccessToken, now, accessExpiresAt, p.accessAudience, p.accessSecret)
	if err != nil {
		return authiface.TokenPair{}, err
	}
	refreshToken, err := p.sign(in, authiface.RefreshToken, now, refreshExpiresAt, p.refreshAudience, p.refreshSecret)
	if err != nil {
		return authiface.TokenPair{}, err
	}
	return authiface.TokenPair{AccessToken: accessToken, RefreshToken: refreshToken, AccessExpiresAt: accessExpiresAt, RefreshExpiresAt: refreshExpiresAt}, nil
}

func (p *Provider) Verify(ctx context.Context, raw string, kind authiface.TokenKind) (authiface.TokenClaims, error) {
	if err := ctx.Err(); err != nil {
		return authiface.TokenClaims{}, err
	}
	if kind != authiface.AccessToken && kind != authiface.RefreshToken {
		return authiface.TokenClaims{}, errcode.InvalidToken
	}
	secret, audience := p.accessSecret, p.accessAudience
	if kind == authiface.RefreshToken {
		secret, audience = p.refreshSecret, p.refreshAudience
	}
	if len(secret) < 32 {
		return authiface.TokenClaims{}, errcode.InvalidToken
	}

	c := &claims{}
	token, err := jwt.ParseWithClaims(raw, c, func(*jwt.Token) (any, error) { return secret, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(p.issuer), jwt.WithAudience(audience), jwt.WithExpirationRequired(), jwt.WithIssuedAt(),
	)
	if err != nil || !token.Valid || c.Subject == "" || c.TokenType != kind || c.TokenVersion == 0 || c.IssuedAt == nil || c.ExpiresAt == nil {
		if kind == authiface.AccessToken && errors.Is(err, jwt.ErrTokenExpired) {
			return authiface.TokenClaims{}, errcode.AccessExpired
		}
		return authiface.TokenClaims{}, errcode.InvalidToken
	}
	return authiface.TokenClaims{
		Subject: c.Subject, TokenVersion: c.TokenVersion, TokenType: c.TokenType,
		Issuer: c.Issuer, Audience: audience, IssuedAt: c.IssuedAt.Time, ExpiresAt: c.ExpiresAt.Time,
	}, nil
}

func (p *Provider) sign(in authiface.TokenIssueInput, kind authiface.TokenKind, issuedAt, expiresAt time.Time, audience string, secret []byte) (string, error) {
	c := claims{
		TokenVersion: in.TokenVersion,
		TokenType:    kind,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer: p.issuer, Subject: in.UserID, Audience: jwt.ClaimStrings{audience},
			IssuedAt: jwt.NewNumericDate(issuedAt), ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(secret)
}

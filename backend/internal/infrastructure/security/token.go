package security

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"github.com/golang-jwt/jwt/v5"
	"strconv"
	"strings"
	"time"
	"vpsmonitor/internal/ports"
)

// Tokens 为两类令牌使用不同密钥和 audience（接收方），避免互相替代。
// JWT 在这里是签名而非加密；不要把密码等秘密放进 claims。
type Tokens struct {
	AccessSecret, RefreshSecret             []byte
	Issuer, AccessAudience, RefreshAudience string
}
type jwtClaims struct {
	SessionID string `json:"sid"`
	TokenType string `json:"token_type"`
	jwt.RegisteredClaims
}

func random(n int) (string, error) {
	b := make([]byte, n)
	if _, e := rand.Read(b); e != nil {
		return "", e
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
func HashJTI(v string) string            { s := sha256.Sum256([]byte(v)); return hex.EncodeToString(s[:]) }
func (t Tokens) HashJTI(v string) string { return HashJTI(v) }

// Issue 让 access 最长有效 15 分钟，同时不超过会话绝对到期时间。
// refresh 沿用 absolute；返回的 jti 是刷新令牌标识，调用者将其哈希后存入会话。
func (t Tokens) Issue(userID int64, sid string, absolute time.Time) (access, refresh, jti string, expires int, error error) {
	now := time.Now().UTC()
	accessExp := now.Add(15 * time.Minute)
	if absolute.Before(accessExp) {
		accessExp = absolute
	}
	aj, _ := random(32)
	rj, e := random(32)
	if e != nil {
		return "", "", "", 0, e
	}
	base := jwt.RegisteredClaims{Issuer: t.Issuer, Subject: strconv.FormatInt(userID, 10), IssuedAt: jwt.NewNumericDate(now)}
	ac := jwtClaims{SessionID: sid, TokenType: "access", RegisteredClaims: base}
	ac.ID = aj
	ac.Audience = jwt.ClaimStrings{t.AccessAudience}
	ac.ExpiresAt = jwt.NewNumericDate(accessExp)
	rc := jwtClaims{SessionID: sid, TokenType: "refresh", RegisteredClaims: base}
	rc.ID = rj
	rc.Audience = jwt.ClaimStrings{t.RefreshAudience}
	rc.ExpiresAt = jwt.NewNumericDate(absolute)
	a, e := jwt.NewWithClaims(jwt.SigningMethodHS256, ac).SignedString(t.AccessSecret)
	if e != nil {
		return "", "", "", 0, e
	}
	r, e := jwt.NewWithClaims(jwt.SigningMethodHS256, rc).SignedString(t.RefreshSecret)
	return a, r, rj, int(time.Until(accessExp).Seconds()), e
}

// Verify 校验签名、签发方、接收方、有效期和类型；账户状态由 Service.Authenticate 另查数据库。
// 当前把解析错误统一成 invalid token，未保留“已过期”原因；应用层的过期错误分类需后续修正。
func (t Tokens) Verify(raw, kind string) (ports.TokenClaims, error) {
	var c jwtClaims
	secret := t.AccessSecret
	aud := t.AccessAudience
	if kind == "refresh" {
		secret = t.RefreshSecret
		aud = t.RefreshAudience
	}
	tok, e := jwt.ParseWithClaims(raw, &c, func(tok *jwt.Token) (any, error) {
		if tok.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("algorithm")
		}
		return secret, nil
	}, jwt.WithIssuer(t.Issuer), jwt.WithAudience(aud), jwt.WithLeeway(30*time.Second), jwt.WithExpirationRequired())
	if e != nil || !tok.Valid || c.TokenType != kind || c.Subject == "" || c.SessionID == "" || c.ID == "" {
		return ports.TokenClaims{}, fmt.Errorf("invalid token")
	}
	out := ports.TokenClaims{Subject: c.Subject, SessionID: c.SessionID, ID: c.ID}
	if c.ExpiresAt != nil {
		out.ExpiresAt = c.ExpiresAt.Time
	}
	return out, nil
}

// CSRF 给随机令牌附加 HMAC 签名，校验它是否由本站签发；Cookie/Header/Origin 比较在 HTTP 层。
type CSRF struct{ Secret []byte }

func (c CSRF) Issue() (string, error) {
	n, e := random(32)
	if e != nil {
		return "", e
	}
	m := hmac.New(sha256.New, c.Secret)
	m.Write([]byte(n))
	return n + "." + base64.RawURLEncoding.EncodeToString(m.Sum(nil)), nil
}
func (c CSRF) Valid(token string) bool {
	p := strings.Split(token, ".")
	if len(p) != 2 {
		return false
	}
	m := hmac.New(sha256.New, c.Secret)
	m.Write([]byte(p[0]))
	sig, e := base64.RawURLEncoding.DecodeString(p[1])
	return e == nil && subtle.ConstantTimeCompare(sig, m.Sum(nil)) == 1
}

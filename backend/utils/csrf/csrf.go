package csrf

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"vpsmonitor/model/errcode"
)

const (
	tokenVersion = "v1"
	nonceBytes   = 32
	clockSkew    = time.Minute
)

var ErrInvalidConfiguration = errors.New("invalid CSRF configuration")

// Provider 签发无状态 CSRF token。token 包含版本、签发时间、随机数和 HMAC，
// 服务端不保存 token；浏览器 Cookie 与请求 Header 的绑定由 middle.CSRF 检查。
type Provider struct {
	secret []byte
	ttl    time.Duration
	now    func() time.Time
	random io.Reader
}

func New(secret string, ttl time.Duration) *Provider {
	return &Provider{
		secret: []byte(secret),
		ttl:    ttl,
		now:    time.Now,
		random: rand.Reader,
	}
}

// Issue 创建格式为 v1.<unix>.<nonce>.<signature> 的 token。
func (p *Provider) Issue(ctx context.Context) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if len(p.secret) < 32 || p.ttl <= 0 {
		return "", ErrInvalidConfiguration
	}
	nonce := make([]byte, nonceBytes)
	if _, err := io.ReadFull(p.random, nonce); err != nil {
		return "", fmt.Errorf("generate CSRF nonce: %w", err)
	}
	payload := strings.Join([]string{
		tokenVersion,
		strconv.FormatInt(p.now().UTC().Unix(), 10),
		base64.RawURLEncoding.EncodeToString(nonce),
	}, ".")
	return payload + "." + base64.RawURLEncoding.EncodeToString(p.sign(payload)), nil
}

// Verify 校验 token 格式、随机数长度、签名、签发时间和有效期。
// 对外统一返回 CSRF_REJECTED，避免暴露具体校验失败原因。
func (p *Provider) Verify(ctx context.Context, token string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if len(p.secret) < 32 || p.ttl <= 0 || len(token) > 256 {
		return errcode.CSRFRejected
	}
	parts := strings.Split(token, ".")
	if len(parts) != 4 || parts[0] != tokenVersion {
		return errcode.CSRFRejected
	}
	issuedUnix, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return errcode.CSRFRejected
	}
	nonce, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || len(nonce) != nonceBytes {
		return errcode.CSRFRejected
	}
	providedSignature, err := base64.RawURLEncoding.DecodeString(parts[3])
	if err != nil || len(providedSignature) != sha256.Size {
		return errcode.CSRFRejected
	}
	payload := strings.Join(parts[:3], ".")
	if !hmac.Equal(providedSignature, p.sign(payload)) {
		return errcode.CSRFRejected
	}
	age := p.now().UTC().Sub(time.Unix(issuedUnix, 0).UTC())
	if age < -clockSkew || age > p.ttl {
		return errcode.CSRFRejected
	}
	return nil
}

func (p *Provider) sign(payload string) []byte {
	mac := hmac.New(sha256.New, p.secret)
	_, _ = mac.Write([]byte(payload))
	return mac.Sum(nil)
}

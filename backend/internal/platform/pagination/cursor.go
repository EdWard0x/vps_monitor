package pagination

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"
)

// Cursor 保存“上页最后一条记录的位置”：时间和 ID 一起使用，解决同一时刻多条记录的排序。
// Scope 绑定套餐、父节点或搜索词；Base64 编码可读，HMAC 防篡改但不提供加密。
type Cursor struct {
	Scope string    `json:"scope"`
	Time  time.Time `json:"time"`
	ID    int64     `json:"id"`
}
type Signer struct{ Secret []byte }

func (s Signer) Encode(c Cursor) string {
	b, _ := json.Marshal(c)
	m := hmac.New(sha256.New, s.Secret)
	m.Write(b)
	return base64.RawURLEncoding.EncodeToString(b) + "." + base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}
func (s Signer) Decode(raw, scope string) (Cursor, error) {
	var c Cursor
	var a, b string
	for i, v := range raw {
		if v == '.' {
			a = raw[:i]
			b = raw[i+1:]
			break
		}
	}
	if a == "" {
		return c, fmt.Errorf("invalid cursor")
	}
	p, e := base64.RawURLEncoding.DecodeString(a)
	if e != nil {
		return c, e
	}
	sig, e := base64.RawURLEncoding.DecodeString(b)
	if e != nil {
		return c, e
	}
	m := hmac.New(sha256.New, s.Secret)
	m.Write(p)
	if !hmac.Equal(sig, m.Sum(nil)) {
		return c, fmt.Errorf("invalid signature")
	}
	if e = json.Unmarshal(p, &c); e != nil || c.Scope != scope || c.ID <= 0 || c.Time.IsZero() {
		return c, fmt.Errorf("cursor scope")
	}
	return c, nil
}

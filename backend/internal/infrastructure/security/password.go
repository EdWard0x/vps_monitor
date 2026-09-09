package security

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"golang.org/x/crypto/argon2"
	"strings"
)

const memory = 19 * 1024
const iterations = 2
const parallelism = 1
const saltLen = 16
const keyLen = 32

// HashPassword 用每次新生成的随机盐计算 Argon2id 哈希。
// 保存的是算法参数、盐和哈希，不是可解密的密码；相同密码也可以得到不同的存储字符串。
func HashPassword(password string) (string, error) {
	salt := make([]byte, saltLen)
	if _, e := rand.Read(salt); e != nil {
		return "", e
	}
	h := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, keyLen)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", memory, iterations, parallelism, base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(h)), nil
}

// VerifyPassword 从已存字符串读取参数和盐，用输入密码重新计算，再做恒定时间比较。
// 当前只接受本项目这组参数；将来升级参数时需同时考虑旧账户的兼容与迁移。
func VerifyPassword(encoded, password string) bool {
	var m, t uint32
	var p uint8
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" {
		return false
	}
	if _, e := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); e != nil || m != memory || t != iterations || p != parallelism {
		return false
	}
	salt, e := base64.RawStdEncoding.DecodeString(parts[4])
	if e != nil || len(salt) != saltLen {
		return false
	}
	want, e := base64.RawStdEncoding.DecodeString(parts[5])
	if e != nil || len(want) != keyLen {
		return false
	}
	got := argon2.IDKey([]byte(password), salt, t, m, p, keyLen)
	return subtle.ConstantTimeCompare(got, want) == 1
}

type Passwords struct{}

func (Passwords) Hash(v string) (string, error) { return HashPassword(v) }
func (Passwords) Verify(encoded, v string) bool { return VerifyPassword(encoded, v) }

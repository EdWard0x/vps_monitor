package password

import (
	"golang.org/x/crypto/bcrypt"
	"unicode/utf8"
	"vpsmonitor/model/errcode"
)

// Provider 使用 bcrypt 保存密码，禁止截断超过算法上限的输入。
type Provider struct{}

func Validate(password string) error {
	if len(password) < 8 || len(password) > 72 || !utf8.ValidString(password) {
		return errcode.InvalidArgument
	}
	return nil
}

func (Provider) Validate(password string) error { return Validate(password) }

func (Provider) Hash(password string) (string, error) {
	if err := Validate(password); err != nil {
		return "", err
	}
	hash, err := bcrypt.GenerateFromPassword(
		[]byte(password),
		12,
	)
	if err != nil {
		return "", err
	}

	return string(hash), nil
}
func (Provider) Verify(storedHash, password string) error {
	if len(password) > 72 {
		return errcode.VerifyPasswordFailed
	}
	return bcrypt.CompareHashAndPassword(
		[]byte(storedHash),
		[]byte(password),
	)
}

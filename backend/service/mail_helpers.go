package service

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"strconv"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/response"
)

const (
	mailCodeLifetime    = 10 * time.Minute
	mailCodeCooldown    = time.Minute
	mailCodeMaxAttempts = 5
)

func newMailCode() (string, string, error) {
	number, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", "", errcode.DependencyUnavailable
	}
	code := fmt.Sprintf("%06d", number.Int64())
	hash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
	if err != nil {
		return "", "", errcode.DependencyUnavailable
	}
	return code, string(hash), nil
}

func validMailCode(code string) bool {
	if len(code) != 6 {
		return false
	}
	for _, r := range code {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func consumeSecurityCodes(tx *gorm.DB, userID uint, now time.Time) error {
	if err := tx.Model(&entity.MailVerification{}).Where("user_id = ? AND consumed_at IS NULL", userID).Update("consumed_at", now).Error; err != nil {
		return errcode.DatabaseError
	}
	if err := tx.Model(&entity.PasswordReset{}).Where("user_id = ? AND consumed_at IS NULL", userID).Update("consumed_at", now).Error; err != nil {
		return errcode.DatabaseError
	}
	return nil
}

func mailAccountUser(user entity.User) response.AccountUser {
	return response.AccountUser{
		PublicUser: response.PublicUser{ID: strconv.FormatUint(uint64(user.ID), 10), Username: user.Username, Nickname: user.Nickname, Role: user.Role, CreatedAt: user.CreatedAt, UpdatedAt: user.UpdatedAt},
		Mail:       user.Mail, MailVerified: user.MailVerified, MailVerifiedAt: user.MailVerifiedAt,
		MailRequired: user.Role == "admin" && !user.MailVerified,
	}
}

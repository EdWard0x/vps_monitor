package entity

import (
	"gorm.io/gorm"
	"time"
)

type PasswordReset struct {
	gorm.Model
	PublicID       string    `gorm:"type:uuid;uniqueIndex;not null"`
	UserID         uint      `gorm:"index;not null"`
	CodeHash       string    `gorm:"not null"`
	ExpiresAt      time.Time `gorm:"index;not null"`
	ConsumedAt     *time.Time
	FailedAttempts int `gorm:"not null;default:0"`
}

func (PasswordReset) TableName() string { return "password_reset_requests" }

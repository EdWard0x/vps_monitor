package entity

import (
	"gorm.io/gorm"
	"time"
)

type MailVerification struct {
	gorm.Model
	PublicID       string    `gorm:"type:uuid;uniqueIndex;not null"`
	UserID         uint      `gorm:"index;not null"`
	Mail           string    `gorm:"size:320;not null"`
	CodeHash       string    `gorm:"not null"`
	ExpiresAt      time.Time `gorm:"index;not null"`
	ConsumedAt     *time.Time
	FailedAttempts int `gorm:"not null;default:0"`
}

func (MailVerification) TableName() string { return "user_mail_verifications" }

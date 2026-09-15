package entity

import (
	"gorm.io/gorm"
	"time"
)

type User struct {
	gorm.Model
	Username       string  `gorm:"uniqueIndex;size:64;not null"`
	Nickname       string  `gorm:"size:64;not null"`
	PasswordHash   string  `gorm:"not null"`
	Role           string  `gorm:"size:16;not null;default:user"`
	Mail           *string `gorm:"uniqueIndex;size:320"`
	MailVerified   bool    `gorm:"not null;default:false"`
	MailVerifiedAt *time.Time
	TokenVersion   uint64 `gorm:"not null;default:1"`
}

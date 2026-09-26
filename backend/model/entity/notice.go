package entity

import (
	"time"

	"gorm.io/gorm"
)

type Notice struct {
	gorm.Model
	UserID          uint   `gorm:"index;not null;uniqueIndex:uniq_notice_user_vps"`
	VpsID           uint64 `gorm:"index;not null;uniqueIndex:uniq_notice_user_vps"`
	MerchantID      uint   `gorm:"index;not null"`
	SendNoticeTimes uint64 `gorm:"not null;default:0"`
	SendAt          *time.Time
}

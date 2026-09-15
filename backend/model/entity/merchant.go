package entity

import "gorm.io/gorm"

type Merchant struct {
	gorm.Model
	Code              string `gorm:"uniqueIndex;size:64;not null"`
	Name              string `gorm:"size:128;not null"`
	WebsiteURL        string `gorm:"not null"`
	Enabled           bool   `gorm:"not null;default:true"`
	CollectionEnabled bool   `gorm:"not null;default:false"`
}

func (Merchant) TableName() string { return "merchant" }

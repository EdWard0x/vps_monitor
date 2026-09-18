package entity

import (
	"time"

	"gorm.io/gorm"
)

type Stock struct {
	gorm.Model
	VPSID         uint `gorm:"uniqueIndex;not null"`
	Status        int  `gorm:"not null;default:3"`
	Quantity      *int
	LastCheckedAt *time.Time
	LastInStockAt *time.Time
	DeliveryID    string `gorm:"size:64;not null" json:"-"`
}

func (Stock) TableName() string { return "vps_stocks" }

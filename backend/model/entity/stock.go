package entity

import (
	"time"

	"gorm.io/gorm"
)

type Stock struct {
	gorm.Model
	VPSID         uint `gorm:"uniqueIndex;not null"`
	Status        int  `gorm:"not null;default:3"` //1 有货,2 无货,3 未知,4 有货但数量未知
	Quantity      *int
	LastCheckedAt *time.Time
	LastInStockAt *time.Time
	DeliveryID    string `gorm:"size:64;not null" json:"-"`
}

func (Stock) TableName() string { return "vps_stocks" }

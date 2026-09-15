package entity

import (
	"gorm.io/gorm"
	"time"
)

type Stock struct {
	gorm.Model
	VPSID              uint `gorm:"uniqueIndex;not null"`
	Status             int  `gorm:"not null;default:3"`
	Quantity           *int
	LastCheckedAt      *time.Time
	LastInStockAt      *time.Time
	ObservationVersion uint64
}

func (Stock) TableName() string { return "vps_stocks" }

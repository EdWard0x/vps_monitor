package entity

import (
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type VPS struct {
	gorm.Model
	MerchantID        uint   `gorm:"index;not null"`
	Code              string `gorm:"size:64;not null"`
	Name              string `gorm:"size:128;not null"`
	Description       string
	CPUCores          int
	MemoryMB          int
	DiskGB            int
	DiskType          string
	TransferGB        *int
	PortMbps          *int
	HasIPv4           bool
	IPv4Count         int
	HasIPv6           bool
	IPv6Count         int
	PriceAmount       decimal.Decimal `gorm:"type:numeric(20,8)"`
	Currency          string          `gorm:"size:3"`
	BillingPeriod     string
	PurchaseURL       string
	Enabled           bool `gorm:"not null;default:true"`
	CollectionEnabled bool `gorm:"not null;default:false"`
}

func (VPS) TableName() string { return "vps_detail" }

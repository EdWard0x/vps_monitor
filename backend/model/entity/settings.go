package entity

import "gorm.io/gorm"

type SiteSetting struct {
	gorm.Model
	SiteName            string `gorm:"size:128;not null"`
	RegistrationEnabled bool   `gorm:"not null"`
	CollectionEnabled   bool   `gorm:"not null;default:false"`
}

func (SiteSetting) TableName() string { return "site_settings" }

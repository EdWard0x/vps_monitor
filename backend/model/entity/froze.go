package entity

import "gorm.io/gorm"

// Fronze 的拼写与现有数据库契约保持一致；未软删除记录表示账号冻结。
type Fronze struct {
	gorm.Model
	UserID uint `gorm:"uniqueIndex;not null"`
}

func (Fronze) TableName() string { return "fronze" }

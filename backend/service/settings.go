package service

import (
	"context"
	"errors"
	"strings"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
)

type SettingsService struct{ DB *gorm.DB }

func NewSettingsService(db *gorm.DB) *SettingsService { return &SettingsService{DB: db} }

func settingsResponse(row entity.SiteSetting) response.AdminSettings {
	return response.AdminSettings{
		Settings:  response.PublicSettings{SiteName: row.SiteName, RegistrationEnabled: row.RegistrationEnabled},
		UpdatedAt: row.UpdatedAt, CollectionEnabled: row.CollectionEnabled, CollectorImplemented: false,
	}
}

func (s *SettingsService) GetPublic(ctx context.Context) (response.PublicSettings, error) {
	out, err := s.GetAdmin(ctx)
	return out.Settings, err
}

func (s *SettingsService) GetAdmin(ctx context.Context) (response.AdminSettings, error) {
	if s.DB == nil {
		return response.AdminSettings{}, errcode.NotImplemented
	}
	var row entity.SiteSetting
	if err := s.DB.WithContext(ctx).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// 未初始化时安全关闭注册和采集，公开读取不创建数据。
			return settingsResponse(entity.SiteSetting{SiteName: "VPS Monitor"}), nil
		}
		return response.AdminSettings{}, catalogDBError(err)
	}
	return settingsResponse(row), nil
}

func (s *SettingsService) Update(ctx context.Context, in request.SettingsUpdate) (response.AdminSettings, error) {
	if s.DB == nil {
		return response.AdminSettings{}, errcode.NotImplemented
	}
	updates := make(map[string]any)
	if in.SiteName != nil {
		name := strings.TrimSpace(*in.SiteName)
		if !catalogText(name, 128) {
			return response.AdminSettings{}, errcode.InvalidArgument
		}
		updates["site_name"] = name
	}
	if in.RegistrationEnabled != nil {
		updates["registration_enabled"] = *in.RegistrationEnabled
	}
	if in.CollectionEnabled != nil {
		updates["collection_enabled"] = *in.CollectionEnabled
	}
	if len(updates) == 0 {
		return response.AdminSettings{}, errcode.InvalidArgument
	}
	var row entity.SiteSetting
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&row).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			initial := entity.SiteSetting{SiteName: "VPS Monitor"}
			// 单例唯一索引使并发初始化最多创建一条有效设置。
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&initial).Error; err != nil {
				return catalogDBError(err)
			}
			err = tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&row).Error
		}
		if err != nil {
			return catalogDBError(err)
		}
		if err := tx.Model(&row).Updates(updates).Error; err != nil {
			return catalogDBError(err)
		}
		if err := tx.First(&row, row.ID).Error; err != nil {
			return catalogDBError(err)
		}
		return nil
	})
	if err != nil {
		return response.AdminSettings{}, err
	}
	return settingsResponse(row), nil
}

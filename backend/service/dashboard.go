package service

import (
	"context"

	"gorm.io/gorm"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/response"
)

type DashboardService struct{ DB *gorm.DB }

func NewDashboardService(db *gorm.DB) *DashboardService { return &DashboardService{DB: db} }

// GetSummary 在同一 SQL 快照中统计未删除记录，包含后台停用的商家和套餐。
func (s *DashboardService) GetSummary(ctx context.Context) (response.DashboardSummary, error) {
	if s.DB == nil {
		return response.DashboardSummary{}, errcode.NotImplemented
	}
	var out response.DashboardSummary
	err := s.DB.WithContext(ctx).Raw(`SELECT
		(SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS user_count,
		(SELECT COUNT(*) FROM fronze f JOIN users u ON u.id = f.user_id AND u.deleted_at IS NULL WHERE f.deleted_at IS NULL) AS frozen_user_count,
		(SELECT COUNT(*) FROM merchant WHERE deleted_at IS NULL) AS merchant_count,
		(SELECT COUNT(*) FROM vps_detail v JOIN merchant m ON m.id = v.merchant_id AND m.deleted_at IS NULL WHERE v.deleted_at IS NULL) AS vps_count,
		(SELECT COUNT(*) FROM vps_detail v JOIN merchant m ON m.id = v.merchant_id AND m.deleted_at IS NULL
		 JOIN vps_stocks s ON s.vps_id = v.id AND s.deleted_at IS NULL WHERE v.deleted_at IS NULL AND s.status = 1) AS in_stock_count,
		(SELECT COUNT(*) FROM vps_detail v JOIN merchant m ON m.id = v.merchant_id AND m.deleted_at IS NULL
		 LEFT JOIN vps_stocks s ON s.vps_id = v.id AND s.deleted_at IS NULL WHERE v.deleted_at IS NULL AND COALESCE(s.status, 3) = 3) AS unknown_stock_count`).Scan(&out).Error
	if err != nil {
		return response.DashboardSummary{}, catalogDBError(err)
	}
	return out, nil
}

package service

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"vpsmonitor/model/dto"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/response"
)

type StockService struct{ DB *gorm.DB }

func NewStockService(db *gorm.DB) *StockService { return &StockService{DB: db} }

// GetCurrent 仅公开已启用商家下的已启用套餐；没有观测记录时返回未知，不写入库存。
func (s *StockService) GetCurrent(ctx context.Context, rawID string) (response.Stock, error) {
	if s.DB == nil {
		return response.Stock{}, errcode.NotImplemented
	}
	id, err := parseCatalogID(rawID)
	if err != nil {
		return response.Stock{}, err
	}
	var vps entity.VPS
	err = s.DB.WithContext(ctx).Model(&entity.VPS{}).Select("vps_detail.id").
		Joins("JOIN merchant ON merchant.id = vps_detail.merchant_id AND merchant.deleted_at IS NULL").
		Where("vps_detail.id = ? AND vps_detail.enabled = ? AND merchant.enabled = ?", id, true, true).First(&vps).Error
	if err != nil {
		return response.Stock{}, catalogDBError(err)
	}
	var stock entity.Stock
	err = s.DB.WithContext(ctx).Where("vps_id = ?", id).First(&stock).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return currentStock(id, nil, time.Now()), nil
	}
	if err != nil {
		return response.Stock{}, catalogDBError(err)
	}
	return currentStock(id, &stock, time.Now()), nil
}

// ApplyObservation 由维护者实现来源映射、幂等与乱序判断，以及库存写入。
// 当前始终返回未实现，不消费或确认事件，不修改库存。
func (*StockService) ApplyObservation(context.Context, dto.StockObservation) error {
	return errcode.NotImplemented
}

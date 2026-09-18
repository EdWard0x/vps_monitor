package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"
	"vpsmonitor/iface/collect"

	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/response"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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

func (s *StockService) UpdateStock(ctx context.Context, vpsId string, merchantCode string, observation collect.Observation, deliveryID string) error {
	id, _ := strconv.ParseInt(vpsId, 10, 0)
	var lastInStockAt *time.Time
	now := time.Now()
	var status int
	switch {
	case observation.Quantity == nil:
		status = 3
	case *observation.Quantity == 0:
		status = 2
	default:
		status = 1
		lastInStockAt = &now
	}

	var stock entity.Stock
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		err := tx.WithContext(ctx).Model(&entity.Stock{}).
			Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("vps_id = ?", vpsId).
			First(&stock).Error
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				err := tx.WithContext(ctx).Model(&entity.Stock{}).Create(&entity.Stock{
					VPSID:         uint(id),
					Status:        status,
					Quantity:      observation.Quantity,
					LastCheckedAt: &now,
					LastInStockAt: lastInStockAt,
					DeliveryID:    deliveryID,
				}).Error
				if err != nil {
					return err
				}
				return nil
			}
			return err
		}
		num, err := s.compareStreamID(deliveryID, stock.DeliveryID)
		if err != nil {
			return err
		}
		if num == -1 || num == 0 {
			log.Printf("当前消息ID:%v小于等于数据库内消息ID:%v，直接丢弃不入库\n", deliveryID, stock.DeliveryID)
			return nil
		}
		b := map[string]interface{}{
			"status":          status,
			"quantity":        observation.Quantity,
			"last_checked_at": now,
			"delivery_id":     deliveryID,
		}
		if lastInStockAt != nil {
			b["last_in_stock_at"] = lastInStockAt
		}
		err = tx.WithContext(ctx).Model(&entity.Stock{}).Where("vps_id = ?", id).Updates(b).Error
		if err != nil {
			return err
		}

		// 返回 nil 提交事务
		return nil
	})
	if err != nil {
		return err
	}

	return nil
}

func (*StockService) parseStreamID(id string) (ms uint64, seq uint64, err error) {
	parts := strings.SplitN(id, "-", 2)
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid stream id: %s", id)
	}

	ms, err = strconv.ParseUint(parts[0], 10, 64)
	if err != nil {
		return 0, 0, err
	}

	seq, err = strconv.ParseUint(parts[1], 10, 64)
	if err != nil {
		return 0, 0, err
	}

	return ms, seq, nil
}

// -1 表示 a < b
//
//	0 表示 a == b
//	1 表示 a > b
func (s *StockService) compareStreamID(a, b string) (int, error) {
	ams, aseq, err := s.parseStreamID(a)
	if err != nil {
		return 0, err
	}
	bms, bseq, err := s.parseStreamID(b)
	if err != nil {
		return 0, err
	}

	if ams < bms {
		return -1, nil
	}
	if ams > bms {
		return 1, nil
	}

	if aseq < bseq {
		return -1, nil
	}
	if aseq > bseq {
		return 1, nil
	}

	return 0, nil
}

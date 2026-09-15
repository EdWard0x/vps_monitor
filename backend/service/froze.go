package service

import (
	"context"
	"errors"
	"gorm.io/gorm"
	"strconv"
	"time"
	frozeiface "vpsmonitor/iface/froze"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/response"
)

type FrozeService struct {
	DB       *gorm.DB
	Cache    frozeiface.Cache
	CacheTTL time.Duration
}

func NewFrozeService(db *gorm.DB, cache frozeiface.Cache, ttl time.Duration) *FrozeService {
	return &FrozeService{DB: db, Cache: cache, CacheTTL: ttl}
}

// Freeze 在同一 SQL 事务恢复/创建 fronze 并仅首次递增 token_version，再写入固定 TTL 缓存。
func (s *FrozeService) Freeze(ctx context.Context, userID string) (response.FrozeResult, error) {
	if s.DB == nil {
		return response.FrozeResult{}, errcode.NotImplemented
	}
	var canonicalID string
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockAdminChanges(tx); err != nil {
			return err
		}
		// 用户行是所有密码和冻结修改共同的锁，防止并发冻结重复递增版本。
		user, err := findAccount(ctx, tx, userID, true)
		if err != nil {
			return err
		}
		canonicalID = strconv.FormatUint(uint64(user.ID), 10)
		var record entity.Fronze
		err = tx.Unscoped().Where("user_id = ?", user.ID).First(&record).Error
		if err == nil && !record.DeletedAt.Valid {
			return nil
		}
		if errors.Is(err, gorm.ErrRecordNotFound) || err == nil {
			if err := protectLastAdmin(tx, user); err != nil {
				return err
			}
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			err = tx.Create(&entity.Fronze{UserID: user.ID}).Error
		} else if err == nil {
			err = tx.Unscoped().Model(&record).Update("deleted_at", nil).Error
		}
		if err != nil {
			return errcode.DatabaseError
		}
		if err := tx.Model(&user).Update("token_version", gorm.Expr("token_version + 1")).Error; err != nil {
			return errcode.DatabaseError
		}
		return nil
	})
	if err != nil {
		return response.FrozeResult{}, accountWriteError(err)
	}
	synced := s.Cache != nil && s.Cache.Set(ctx, canonicalID, s.cacheTTL()) == nil
	return response.FrozeResult{UserID: canonicalID, Frozen: true, CacheSynced: synced}, nil
}

// Unfreeze 软删除 SQL 记录并始终删除缓存；缓存失败以 cache_synced=false 返回。
func (s *FrozeService) Unfreeze(ctx context.Context, userID string) (response.FrozeResult, error) {
	if s.DB == nil {
		return response.FrozeResult{}, errcode.NotImplemented
	}
	var canonicalID string
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockAdminChanges(tx); err != nil {
			return err
		}
		user, err := findAccount(ctx, tx, userID, true)
		if err != nil {
			return err
		}
		canonicalID = strconv.FormatUint(uint64(user.ID), 10)
		if err := tx.Where("user_id = ?", user.ID).Delete(&entity.Fronze{}).Error; err != nil {
			return errcode.DatabaseError
		}
		return nil
	})
	if err != nil {
		return response.FrozeResult{}, accountWriteError(err)
	}
	// SQL 无活动记录时仍删除缓存，支持重试先前失败的缓存同步。
	synced := s.Cache != nil && s.Cache.Delete(ctx, canonicalID) == nil
	return response.FrozeResult{UserID: canonicalID, Frozen: false, CacheSynced: synced}, nil
}

// Check 先查缓存，未命中或 Redis 异常时回查 SQL。
func (s *FrozeService) Check(ctx context.Context, userID string) error {
	if s.DB == nil {
		return errcode.NotImplemented
	}
	id, err := parseUserID(userID)
	if err != nil {
		return err
	}
	userID = strconv.FormatUint(uint64(id), 10)
	if s.Cache != nil {
		if frozen, err := s.Cache.Exists(ctx, userID); err == nil && frozen {
			return errcode.UserFrozen
		}
	}

	var frozen entity.Fronze
	err = s.DB.WithContext(ctx).Where("user_id = ?", id).First(&frozen).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return errcode.DatabaseError
	}
	if s.Cache != nil {
		_ = s.Cache.Set(ctx, userID, s.cacheTTL())
	}
	return errcode.UserFrozen
}

func (s *FrozeService) cacheTTL() time.Duration {
	if s.CacheTTL <= 0 {
		return 300 * time.Second
	}
	return s.CacheTTL
}

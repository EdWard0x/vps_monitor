package service

import (
	"context"
	"strings"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
	"vpsmonitor/utils/pagination"
)

type MerchantService struct{ DB *gorm.DB }

func NewMerchantService(db *gorm.DB) *MerchantService { return &MerchantService{DB: db} }

func (s *MerchantService) Create(ctx context.Context, in request.MerchantCreate) (response.AdminMerchant, error) {
	if s.DB == nil {
		return response.AdminMerchant{}, errcode.NotImplemented
	}
	row := entity.Merchant{
		Code: strings.ToLower(strings.TrimSpace(in.Code)), Name: strings.TrimSpace(in.Name),
		WebsiteURL: strings.TrimSpace(in.WebsiteURL), Enabled: in.Enabled, CollectionEnabled: in.CollectionEnabled,
	}
	if !catalogCodePattern.MatchString(row.Code) || !catalogText(row.Name, 128) || !catalogURL(row.WebsiteURL) {
		return response.AdminMerchant{}, errcode.InvalidArgument
	}
	// GORM 的 default:true 会覆盖 bool 零值；事务内显式保存管理员提交的启用状态。
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&row).Error; err != nil {
			return catalogDBError(err)
		}
		if !in.Enabled {
			if err := tx.Model(&row).Update("enabled", false).Error; err != nil {
				return catalogDBError(err)
			}
			row.Enabled = false
		}
		if err := tx.First(&row, row.ID).Error; err != nil {
			return catalogDBError(err)
		}
		return nil
	})
	if err != nil {
		return response.AdminMerchant{}, err
	}
	return adminMerchant(row), nil
}

func (s *MerchantService) Update(ctx context.Context, in request.MerchantUpdate) (response.AdminMerchant, error) {
	if s.DB == nil {
		return response.AdminMerchant{}, errcode.NotImplemented
	}
	id, err := parseCatalogID(in.ID)
	name, website := strings.TrimSpace(in.Name), strings.TrimSpace(in.WebsiteURL)
	if err != nil || !catalogText(name, 128) || !catalogURL(website) {
		return response.AdminMerchant{}, errcode.InvalidArgument
	}
	var row entity.Merchant
	err = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&row, id).Error; err != nil {
			return catalogDBError(err)
		}
		if err := tx.Model(&row).Updates(map[string]any{
			"name": name, "website_url": website, "enabled": in.Enabled, "collection_enabled": in.CollectionEnabled,
		}).Error; err != nil {
			return catalogDBError(err)
		}
		if err := tx.First(&row, id).Error; err != nil {
			return catalogDBError(err)
		}
		return nil
	})
	if err != nil {
		return response.AdminMerchant{}, err
	}
	return adminMerchant(row), nil
}

// Delete 拒绝删除仍有未删除套餐的商家，避免产生后台不可编辑的孤立套餐。
func (s *MerchantService) Delete(ctx context.Context, rawID string) error {
	if s.DB == nil {
		return errcode.NotImplemented
	}
	id, err := parseCatalogID(rawID)
	if err != nil {
		return err
	}
	return s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var row entity.Merchant
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&row, id).Error; err != nil {
			return catalogDBError(err)
		}
		var count int64
		if err := tx.Model(&entity.VPS{}).Where("merchant_id = ?", id).Count(&count).Error; err != nil {
			return catalogDBError(err)
		}
		if count > 0 {
			return errcode.ResourceConflict
		}
		if err := tx.Delete(&row).Error; err != nil {
			return catalogDBError(err)
		}
		return nil
	})
}

func (s *MerchantService) query(ctx context.Context, in request.MerchantListQuery, admin bool) *gorm.DB {
	query := s.DB.WithContext(ctx).Model(&entity.Merchant{})
	if !admin {
		query = query.Where("enabled = ?", true)
	} else if in.Enabled != nil {
		query = query.Where("enabled = ?", *in.Enabled)
	}
	if strings.TrimSpace(in.Q) != "" {
		q := catalogSearch(in.Q)
		query = query.Where("LOWER(name) LIKE ? OR LOWER(code) LIKE ?", q, q)
	}
	return query
}

func (s *MerchantService) listRows(ctx context.Context, in request.MerchantListQuery, admin bool) ([]entity.Merchant, int64, int, int, error) {
	page, size := pagination.Normalize(in.Page, in.PageSize)
	if s.DB == nil {
		return nil, 0, page, size, errcode.NotImplemented
	}
	query := s.query(ctx, in, admin)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, page, size, catalogDBError(err)
	}
	rows := make([]entity.Merchant, 0)
	if err := query.Order("updated_at DESC, id DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return nil, 0, page, size, catalogDBError(err)
	}
	return rows, total, page, size, nil
}

func (s *MerchantService) List(ctx context.Context, in request.MerchantListQuery) (response.List[response.Merchant], error) {
	rows, total, page, size, err := s.listRows(ctx, in, false)
	out := response.List[response.Merchant]{Items: make([]response.Merchant, 0, len(rows)), Total: total, Page: page, PageSize: size}
	if err != nil {
		return out, err
	}
	for _, row := range rows {
		out.Items = append(out.Items, publicMerchant(row))
	}
	return out, nil
}

func (s *MerchantService) Info(ctx context.Context, rawID string) (response.Merchant, error) {
	row, err := s.infoRow(ctx, rawID, false)
	if err != nil {
		return response.Merchant{}, err
	}
	return publicMerchant(row), nil
}

func (s *MerchantService) AdminList(ctx context.Context, in request.MerchantListQuery) (response.List[response.AdminMerchant], error) {
	rows, total, page, size, err := s.listRows(ctx, in, true)
	out := response.List[response.AdminMerchant]{Items: make([]response.AdminMerchant, 0, len(rows)), Total: total, Page: page, PageSize: size}
	if err != nil {
		return out, err
	}
	for _, row := range rows {
		out.Items = append(out.Items, adminMerchant(row))
	}
	return out, nil
}

func (s *MerchantService) AdminInfo(ctx context.Context, rawID string) (response.AdminMerchant, error) {
	row, err := s.infoRow(ctx, rawID, true)
	if err != nil {
		return response.AdminMerchant{}, err
	}
	return adminMerchant(row), nil
}

func (s *MerchantService) infoRow(ctx context.Context, rawID string, admin bool) (entity.Merchant, error) {
	if s.DB == nil {
		return entity.Merchant{}, errcode.NotImplemented
	}
	id, err := parseCatalogID(rawID)
	if err != nil {
		return entity.Merchant{}, err
	}
	var row entity.Merchant
	if err := s.query(ctx, request.MerchantListQuery{}, admin).First(&row, id).Error; err != nil {
		return entity.Merchant{}, catalogDBError(err)
	}
	return row, nil
}

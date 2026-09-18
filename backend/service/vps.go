package service

import (
	"context"
	"math"
	"strings"
	"time"
	"unicode/utf8"
	"vpsmonitor/model/dto"

	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
	"vpsmonitor/utils/pagination"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type VPSService struct{ DB *gorm.DB }

func NewVPSService(db *gorm.DB) *VPSService { return &VPSService{DB: db} }

func editableVPS(in request.VPSEditable) (entity.VPS, error) {
	merchantID, err := parseCatalogID(in.MerchantID)
	if err != nil {
		return entity.VPS{}, err
	}
	row := entity.VPS{
		MerchantID: merchantID, Code: strings.ToLower(strings.TrimSpace(in.Code)), Name: strings.TrimSpace(in.Name),
		Description: strings.TrimSpace(in.Description), CPUCores: in.CPUCores, MemoryMB: in.MemoryMB,
		DiskGB: in.DiskGB, DiskType: strings.ToLower(strings.TrimSpace(in.DiskType)),
		TransferGB: in.TransferGB, PortMbps: in.PortMbps, HasIPv4: in.HasIPv4, IPv4Count: in.IPv4Count,
		HasIPv6: in.HasIPv6, IPv6Count: in.IPv6Count, Currency: strings.ToUpper(strings.TrimSpace(in.Currency)),
		BillingPeriod: strings.ToLower(strings.TrimSpace(in.BillingPeriod)), PurchaseURL: strings.TrimSpace(in.PurchaseURL),
		Enabled: in.Enabled, CollectionEnabled: in.CollectionEnabled,
	}
	if !catalogCodePattern.MatchString(row.Code) || !catalogText(row.Name, 128) || utf8.RuneCountInString(row.Description) > 10000 ||
		row.CPUCores <= 0 || row.MemoryMB <= 0 || !catalogText(row.DiskType, 32) ||
		!catalogCurrencyPattern.MatchString(row.Currency) || !catalogURL(row.PurchaseURL) {
		return entity.VPS{}, errcode.InvalidArgument
	}
	for _, value := range []int{row.CPUCores, row.MemoryMB, row.DiskGB, row.IPv4Count, row.IPv6Count} {
		if value < 0 || int64(value) > math.MaxInt32 {
			return entity.VPS{}, errcode.InvalidArgument
		}
	}
	for _, value := range []*int{row.TransferGB, row.PortMbps} {
		if value != nil && (*value < 0 || int64(*value) > math.MaxInt32) {
			return entity.VPS{}, errcode.InvalidArgument
		}
	}
	if row.HasIPv4 != (row.IPv4Count > 0) || row.HasIPv6 != (row.IPv6Count > 0) {
		return entity.VPS{}, errcode.InvalidArgument
	}
	switch row.BillingPeriod {
	case "monthly", "quarterly", "yearly", "one_time":
	default:
		return entity.VPS{}, errcode.InvalidArgument
	}
	price := strings.TrimSpace(in.PriceAmount)
	if !catalogPricePattern.MatchString(price) {
		return entity.VPS{}, errcode.InvalidArgument
	}
	row.PriceAmount, err = decimal.NewFromString(price)
	if err != nil {
		return entity.VPS{}, errcode.InvalidArgument
	}
	return row, nil
}

func (s *VPSService) Create(ctx context.Context, in request.VPSCreate) (response.AdminVPS, error) {
	if s.DB == nil {
		return response.AdminVPS{}, errcode.NotImplemented
	}
	row, err := editableVPS(in.VPSEditable)
	if err != nil {
		return response.AdminVPS{}, err
	}
	err = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 与商家删除串行，防止在商家软删除后创建套餐。
		var merchant entity.Merchant
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&merchant, row.MerchantID).Error; err != nil {
			return catalogDBError(err)
		}
		if err := tx.Create(&row).Error; err != nil {
			return catalogDBError(err)
		}
		if !in.Enabled {
			if err := tx.Model(&row).Update("enabled", false).Error; err != nil {
				return catalogDBError(err)
			}
		}
		// 新套餐没有观测记录；不创建或更新 vps_stocks。
		return nil
	})
	if err != nil {
		return response.AdminVPS{}, err
	}
	return s.AdminInfo(ctx, catalogID(row.ID))
}

func (s *VPSService) Update(ctx context.Context, in request.VPSUpdate) (response.AdminVPS, error) {
	if s.DB == nil {
		return response.AdminVPS{}, errcode.NotImplemented
	}
	id, err := parseCatalogID(in.ID)
	if err != nil {
		return response.AdminVPS{}, err
	}
	row, err := editableVPS(in.VPSEditable)
	if err != nil {
		return response.AdminVPS{}, err
	}
	err = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var merchant entity.Merchant
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&merchant, row.MerchantID).Error; err != nil {
			return catalogDBError(err)
		}
		var current entity.VPS
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, id).Error; err != nil {
			return catalogDBError(err)
		}
		updates := map[string]any{
			"merchant_id": row.MerchantID, "code": row.Code, "name": row.Name, "description": row.Description,
			"cpu_cores": row.CPUCores, "memory_mb": row.MemoryMB, "disk_gb": row.DiskGB, "disk_type": row.DiskType,
			"transfer_gb": row.TransferGB, "port_mbps": row.PortMbps, "has_ipv4": row.HasIPv4, "ipv4_count": row.IPv4Count,
			"has_ipv6": row.HasIPv6, "ipv6_count": row.IPv6Count, "price_amount": row.PriceAmount, "currency": row.Currency,
			"billing_period": row.BillingPeriod, "purchase_url": row.PurchaseURL,
			"enabled": row.Enabled, "collection_enabled": row.CollectionEnabled,
		}
		if err := tx.Model(&current).Updates(updates).Error; err != nil {
			return catalogDBError(err)
		}
		return nil
	})
	if err != nil {
		return response.AdminVPS{}, err
	}
	return s.AdminInfo(ctx, in.ID)
}

func (s *VPSService) Delete(ctx context.Context, rawID string) error {
	if s.DB == nil {
		return errcode.NotImplemented
	}
	id, err := parseCatalogID(rawID)
	if err != nil {
		return err
	}
	result := s.DB.WithContext(ctx).Delete(&entity.VPS{}, id)
	if result.Error != nil {
		return catalogDBError(result.Error)
	}
	if result.RowsAffected == 0 {
		return errcode.ResourceNotFound
	}
	return nil
}

func (s *VPSService) query(ctx context.Context, in request.VPSListQuery, admin bool) (*gorm.DB, error) {
	query := s.DB.WithContext(ctx).Model(&entity.VPS{}).
		Joins("JOIN merchant ON merchant.id = vps_detail.merchant_id AND merchant.deleted_at IS NULL").
		Joins("LEFT JOIN vps_stocks ON vps_stocks.vps_id = vps_detail.id AND vps_stocks.deleted_at IS NULL")
	if !admin {
		query = query.Where("vps_detail.enabled = ? AND merchant.enabled = ?", true, true)
	} else if in.Enabled != nil {
		query = query.Where("vps_detail.enabled = ?", *in.Enabled)
	}
	if strings.TrimSpace(in.Q) != "" {
		q := catalogSearch(in.Q)
		query = query.Where("LOWER(vps_detail.name) LIKE ? OR LOWER(vps_detail.code) LIKE ? OR LOWER(vps_detail.description) LIKE ?", q, q, q)
	}
	if in.MerchantID != "" {
		id, err := parseCatalogID(in.MerchantID)
		if err != nil {
			return nil, err
		}
		query = query.Where("vps_detail.merchant_id = ?", id)
	}
	if in.Currency != "" {
		currency := strings.ToUpper(strings.TrimSpace(in.Currency))
		if !catalogCurrencyPattern.MatchString(currency) {
			return nil, errcode.InvalidArgument
		}
		query = query.Where("vps_detail.currency = ?", currency)
	}
	if in.BillingPeriod != "" {
		switch in.BillingPeriod {
		case "monthly", "quarterly", "yearly", "one_time":
		default:
			return nil, errcode.InvalidArgument
		}
		query = query.Where("vps_detail.billing_period = ?", in.BillingPeriod)
	}
	if in.Status != nil {
		if *in.Status < 1 || *in.Status > 3 {
			return nil, errcode.InvalidArgument
		}
		query = query.Where("COALESCE(vps_stocks.status, 3) = ?", *in.Status)
	}
	switch in.Sort {
	case "", "updated_desc":
		query = query.Order("vps_detail.updated_at DESC, vps_detail.id DESC")
	case "price_asc":
		query = query.Order("vps_detail.price_amount ASC, vps_detail.id DESC")
	case "price_desc":
		query = query.Order("vps_detail.price_amount DESC, vps_detail.id DESC")
	default:
		return nil, errcode.InvalidArgument
	}
	return query, nil
}

func (s *VPSService) listRows(ctx context.Context, in request.VPSListQuery, admin bool) ([]response.AdminVPS, int64, int, int, error) {
	page, size := pagination.Normalize(in.Page, in.PageSize)
	if s.DB == nil {
		return nil, 0, page, size, errcode.NotImplemented
	}
	query, err := s.query(ctx, in, admin)
	if err != nil {
		return nil, 0, page, size, err
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, page, size, catalogDBError(err)
	}
	var rows []entity.VPS
	if err := query.Select("vps_detail.*").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return nil, 0, page, size, catalogDBError(err)
	}
	items, err := s.present(ctx, rows)
	return items, total, page, size, err
}

// present 批量载入商家和库存，列表不会逐套餐触发查询。
func (s *VPSService) present(ctx context.Context, rows []entity.VPS) ([]response.AdminVPS, error) {
	items := make([]response.AdminVPS, 0, len(rows))
	if len(rows) == 0 {
		return items, nil
	}
	vpsIDs, merchantIDs := make([]uint, 0, len(rows)), make([]uint, 0, len(rows))
	for _, row := range rows {
		vpsIDs, merchantIDs = append(vpsIDs, row.ID), append(merchantIDs, row.MerchantID)
	}
	var merchants []entity.Merchant
	if err := s.DB.WithContext(ctx).Where("id IN ?", merchantIDs).Find(&merchants).Error; err != nil {
		return nil, catalogDBError(err)
	}
	var stocks []entity.Stock
	if err := s.DB.WithContext(ctx).Where("vps_id IN ?", vpsIDs).Find(&stocks).Error; err != nil {
		return nil, catalogDBError(err)
	}
	merchantMap, stockMap := make(map[uint]entity.Merchant, len(merchants)), make(map[uint]*entity.Stock, len(stocks))
	for _, row := range merchants {
		merchantMap[row.ID] = row
	}
	for i := range stocks {
		stockMap[stocks[i].VPSID] = &stocks[i]
	}
	now := time.Now()
	for _, row := range rows {
		items = append(items, response.AdminVPS{
			VPS:        publicVPS(row, merchantMap[row.MerchantID], stockMap[row.ID], now),
			MerchantID: catalogID(row.MerchantID), Enabled: row.Enabled, CollectionEnabled: row.CollectionEnabled,
		})
	}
	return items, nil
}

func (s *VPSService) List(ctx context.Context, in request.VPSListQuery) (response.List[response.VPS], error) {
	items, total, page, size, err := s.listRows(ctx, in, false)
	out := response.List[response.VPS]{Items: make([]response.VPS, 0, len(items)), Total: total, Page: page, PageSize: size}
	if err != nil {
		return out, err
	}
	for _, row := range items {
		out.Items = append(out.Items, row.VPS)
	}
	return out, nil
}

func (s *VPSService) Info(ctx context.Context, rawID string) (response.VPS, error) {
	row, err := s.info(ctx, rawID, false)
	return row.VPS, err
}

func (s *VPSService) AdminList(ctx context.Context, in request.VPSListQuery) (response.List[response.AdminVPS], error) {
	items, total, page, size, err := s.listRows(ctx, in, true)
	return response.List[response.AdminVPS]{Items: items, Total: total, Page: page, PageSize: size}, err
}

func (s *VPSService) AdminInfo(ctx context.Context, rawID string) (response.AdminVPS, error) {
	return s.info(ctx, rawID, true)
}

func (s *VPSService) info(ctx context.Context, rawID string, admin bool) (response.AdminVPS, error) {
	if s.DB == nil {
		return response.AdminVPS{}, errcode.NotImplemented
	}
	id, err := parseCatalogID(rawID)
	if err != nil {
		return response.AdminVPS{}, err
	}
	query, err := s.query(ctx, request.VPSListQuery{}, admin)
	if err != nil {
		return response.AdminVPS{}, err
	}
	var row entity.VPS
	if err := query.Select("vps_detail.*").Where("vps_detail.id = ?", id).First(&row).Error; err != nil {
		return response.AdminVPS{}, catalogDBError(err)
	}
	items, err := s.present(ctx, []entity.VPS{row})
	if err != nil {
		return response.AdminVPS{}, err
	}
	return items[0], nil
}

// CollectionAllowed 仅读取管理员保存的采集许可，供未来采集器在每次执行前检查。
// 许可不代表采集器已实现；此方法不会发出网络请求或更新库存。
func (s *VPSService) CollectionAllowed(ctx context.Context, rawID string) (bool, error) {
	if s.DB == nil {
		return false, errcode.NotImplemented
	}
	id, err := parseCatalogID(rawID)
	if err != nil {
		return false, err
	}
	var row entity.VPS
	if err := s.DB.WithContext(ctx).First(&row, id).Error; err != nil {
		return false, catalogDBError(err)
	}
	var count int64
	err = s.DB.WithContext(ctx).Model(&entity.VPS{}).
		Joins("JOIN merchant ON merchant.id = vps_detail.merchant_id AND merchant.deleted_at IS NULL").
		Where("vps_detail.id = ? AND vps_detail.enabled = ? AND vps_detail.collection_enabled = ? AND merchant.enabled = ? AND merchant.collection_enabled = ?", id, true, true, true, true).
		Where("EXISTS (SELECT 1 FROM site_settings WHERE deleted_at IS NULL AND collection_enabled = ?)", true).
		Count(&count).Error
	if err != nil {
		return false, catalogDBError(err)
	}
	return count > 0, nil
}

func (s *VPSService) ListCollectionTargets(ctx context.Context) ([]dto.CollectionTask, error) {
	var ct []dto.CollectionTask
	err := s.DB.WithContext(ctx).Model(&entity.VPS{}).
		Select("vps_detail.id as vps_id,merchant.code as merchant_code,vps_detail.purchase_url as source_url").
		Joins("join merchant on vps_detail.merchant_id = merchant.id").
		Where(
			"vps_detail.deleted_at IS NULL AND "+
				"merchant.deleted_at IS NULL AND "+
				"vps_detail.enabled = ? AND "+
				"vps_detail.collection_enabled = ? AND "+
				"merchant.enabled = ? AND "+
				"merchant.collection_enabled = ?", true, true, true, true).
		Where("EXISTS (SELECT 1 FROM site_settings WHERE deleted_at IS NULL AND collection_enabled = ?)", true).
		Scan(&ct).Error
	if err != nil {
		return nil, catalogDBError(err)
	}
	return ct, nil
}

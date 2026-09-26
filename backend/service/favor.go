package service

import (
	"context"
	"fmt"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
	"vpsmonitor/utils/pagination"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type FavorService struct {
	DB       *gorm.DB
	RedisCli *redis.Client
}

func NewFavorService(db *gorm.DB, redisCli *redis.Client) *FavorService {
	return &FavorService{DB: db, RedisCli: redisCli}
}

func (s *FavorService) AddFavors(ctx context.Context, uid string, vpsId string) error {
	id, err := parseCatalogID(vpsId)
	if err != nil {
		return err
	}
	normalizedID := catalogID(id)

	// 复用公开详情查询，检查产品、商家及公开可见状态。
	_, err = NewVPSService(s.DB, s.RedisCli).Info(ctx, normalizedID)
	if err != nil {
		return err
	}

	key := fmt.Sprintf("user:favors:%s", uid)
	return s.RedisCli.SAdd(ctx, key, normalizedID).Err()
}

func (s *FavorService) ListFavors(ctx context.Context, uid string, in request.VPSListQuery) (response.List[response.VPS], error) {
	page, size := pagination.Normalize(in.Page, in.PageSize)

	out := response.List[response.VPS]{
		Items:    make([]response.VPS, 0),
		Page:     page,
		PageSize: size,
	}

	// 复用公开查询规则，包括商家筛选、价格排序、
	// 产品与商家可见性检查等。
	vpsService := NewVPSService(s.DB, s.RedisCli)
	query, err := vpsService.query(ctx, in, false)
	if err != nil {
		return out, err
	}

	// 获取当前用户收藏的全部 ID。
	key := fmt.Sprintf("user:favors:%s", uid)
	members, err := s.RedisCli.SMembers(ctx, key).Result()
	if err != nil {
		return out, err
	}

	if len(members) == 0 {
		return out, nil
	}

	// 兼容此前可能写入的非法 ID，避免一条旧数据
	// 导致整个收藏列表无法展示。
	ids := make([]uint, 0, len(members))
	for _, member := range members {
		id, err := parseCatalogID(member)
		if err != nil {
			continue
		}
		ids = append(ids, id)
	}

	if len(ids) == 0 {
		return out, nil
	}

	// 必须先限定收藏范围，再统计总数和分页。
	query = query.Where("vps_detail.id IN ?", ids)

	if err := query.Count(&out.Total).Error; err != nil {
		return out, catalogDBError(err)
	}

	if out.Total == 0 {
		return out, nil
	}

	// 一次查询当前页产品，已删除或不可见的产品
	// 会被公开查询规则排除，不影响其他收藏。
	var rows []entity.VPS
	if err := query.
		Select("vps_detail.*").
		Offset((page - 1) * size).
		Limit(size).
		Find(&rows).Error; err != nil {
		return out, catalogDBError(err)
	}

	// 复用已有的批量商家、库存加载及响应组装。
	items, err := vpsService.present(ctx, rows)
	if err != nil {
		return out, err
	}

	for _, item := range items {
		// 只返回公开产品字段，不返回管理字段。
		out.Items = append(out.Items, item.VPS)
	}

	return out, nil
}

func (s *FavorService) DelFavors(ctx context.Context, uid string, vpsId string) error {
	id, err := parseCatalogID(vpsId)
	if err != nil {
		return err
	}
	normalizedID := catalogID(id)
	key := fmt.Sprintf("user:favors:%s", uid)
	return s.RedisCli.SRem(ctx, key, normalizedID).Err()
}

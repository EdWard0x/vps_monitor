package gormrepo

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"vpsmonitor/internal/domain"
	"vpsmonitor/internal/platform/apperror"
	"vpsmonitor/internal/ports"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Store 实现 ports.Repository。普通 Store 使用连接池，事务中的 Store 使用事务连接。
type Store struct{ db *gorm.DB }

func New(db *gorm.DB) *Store { return &Store{db: db} }
func (s *Store) Ping(ctx context.Context) error {
	d, e := s.db.DB()
	if e != nil {
		return e
	}
	return d.PingContext(ctx)
}

// Transaction 回调返回 nil 时提交，返回错误时回滚。
// 新 Store 包装 tx，使回调中的仓储调用使用相同事务；不会修改外面的 s.db。
func (s *Store) Transaction(ctx context.Context, fn func(ports.Repository) error) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(&Store{db: tx})
	})
}
func nf(e error) error {
	if errors.Is(e, gorm.ErrRecordNotFound) {
		return apperror.NotFound
	}
	return e
}

// GetSettings 把 key/value 行转换为有类型的设置；lock=true 用于事务内加更新锁。
// 按 key 排序让多个调用者以一致顺序锁设置行；当前要求正好存在六项设置。
func (s *Store) GetSettings(ctx context.Context, lock bool) (domain.Settings, time.Time, error) {
	var rows []domain.SiteSetting
	q := s.db.WithContext(ctx).Order("key")
	if lock {
		q = q.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	if e := q.Find(&rows).Error; e != nil {
		return domain.Settings{}, time.Time{}, e
	}
	if len(rows) != 6 {
		return domain.Settings{}, time.Time{}, fmt.Errorf("settings incomplete")
	}
	var out domain.Settings
	var updated time.Time
	for _, r := range rows {
		if r.UpdatedAt.After(updated) {
			updated = r.UpdatedAt
		}
		switch r.Key {
		case "site_name":
			out.SiteName = r.Value
		case "registration_enabled":
			out.RegistrationEnabled = r.Value == "true"
		case "comments_enabled":
			out.CommentsEnabled = r.Value == "true"
		case "anonymous_comments_enabled":
			out.AnonymousCommentsEnabled = r.Value == "true"
		case "comment_review_required":
			out.CommentReviewRequired = r.Value == "true"
		case "comment_max_depth":
			fmt.Sscanf(r.Value, "%d", &out.CommentMaxDepth)
		}
	}
	return out, updated, nil
}
func (s *Store) UpdateSettings(ctx context.Context, values map[string]string, actor int64) (domain.Settings, time.Time, error) {
	var out domain.Settings
	var at time.Time
	e := s.Transaction(ctx, func(r ports.Repository) error {
		st := r.(*Store)
		if _, _, e := st.GetSettings(ctx, true); e != nil {
			return e
		}
		now := time.Now().UTC()
		for _, k := range []string{"anonymous_comments_enabled", "comment_max_depth", "comment_review_required", "comments_enabled", "registration_enabled", "site_name"} {
			if v, ok := values[k]; ok {
				if e := st.db.WithContext(ctx).Model(&domain.SiteSetting{}).Where("key = ?", k).Updates(map[string]any{"value": v, "updated_by": actor, "updated_at": now}).Error; e != nil {
					return e
				}
			}
		}
		var e error
		out, at, e = st.GetSettings(ctx, false)
		return e
	})
	return out, at, e
}

func page(p ports.Page) ports.Page {
	if p.Page < 1 {
		p.Page = 1
	}
	if p.Size < 1 {
		p.Size = 20
	}
	if p.Size > 100 {
		p.Size = 100
	}
	return p
}

// ListMerchants 构建筛选后先 Count 总数，再按页查询。
// Where 的 ? 绑定参数值，Order 使用代码内固定字段，避免把用户输入直接拼进 SQL。
func (s *Store) ListMerchants(ctx context.Context, f ports.MerchantFilter, public bool) ([]domain.Merchant, int64, error) {
	p := page(f.Page)
	q := s.db.WithContext(ctx).Model(&domain.Merchant{})
	if public {
		q = q.Where("enabled = true")
	} else if f.Enabled != nil {
		q = q.Where("enabled = ?", *f.Enabled)
	}
	if f.Q != "" {
		x := "%" + escapeLike(strings.ToLower(f.Q)) + "%"
		q = q.Where("(LOWER(code) LIKE ? ESCAPE '\\' OR LOWER(name) LIKE ? ESCAPE '\\')", x, x)
	}
	var total int64
	if e := q.Count(&total).Error; e != nil {
		return nil, 0, e
	}
	var rows []domain.Merchant
	e := q.Order("created_at DESC, id DESC").Offset((p.Page - 1) * p.Size).Limit(p.Size).Find(&rows).Error
	return rows, total, e
}
func (s *Store) GetMerchant(ctx context.Context, id int64, public bool) (domain.Merchant, error) {
	var x domain.Merchant
	q := s.db.WithContext(ctx).Where("id = ?", id)
	if public {
		q = q.Where("enabled = true")
	}
	return x, nf(q.First(&x).Error)
}
func (s *Store) CreateMerchant(ctx context.Context, x domain.Merchant) (domain.Merchant, error) {
	x.CreatedAt = time.Now().UTC()
	x.UpdatedAt = x.CreatedAt
	if e := s.db.WithContext(ctx).Create(&x).Error; e != nil {
		if errors.Is(e, gorm.ErrDuplicatedKey) {
			return x, apperror.CodeExists
		}
		return x, e
	}
	return x, nil
}
func (s *Store) UpdateMerchant(ctx context.Context, id int64, v map[string]any) (domain.Merchant, error) {
	v["updated_at"] = time.Now().UTC()
	if enabled, ok := v["enabled"].(bool); ok && !enabled {
		return s.updateMerchantDisable(ctx, id, v)
	}
	r := s.db.WithContext(ctx).Model(&domain.Merchant{}).Where("id = ?", id).Updates(v)
	if r.Error != nil {
		return domain.Merchant{}, r.Error
	}
	if r.RowsAffected == 0 {
		return domain.Merchant{}, apperror.NotFound
	}
	return s.GetMerchant(ctx, id, false)
}

// updateMerchantDisable 停用商家时同时让旗下任务租约失效，阻止旧采集结果继续回写。
func (s *Store) updateMerchantDisable(ctx context.Context, id int64, v map[string]any) (domain.Merchant, error) {
	var out domain.Merchant
	e := s.Transaction(ctx, func(r ports.Repository) error {
		st := r.(*Store)
		var m domain.Merchant
		if e := st.db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&m, id).Error; e != nil {
			return nf(e)
		}
		var ids []int64
		if e := st.db.Model(&domain.VPS{}).Where("merchant_id = ?", id).Order("id").Pluck("id", &ids).Error; e != nil {
			return e
		}
		now := time.Now().UTC()
		if len(ids) > 0 {
			if e := st.db.Model(&domain.MonitorConfig{}).Where("vps_id IN ?", ids).Updates(map[string]any{"config_version": gorm.Expr("config_version + 1"), "lease_token": nil, "lease_expires_at": nil, "updated_at": now}).Error; e != nil {
				return e
			}
		}
		if e := st.db.Model(&m).Updates(v).Error; e != nil {
			return e
		}
		out = m
		return st.db.First(&out, id).Error
	})
	return out, e
}

func (s *Store) ListVPS(ctx context.Context, f ports.VPSFilter, public bool) ([]ports.PublicVPS, int64, error) {
	p := page(f.Page)
	q := s.db.WithContext(ctx).Model(&domain.VPS{}).Joins("JOIN merchant m ON m.id=vps_detail.merchant_id").Joins("JOIN vps_stocks st ON st.vps_id=vps_detail.id")
	if public {
		q = q.Where("vps_detail.enabled=true AND m.enabled=true")
	} else if f.Enabled != nil {
		q = q.Where("vps_detail.enabled=?", *f.Enabled)
	}
	if f.MerchantID != nil {
		q = q.Where("vps_detail.merchant_id=?", *f.MerchantID)
	}
	if f.Status != nil {
		q = q.Where("st.status=?", *f.Status)
	}
	if f.Q != "" {
		x := "%" + escapeLike(strings.ToLower(f.Q)) + "%"
		q = q.Where("(LOWER(vps_detail.code) LIKE ? ESCAPE '\\' OR LOWER(vps_detail.name) LIKE ? ESCAPE '\\')", x, x)
	}
	if f.Currency != "" {
		q = q.Where("vps_detail.currency=?", f.Currency)
	}
	if f.BillingPeriod != "" {
		q = q.Where("vps_detail.billing_period=?", f.BillingPeriod)
	}
	var total int64
	if e := q.Count(&total).Error; e != nil {
		return nil, 0, e
	}
	order := "vps_detail.created_at DESC, vps_detail.id DESC"
	if f.Sort == "price_asc" {
		order = "vps_detail.price_amount ASC, vps_detail.id ASC"
	} else if f.Sort == "price_desc" {
		order = "vps_detail.price_amount DESC, vps_detail.id DESC"
	}
	var vs []domain.VPS
	if e := q.Select("vps_detail.*").Order(order).Offset((p.Page - 1) * p.Size).Limit(p.Size).Find(&vs).Error; e != nil {
		return nil, 0, e
	}
	out, e := s.hydrate(ctx, vs)
	return out, total, e
}

// hydrate 批量查询商家、配置、库存，再按 ID 拼装，避免为每个套餐分别发三次关联查询。
// 下方 map 充当内存索引，不是数据库表。
func (s *Store) hydrate(ctx context.Context, vs []domain.VPS) ([]ports.PublicVPS, error) {
	if len(vs) == 0 {
		return []ports.PublicVPS{}, nil
	}
	ids := make([]int64, len(vs))
	mids := map[int64]bool{}
	for i, v := range vs {
		ids[i] = v.ID
		mids[v.MerchantID] = true
	}
	mi := make([]int64, 0, len(mids))
	for id := range mids {
		mi = append(mi, id)
	}
	var ms []domain.Merchant
	var cs []domain.MonitorConfig
	var ss []domain.Stock
	if e := s.db.WithContext(ctx).Where("id IN ?", mi).Find(&ms).Error; e != nil {
		return nil, e
	}
	if e := s.db.WithContext(ctx).Where("vps_id IN ?", ids).Find(&cs).Error; e != nil {
		return nil, e
	}
	if e := s.db.WithContext(ctx).Where("vps_id IN ?", ids).Find(&ss).Error; e != nil {
		return nil, e
	}
	mm := map[int64]domain.Merchant{}
	cm := map[int64]domain.MonitorConfig{}
	sm := map[int64]domain.Stock{}
	for _, x := range ms {
		mm[x.ID] = x
	}
	for _, x := range cs {
		cm[x.VPSID] = x
	}
	for _, x := range ss {
		sm[x.VPSID] = x
	}
	out := make([]ports.PublicVPS, 0, len(vs))
	for _, v := range vs {
		out = append(out, ports.PublicVPS{VPS: v, Merchant: mm[v.MerchantID], Config: cm[v.ID], Stock: sm[v.ID]})
	}
	return out, nil
}
func (s *Store) GetVPS(ctx context.Context, id int64, public bool) (ports.PublicVPS, error) {
	var v domain.VPS
	q := s.db.WithContext(ctx).Model(&domain.VPS{}).Joins("JOIN merchant m ON m.id=vps_detail.merchant_id").Where("vps_detail.id=?", id)
	if public {
		q = q.Where("vps_detail.enabled=true AND m.enabled=true")
	}
	if e := q.Select("vps_detail.*").First(&v).Error; e != nil {
		return ports.PublicVPS{}, nf(e)
	}
	x, e := s.hydrate(ctx, []domain.VPS{v})
	if e != nil {
		return ports.PublicVPS{}, e
	}
	return x[0], nil
}

// CreateVPS 在同一事务创建套餐、配置和初始未知库存，避免只插入一部分记录。
func (s *Store) CreateVPS(ctx context.Context, v domain.VPS, c domain.MonitorConfig) (ports.PublicVPS, error) {
	var out ports.PublicVPS
	e := s.Transaction(ctx, func(r ports.Repository) error {
		st := r.(*Store)
		var m domain.Merchant
		if e := st.db.First(&m, v.MerchantID).Error; e != nil {
			return nf(e)
		}
		now := time.Now().UTC()
		v.CreatedAt = now
		v.UpdatedAt = now
		if e := st.db.Create(&v).Error; e != nil {
			if errors.Is(e, gorm.ErrDuplicatedKey) {
				return apperror.CodeExists
			}
			return e
		}
		c.VPSID = v.ID
		c.NextCheckAt = now
		c.ConfigVersion = 1
		c.UpdatedAt = now
		if e := st.db.Create(&c).Error; e != nil {
			return e
		}
		stock := domain.Stock{VPSID: v.ID, Status: 3, UpdatedAt: now}
		if e := st.db.Create(&stock).Error; e != nil {
			return e
		}
		var e error
		out, e = st.GetVPS(ctx, v.ID, false)
		return e
	})
	return out, e
}
func (s *Store) UpdateVPS(ctx context.Context, id int64, v map[string]any) (ports.PublicVPS, error) {
	v["updated_at"] = time.Now().UTC()
	var out ports.PublicVPS
	e := s.Transaction(ctx, func(r ports.Repository) error {
		st := r.(*Store)
		var row domain.VPS
		if e := st.db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&row, id).Error; e != nil {
			return nf(e)
		}
		if enabled, ok := v["enabled"].(bool); ok && !enabled {
			if e := st.db.Model(&domain.MonitorConfig{}).Where("vps_id=?", id).Updates(map[string]any{"config_version": gorm.Expr("config_version+1"), "lease_token": nil, "lease_expires_at": nil, "updated_at": time.Now().UTC()}).Error; e != nil {
				return e
			}
		}
		if e := st.db.Model(&row).Updates(v).Error; e != nil {
			return e
		}
		var e error
		out, e = st.GetVPS(ctx, id, false)
		return e
	})
	return out, e
}

func (s *Store) GetUserByUsername(ctx context.Context, name string) (domain.User, error) {
	var u domain.User
	return u, nf(s.db.WithContext(ctx).Where("username=?", name).First(&u).Error)
}
func (s *Store) GetUser(ctx context.Context, id int64) (domain.User, error) {
	var u domain.User
	return u, nf(s.db.WithContext(ctx).First(&u, id).Error)
}
func (s *Store) CreateUser(ctx context.Context, u domain.User) (domain.User, error) {
	u.CreatedAt = time.Now().UTC()
	u.UpdatedAt = u.CreatedAt
	if e := s.db.WithContext(ctx).Create(&u).Error; e != nil {
		if errors.Is(e, gorm.ErrDuplicatedKey) {
			return u, apperror.UsernameExists
		}
		return u, e
	}
	return u, nil
}

// UpdateUser 还承担末位管理员保护，并非单纯的 UPDATE 包装。
// 涉及角色/启用状态时先锁 site_name 设置行，让并发操作串行检查管理员数量。
func (s *Store) UpdateUser(ctx context.Context, id int64, v map[string]any) (domain.User, error) {
	var out domain.User
	e := s.Transaction(ctx, func(r ports.Repository) error {
		st := r.(*Store)
		if _, ok := v["role"]; ok || v["enabled"] != nil {
			var guard domain.SiteSetting
			if e := st.db.Clauses(clause.Locking{Strength: "UPDATE"}).Where("key='site_name'").First(&guard).Error; e != nil {
				return e
			}
		}
		var u domain.User
		if e := st.db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&u, id).Error; e != nil {
			return nf(e)
		}
		newRole := u.Role
		if x, ok := v["role"].(string); ok {
			newRole = x
		}
		newEnabled := u.Enabled
		if x, ok := v["enabled"].(bool); ok {
			newEnabled = x
		}
		if u.Role == "admin" && u.Enabled && !(newRole == "admin" && newEnabled) {
			var n int64
			if e := st.db.Model(&domain.User{}).Where("role='admin' AND enabled=true").Count(&n).Error; e != nil {
				return e
			}
			if n <= 1 {
				return apperror.LastAdmin
			}
		}
		v["updated_at"] = time.Now().UTC()
		if e := st.db.Model(&u).Updates(v).Error; e != nil {
			return e
		}
		// 此分支意图在角色/状态变化后撤销会话；需留意上面的 Updates 会更新模型字段。
		// 变化判断的时机和下方未检查的数据库错误都是后续应补测试、核实的维护点。
		if newRole != u.Role || newEnabled != u.Enabled {
			st.db.Model(&domain.Session{}).Where("user_id=? AND revoked_at IS NULL", id).Updates(map[string]any{"revoked_at": time.Now().UTC(), "updated_at": time.Now().UTC()})
		}
		return st.db.First(&out, id).Error
	})
	return out, e
}
func (s *Store) ListUsers(ctx context.Context, f ports.UserFilter) ([]domain.User, int64, error) {
	p := page(f.Page)
	q := s.db.WithContext(ctx).Model(&domain.User{})
	if f.Q != "" {
		x := "%" + escapeLike(strings.ToLower(f.Q)) + "%"
		q = q.Where("LOWER(username) LIKE ? ESCAPE '\\' OR LOWER(nickname) LIKE ? ESCAPE '\\'", x, x)
	}
	if f.Role != "" {
		q = q.Where("role=?", f.Role)
	}
	if f.Enabled != nil {
		q = q.Where("enabled=?", *f.Enabled)
	}
	var n int64
	if e := q.Count(&n).Error; e != nil {
		return nil, 0, e
	}
	var x []domain.User
	e := q.Order("created_at DESC,id DESC").Offset((p.Page - 1) * p.Size).Limit(p.Size).Find(&x).Error
	return x, n, e
}

func (s *Store) CreateSession(ctx context.Context, x domain.Session) error {
	return s.db.WithContext(ctx).Create(&x).Error
}
func (s *Store) GetSessionUser(ctx context.Context, sid string) (domain.Session, domain.User, error) {
	var x domain.Session
	if e := s.db.WithContext(ctx).First(&x, "id=?", sid).Error; e != nil {
		return x, domain.User{}, nf(e)
	}
	u, e := s.GetUser(ctx, x.UserID)
	return x, u, e
}

// RotateSession 锁用户、再锁会话，保证同一刷新 JTI 的并发请求不会都轮换成功。
// reused 分支先提交撤销，Service 再转换为业务错误；若回调直接返回业务错误，撤销也会回滚。
func (s *Store) RotateSession(ctx context.Context, sid string, userID int64, current, newHash string, now time.Time) (string, error) {
	result := "invalid"
	e := s.Transaction(ctx, func(r ports.Repository) error {
		st := r.(*Store)
		var u domain.User
		if e := st.db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&u, userID).Error; e != nil {
			return nil
		}
		var x domain.Session
		if e := st.db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&x, "id=? AND user_id=?", sid, userID).Error; e != nil {
			return nil
		}
		if !u.Enabled {
			return nil
		}
		if x.RevokedAt != nil || !x.RefreshExpiresAt.After(now) {
			return nil
		}
		if x.RefreshJTIHash != current {
			result = "reused"
			return st.db.Model(&x).Updates(map[string]any{"revoked_at": now, "updated_at": now}).Error
		}
		result = "ok"
		return st.db.Model(&x).Updates(map[string]any{"refresh_jti_hash": newHash, "updated_at": now}).Error
	})
	return result, e
}
func (s *Store) RevokeSession(ctx context.Context, sid string, userID int64) error {
	return s.db.WithContext(ctx).Model(&domain.Session{}).Where("id=? AND user_id=? AND revoked_at IS NULL", sid, userID).Updates(map[string]any{"revoked_at": time.Now().UTC(), "updated_at": time.Now().UTC()}).Error
}
func (s *Store) RevokeAllSessions(ctx context.Context, userID int64, now time.Time) (int64, error) {
	r := s.db.WithContext(ctx).Model(&domain.Session{}).Where("user_id=? AND revoked_at IS NULL", userID).Updates(map[string]any{"revoked_at": now, "updated_at": now})
	return r.RowsAffected, r.Error
}
func (s *Store) ListSessions(ctx context.Context, userID int64, p ports.Page) ([]domain.Session, int64, error) {
	p = page(p)
	q := s.db.WithContext(ctx).Model(&domain.Session{}).Where("user_id=? AND revoked_at IS NULL AND refresh_expires_at > ?", userID, time.Now().UTC())
	var n int64
	if e := q.Count(&n).Error; e != nil {
		return nil, 0, e
	}
	var x []domain.Session
	e := q.Order("created_at DESC,id DESC").Offset((p.Page - 1) * p.Size).Limit(p.Size).Find(&x).Error
	return x, n, e
}

// escapeLike 把 % 和 _ 当普通搜索字符，避免输入意外变成 LIKE 通配符。
func escapeLike(s string) string {
	return strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(s)
}
func newLeaseToken() string { return uuid.NewString() }

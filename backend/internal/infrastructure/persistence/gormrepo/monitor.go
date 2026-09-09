package gormrepo

import (
	"context"
	"math/rand/v2"
	"time"
	"vpsmonitor/internal/domain"
	"vpsmonitor/internal/platform/apperror"
	"vpsmonitor/internal/ports"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (s *Store) ListMonitors(ctx context.Context, f ports.MonitorFilter) ([]ports.MonitorRow, int64, error) {
	vf := ports.VPSFilter{MerchantID: f.MerchantID, Status: f.Status, Q: f.Q, Enabled: f.Enabled, Page: f.Page}
	xs, n, e := s.ListVPS(ctx, vf, false)
	if e != nil {
		return nil, 0, e
	}
	out := make([]ports.MonitorRow, len(xs))
	for i, x := range xs {
		out[i] = ports.MonitorRow{PublicVPS: x}
	}
	return out, n, nil
}

// UpdateMonitor 用 expected 与当前版本比较，发现管理员在编辑期间数据被更新就返回冲突。
// 成功后递增版本并清空租约，使旧配置启动的采集结果失去回写资格。
func (s *Store) UpdateMonitor(ctx context.Context, id int64, c domain.MonitorConfig, expected int64) (domain.MonitorConfig, error) {
	var out domain.MonitorConfig
	e := s.Transaction(ctx, func(r ports.Repository) error {
		st := r.(*Store)
		var old domain.MonitorConfig
		if e := st.db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&old, "vps_id=?", id).Error; e != nil {
			return nf(e)
		}
		if old.ConfigVersion != expected {
			return apperror.VersionConflict
		}
		now := time.Now().UTC()
		v := map[string]any{"source_url": c.SourceURL, "collector_code": c.CollectorCode, "poll_interval_seconds": c.PollIntervalSeconds, "timeout_seconds": c.TimeoutSeconds, "enabled": c.Enabled, "config_version": old.ConfigVersion + 1, "lease_token": nil, "lease_expires_at": nil, "updated_at": now}
		if c.Enabled {
			v["next_check_at"] = now
		}
		if e := st.db.Model(&old).Updates(v).Error; e != nil {
			return e
		}
		return st.db.First(&out, "vps_id=?", id).Error
	})
	return out, e
}

// QueueCheck 只把下次检查时间改为现在，不在 HTTP 请求内直接执行采集。
// 真正采集要等独立 Worker 下一次扫描；HTTP 202 表示已安排，并非采集完成。
func (s *Store) QueueCheck(ctx context.Context, id int64) (domain.MonitorConfig, error) {
	var out domain.MonitorConfig
	e := s.Transaction(ctx, func(r ports.Repository) error {
		st := r.(*Store)
		var v domain.VPS
		if e := st.db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&v, id).Error; e != nil {
			return apperror.VPSNotFound
		}
		var m domain.Merchant
		if e := st.db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&m, v.MerchantID).Error; e != nil {
			return e
		}
		var c domain.MonitorConfig
		if e := st.db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&c, "vps_id=?", id).Error; e != nil {
			return e
		}
		now := time.Now().UTC()
		if !m.Enabled || !v.Enabled || !c.Enabled {
			return apperror.MonitorDisabled
		}
		if c.LeaseExpiresAt != nil && c.LeaseExpiresAt.After(now) {
			return apperror.MonitorBusy
		}
		if e := st.db.Model(&c).Updates(map[string]any{"next_check_at": now, "config_version": c.ConfigVersion + 1, "lease_token": nil, "lease_expires_at": nil, "updated_at": now}).Error; e != nil {
			return e
		}
		return st.db.First(&out, "vps_id=?", id).Error
	})
	return out, e
}

// ClaimDue 先找候选 ID，再逐个在事务内重新检查并写租约；候选列表本身不代表领取成功。
// 配置行上的 SKIP LOCKED 表示遇到被其他事务锁住的配置时跳过，而不是一直等它。
// 当前锁顺序为套餐 → 商家 → 配置，与设计文档的商家优先顺序不同，不能照搬为全局锁约定。
func (s *Store) ClaimDue(ctx context.Context, now time.Time, limit int) ([]ports.Lease, error) {
	var ids []int64
	e := s.db.WithContext(ctx).Table("vps_monitor_configs c").Joins("JOIN vps_detail v ON v.id=c.vps_id JOIN merchant m ON m.id=v.merchant_id").Where("c.enabled=true AND v.enabled=true AND m.enabled=true AND c.next_check_at<=? AND (c.lease_token IS NULL OR c.lease_expires_at<=?)", now, now).Order("c.next_check_at,c.vps_id").Limit(limit).Pluck("c.vps_id", &ids).Error
	if e != nil {
		return nil, e
	}
	out := []ports.Lease{}
	for _, id := range ids {
		var lease ports.Lease
		e := s.Transaction(ctx, func(r ports.Repository) error {
			st := r.(*Store)
			var v domain.VPS
			if e := st.db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&v, id).Error; e != nil {
				return e
			}
			var m domain.Merchant
			if e := st.db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&m, v.MerchantID).Error; e != nil {
				return e
			}
			var c domain.MonitorConfig
			if e := st.db.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).First(&c, "vps_id=?", id).Error; e != nil {
				return e
			}
			if !m.Enabled || !v.Enabled || !c.Enabled || c.NextCheckAt.After(now) || (c.LeaseExpiresAt != nil && c.LeaseExpiresAt.After(now)) {
				return nil
			}
			token := newLeaseToken()
			expires := now.Add(time.Duration(c.TimeoutSeconds+30) * time.Second)
			res := st.db.Model(&c).Where("vps_id=? AND config_version=?", id, c.ConfigVersion).Updates(map[string]any{"lease_token": token, "lease_expires_at": expires, "updated_at": now})
			if res.Error != nil || res.RowsAffected != 1 {
				return res.Error
			}
			c.LeaseToken = &token
			c.LeaseExpiresAt = &expires
			lease = ports.Lease{VPS: v, Config: c, Token: token, Version: c.ConfigVersion}
			return nil
		})
		if e != nil && e != gorm.ErrRecordNotFound {
			return nil, e
		}
		if lease.Token != "" {
			out = append(out, lease)
		}
	}
	return out, nil
}

// CompleteLease 重新核对启用状态、版本、租约标识和有效期，合格才更新库存并释放租约。
// 不再合格的旧结果直接丢弃并返回 nil：这是正常的过期结果处理，不代表库存一定被更新。
func (s *Store) CompleteLease(ctx context.Context, l ports.Lease, o domain.Observation, now time.Time) error {
	return s.Transaction(ctx, func(r ports.Repository) error {
		st := r.(*Store)
		var v domain.VPS
		if e := st.db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&v, l.VPS.ID).Error; e != nil {
			return e
		}
		var m domain.Merchant
		if e := st.db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&m, v.MerchantID).Error; e != nil {
			return e
		}
		var c domain.MonitorConfig
		if e := st.db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&c, "vps_id=?", v.ID).Error; e != nil {
			return e
		}
		if !m.Enabled || !v.Enabled || !c.Enabled || c.ConfigVersion != l.Version || c.LeaseToken == nil || *c.LeaseToken != l.Token || c.LeaseExpiresAt == nil || !c.LeaseExpiresAt.After(now) {
			return nil
		}
		var stock domain.Stock
		if e := st.db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&stock, "vps_id=?", v.ID).Error; e != nil {
			return e
		}
		updates := map[string]any{"status": o.Status, "quantity": o.Quantity, "last_checked_at": now, "updated_at": now, "last_error_code": nil}
		if o.Status == 1 {
			updates["last_in_stock_at"] = now
		}
		if o.Status == 3 {
			updates["quantity"] = nil
			if o.ErrorCode != "" {
				updates["last_error_code"] = o.ErrorCode
			}
		}
		if e := st.db.Model(&stock).Updates(updates).Error; e != nil {
			return e
		}
		// 在轮询间隔上增加最多约 10% 的随机延迟，减少很多任务同一时刻再次启动。
		base := time.Duration(c.PollIntervalSeconds) * time.Second
		jitter := time.Duration(0)
		if max := int64(base / 10); max > 0 {
			jitter = time.Duration(rand.Int64N(max + 1))
		}
		return st.db.Model(&c).Updates(map[string]any{"lease_token": nil, "lease_expires_at": nil, "next_check_at": now.Add(base + jitter), "updated_at": now}).Error
	})
}

// Dashboard 汇总后台统计。部分 Count 尚未检查 Error，不能把查询失败等同于真实的零数量。
func (s *Store) Dashboard(ctx context.Context) (map[string]any, error) {
	out := map[string]any{}
	for table, key := range map[string]string{"merchant": "merchant_count", "vps_detail": "vps_count", "users": "user_count"} {
		var n int64
		if e := s.db.WithContext(ctx).Table(table).Count(&n).Error; e != nil {
			return nil, e
		}
		out[key] = n
	}
	var enabled int64
	s.db.WithContext(ctx).Model(&domain.User{}).Where("enabled=true").Count(&enabled)
	out["enabled_user_count"] = enabled
	counts := map[string]int64{"in_stock": 0, "out_of_stock": 0, "unknown": 0}
	for st, key := range map[int]string{1: "in_stock", 2: "out_of_stock", 3: "unknown"} {
		var n int64
		s.db.WithContext(ctx).Table("vps_stocks s").Joins("JOIN vps_detail v ON v.id=s.vps_id JOIN merchant m ON m.id=v.merchant_id").Where("v.enabled=true AND m.enabled=true AND s.status=?", st).Count(&n)
		counts[key] = n
	}
	out["stock_counts"] = counts
	var pending int64
	s.db.WithContext(ctx).Model(&domain.Comment{}).Where("visibility=2").Count(&pending)
	out["pending_comment_count"] = pending
	now := time.Now().UTC()
	var due int64
	s.db.WithContext(ctx).Table("vps_monitor_configs c").Joins("JOIN vps_detail v ON v.id=c.vps_id JOIN merchant m ON m.id=v.merchant_id").Where("c.enabled=true AND v.enabled=true AND m.enabled=true AND c.next_check_at<=? AND (c.lease_token IS NULL OR c.lease_expires_at<=?)", now, now).Count(&due)
	out["monitor_due_count"] = due
	var stock domain.Stock
	e := s.db.WithContext(ctx).Where("last_checked_at IS NOT NULL").Order("last_checked_at DESC").First(&stock).Error
	if e == gorm.ErrRecordNotFound {
		out["last_checked_at"] = nil
	} else if e != nil {
		return nil, e
	} else {
		out["last_checked_at"] = stock.LastCheckedAt
	}
	return out, nil
}

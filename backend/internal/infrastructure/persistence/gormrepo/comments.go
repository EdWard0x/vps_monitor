package gormrepo

import (
	"context"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"strings"
	"time"
	"vpsmonitor/internal/domain"
	"vpsmonitor/internal/platform/apperror"
	"vpsmonitor/internal/ports"
)

// CreateComment 在事务里读取开关和父节点，决定审核状态、根节点和深度后插入。
// 当前这些规则位于仓储；阅读 Service.CreateComment 时要继续跟到这里。
func (s *Store) CreateComment(ctx context.Context, vpsID, userID int64, content string, anon bool, parentID *int64) (domain.Comment, error) {
	var out domain.Comment
	e := s.Transaction(ctx, func(r ports.Repository) error {
		st := r.(*Store)
		settings, _, e := st.GetSettings(ctx, true)
		if e != nil {
			return e
		}
		if !settings.CommentsEnabled {
			return apperror.CommentsDisabled
		}
		if anon && !settings.AnonymousCommentsEnabled {
			return apperror.AnonymousDisabled
		}
		var v domain.VPS
		if e = st.db.Joins("JOIN merchant m ON m.id=vps_detail.merchant_id").Where("vps_detail.id=? AND vps_detail.enabled=true AND m.enabled=true", vpsID).First(&v).Error; e != nil {
			return apperror.VPSNotFound
		}
		var u domain.User
		if e = st.db.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id=? AND enabled=true", userID).First(&u).Error; e != nil {
			return apperror.UserDisabled
		}
		c := domain.Comment{VPSID: vpsID, UserID: userID, UserNickname: u.Nickname, Content: content, IsAnonymous: anon, Visibility: 1, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}
		if settings.CommentReviewRequired {
			c.Visibility = 2
		}
		if parentID != nil {
			var p domain.Comment
			if e = st.db.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id=? AND vps_id=?", *parentID, vpsID).First(&p).Error; e != nil {
				return apperror.ParentNotFound
			}
			if p.Visibility != 1 {
				return apperror.ParentUnavailable
			}
			c.ParentID = parentID
			c.Depth = p.Depth + 1
			if c.Depth > int16(settings.CommentMaxDepth) {
				return apperror.DepthExceeded
			}
			if p.RootID != nil {
				c.RootID = p.RootID
			} else {
				x := p.ID
				c.RootID = &x
			}
		}
		if e = st.db.Create(&c).Error; e != nil {
			return e
		}
		out = c
		return nil
	})
	return out, e
}

// renderableSQL 判断“节点是否需要出现在公开评论树中”：自身可见，或存在可见后代。
// 后一种情况保留隐藏/删除节点的位置，HTTP 层再把它转换为占位文字。
// 四组 parent_id 分支依次寻找 1～4 层后代，对应当前最大深度 4；扩展层数需同步审查此 SQL。
const renderableSQL = `(comments.visibility = 1 OR EXISTS (SELECT 1 FROM comments d WHERE d.vps_id=comments.vps_id AND d.visibility=1 AND (d.parent_id=comments.id OR d.parent_id IN (SELECT id FROM comments d1 WHERE d1.parent_id=comments.id) OR d.parent_id IN (SELECT d2.id FROM comments d2 JOIN comments d1 ON d2.parent_id=d1.id WHERE d1.parent_id=comments.id) OR d.parent_id IN (SELECT d3.id FROM comments d3 JOIN comments d2 ON d3.parent_id=d2.id JOIN comments d1 ON d2.parent_id=d1.id WHERE d1.parent_id=comments.id))))`

func (s *Store) GetComment(ctx context.Context, id int64) (ports.CommentRow, error) {
	var c domain.Comment
	if e := s.db.WithContext(ctx).Joins("JOIN vps_detail v ON v.id=comments.vps_id JOIN merchant m ON m.id=v.merchant_id").Where("comments.id=? AND v.enabled=true AND m.enabled=true", id).Select("comments.*").First(&c).Error; e != nil {
		return ports.CommentRow{}, nf(e)
	}
	var render int64
	if e := s.db.WithContext(ctx).Model(&domain.Comment{}).Where("id=?", id).Where(renderableSQL).Count(&render).Error; e != nil {
		return ports.CommentRow{}, e
	}
	if render == 0 {
		return ports.CommentRow{}, apperror.NotFound
	}
	var count int64
	s.db.WithContext(ctx).Model(&domain.Comment{}).Where("vps_id=? AND parent_id=?", c.VPSID, c.ID).Where(renderableSQL).Count(&count)
	return ports.CommentRow{Comment: c, ReplyCount: count, Renderable: true}, nil
}
func (s *Store) ListComments(ctx context.Context, vpsID int64, parentID *int64, after *time.Time, afterID int64, limit int, rootDesc bool) ([]ports.CommentRow, error) {
	q := s.db.WithContext(ctx).Model(&domain.Comment{}).Where("comments.vps_id=?", vpsID).Where(renderableSQL)
	if parentID == nil {
		q = q.Where("comments.parent_id IS NULL")
	} else {
		q = q.Where("comments.parent_id=?", *parentID)
	}
	if after != nil {
		if rootDesc {
			q = q.Where("(comments.created_at < ? OR (comments.created_at=? AND comments.id < ?))", *after, *after, afterID)
		} else {
			q = q.Where("(comments.created_at > ? OR (comments.created_at=? AND comments.id > ?))", *after, *after, afterID)
		}
	}
	order := "comments.created_at ASC, comments.id ASC"
	if rootDesc {
		order = "comments.created_at DESC, comments.id DESC"
	}
	var cs []domain.Comment
	if e := q.Order(order).Limit(limit).Find(&cs).Error; e != nil {
		return nil, e
	}
	return s.commentRows(ctx, cs)
}
func (s *Store) SearchComments(ctx context.Context, vpsID int64, query string, after *time.Time, afterID int64, limit int) ([]ports.CommentRow, error) {
	q := s.db.WithContext(ctx).Model(&domain.Comment{}).Joins("JOIN vps_detail v ON v.id=comments.vps_id JOIN merchant m ON m.id=v.merchant_id").Where("comments.vps_id=? AND comments.visibility=1 AND v.enabled=true AND m.enabled=true", vpsID)
	x := "%" + escapeLike(strings.ToLower(query)) + "%"
	q = q.Where("LOWER(comments.content) LIKE ? ESCAPE '\\'", x)
	if after != nil {
		q = q.Where("(comments.created_at < ? OR (comments.created_at=? AND comments.id < ?))", *after, *after, afterID)
	}
	var cs []domain.Comment
	if e := q.Select("comments.*").Order("comments.created_at DESC,comments.id DESC").Limit(limit).Find(&cs).Error; e != nil {
		return nil, e
	}
	return s.commentRows(ctx, cs)
}

// commentRows 为每个节点统计需要展示的直接回复数，包含必要的占位节点。
// 当前逐条 Count，会增加列表查询次数；与 VPS 的批量 hydrate 对照阅读可理解 N+1 查询问题。
func (s *Store) commentRows(ctx context.Context, cs []domain.Comment) ([]ports.CommentRow, error) {
	out := make([]ports.CommentRow, 0, len(cs))
	for _, c := range cs {
		var n int64
		if e := s.db.WithContext(ctx).Model(&domain.Comment{}).Where("vps_id=? AND parent_id=?", c.VPSID, c.ID).Where(renderableSQL).Count(&n).Error; e != nil {
			return nil, e
		}
		out = append(out, ports.CommentRow{Comment: c, ReplyCount: n, Renderable: true})
	}
	return out, nil
}
func (s *Store) ListOwnComments(ctx context.Context, userID int64, f ports.CommentFilter) ([]domain.Comment, int64, error) {
	p := page(f.Page)
	q := s.db.WithContext(ctx).Model(&domain.Comment{}).Where("user_id=?", userID)
	if f.Visibility != nil {
		q = q.Where("visibility=?", *f.Visibility)
	}
	var n int64
	if e := q.Count(&n).Error; e != nil {
		return nil, 0, e
	}
	var x []domain.Comment
	e := q.Order("created_at DESC,id DESC").Offset((p.Page - 1) * p.Size).Limit(p.Size).Find(&x).Error
	return x, n, e
}

// DeleteOwnComment 先核对作者，再清空正文并标记删除，保留树节点及回复关系。
func (s *Store) DeleteOwnComment(ctx context.Context, id, userID int64) error {
	var c domain.Comment
	if e := s.db.WithContext(ctx).First(&c, id).Error; e != nil {
		return nf(e)
	}
	if c.UserID != userID {
		return apperror.CommentNotOwned
	}
	if c.Visibility == 4 {
		return nil
	}
	return s.db.WithContext(ctx).Model(&c).Updates(map[string]any{"visibility": 4, "content": "", "updated_at": time.Now().UTC()}).Error
}
func (s *Store) ListAdminComments(ctx context.Context, f ports.CommentFilter) ([]ports.CommentRow, int64, error) {
	p := page(f.Page)
	q := s.db.WithContext(ctx).Model(&domain.Comment{})
	if f.VPSID != nil {
		q = q.Where("vps_id=?", *f.VPSID)
	}
	if f.UserID != nil {
		q = q.Where("user_id=?", *f.UserID)
	}
	if f.Visibility != nil {
		q = q.Where("visibility=?", *f.Visibility)
	}
	if f.IsAnonymous != nil {
		q = q.Where("is_anonymous=?", *f.IsAnonymous)
	}
	if f.Q != "" {
		q = q.Where("LOWER(content) LIKE ? ESCAPE '\\'", "%"+escapeLike(strings.ToLower(f.Q))+"%")
	}
	var n int64
	if e := q.Count(&n).Error; e != nil {
		return nil, 0, e
	}
	var cs []domain.Comment
	if e := q.Order("created_at DESC,id DESC").Offset((p.Page - 1) * p.Size).Limit(p.Size).Find(&cs).Error; e != nil {
		return nil, 0, e
	}
	out := make([]ports.CommentRow, 0, len(cs))
	for _, c := range cs {
		var u domain.User
		if e := s.db.WithContext(ctx).First(&u, c.UserID).Error; e != nil {
			return nil, 0, e
		}
		out = append(out, ports.CommentRow{Comment: c, User: u})
	}
	return out, n, nil
}
func (s *Store) SetCommentVisibility(ctx context.Context, id int64, v int16) (ports.CommentRow, error) {
	var out ports.CommentRow
	e := s.Transaction(ctx, func(r ports.Repository) error {
		st := r.(*Store)
		var c domain.Comment
		if e := st.db.WithContext(ctx).Clauses(clause.Locking{Strength: "UPDATE"}).First(&c, id).Error; e != nil {
			return nf(e)
		}
		if c.Visibility == 4 {
			return apperror.CommentStateConflict
		}
		if e := st.db.WithContext(ctx).Model(&c).Updates(map[string]any{"visibility": v, "updated_at": time.Now().UTC()}).Error; e != nil {
			return e
		}
		c.Visibility = v
		u, e := st.GetUser(ctx, c.UserID)
		out = ports.CommentRow{Comment: c, User: u}
		return e
	})
	return out, e
}
func (s *Store) DeleteComment(ctx context.Context, id int64) error {
	return s.Transaction(ctx, func(r ports.Repository) error {
		st := r.(*Store)
		var c domain.Comment
		if e := st.db.WithContext(ctx).Clauses(clause.Locking{Strength: "UPDATE"}).First(&c, id).Error; e != nil {
			return nf(e)
		}
		if c.Visibility == 4 {
			return nil
		}
		return st.db.WithContext(ctx).Model(&c).Updates(map[string]any{"visibility": 4, "content": "", "updated_at": time.Now().UTC()}).Error
	})
}

var _ = gorm.ErrRecordNotFound

package service

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	authiface "vpsmonitor/iface/auth"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
	"vpsmonitor/utils/pagination"
)

type UserService struct {
	DB        *gorm.DB
	passwords authiface.PasswordProvider
}

func NewUserService(db *gorm.DB, passwords authiface.PasswordProvider) *UserService {
	return &UserService{DB: db, passwords: passwords}
}

func (s *UserService) GetMe(ctx context.Context, id string) (response.AccountUser, error) {
	user, err := findAccount(ctx, s.DB, id, false)
	return accountDetails(user), err
}

func (s *UserService) UpdateMe(ctx context.Context, id string, in request.UpdateMe) (response.AccountUser, error) {
	user, err := s.updateNickname(ctx, id, in.Nickname)
	return accountDetails(user), err
}

// ChangePassword 锁定账号后校验旧密码，在同一事务修改哈希并撤销全部旧令牌。
func (s *UserService) ChangePassword(ctx context.Context, id string, in request.ChangePassword) error {
	return s.changePassword(ctx, id, in.CurrentPassword, in.NewPassword, true)
}

func (s *UserService) ListUsers(ctx context.Context, in request.UserListQuery) (response.List[response.AdminUser], error) {
	page, size := pagination.Normalize(in.Page, in.PageSize)
	out := response.List[response.AdminUser]{Items: []response.AdminUser{}, Page: page, PageSize: size}
	if s.DB == nil {
		return out, errcode.NotImplemented
	}
	if in.Role != "" && in.Role != "user" && in.Role != "admin" {
		return out, errcode.InvalidArgument
	}
	query := s.DB.WithContext(ctx).Model(&entity.User{})
	if in.Role != "" {
		query = query.Where("users.role = ?", in.Role)
	}
	if q := strings.TrimSpace(in.Q); q != "" {
		q = "%" + strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(strings.ToLower(q)) + "%"
		query = query.Where("(LOWER(users.username) LIKE ? OR LOWER(users.nickname) LIKE ?)", q, q)
	}
	frozenExpr := "EXISTS (SELECT 1 FROM fronze WHERE fronze.user_id = users.id AND fronze.deleted_at IS NULL)"
	if in.Frozen != nil {
		query = query.Where(frozenExpr+" = ?", *in.Frozen)
	}
	if err := query.Count(&out.Total).Error; err != nil {
		return out, errcode.DatabaseError
	}
	var rows []struct {
		entity.User
		Frozen bool
	}
	if err := query.Select("users.*, " + frozenExpr + " AS frozen").Order("users.id DESC").Offset((page - 1) * size).Limit(size).Scan(&rows).Error; err != nil {
		return out, errcode.DatabaseError
	}
	for _, row := range rows {
		out.Items = append(out.Items, response.AdminUser{PublicUser: publicAccount(row.User), Frozen: row.Frozen})
	}
	return out, nil
}

func (s *UserService) GetUser(ctx context.Context, id string) (response.AdminUser, error) {
	user, err := findAccount(ctx, s.DB, id, false)
	if err != nil {
		return response.AdminUser{}, err
	}
	return adminAccount(ctx, s.DB, user)
}

func (s *UserService) UpdateUser(ctx context.Context, in request.UpdateUser) (response.AdminUser, error) {
	user, err := s.updateNickname(ctx, in.ID, in.Nickname)
	if err != nil {
		return response.AdminUser{}, err
	}
	return adminAccount(ctx, s.DB, user)
}

// ChangeRole 只允许普通用户与管理员互转，提升前必须已验证邮箱。
func (s *UserService) ChangeRole(ctx context.Context, in request.ChangeRole) (response.AdminUser, error) {
	if s.DB == nil {
		return response.AdminUser{}, errcode.NotImplemented
	}
	if in.Role != "user" && in.Role != "admin" {
		return response.AdminUser{}, errcode.InvalidArgument
	}
	var user entity.User
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockAdminChanges(tx); err != nil {
			return err
		}
		var err error
		user, err = findAccount(ctx, tx, in.ID, true)
		if err != nil {
			return err
		}
		if in.Role == "admin" && !user.MailVerified {
			return errcode.MailRequired
		}
		if user.Role == in.Role {
			return nil
		}
		if in.Role == "user" {
			if err := protectLastAdmin(tx, user); err != nil {
				return err
			}
		}
		if err := tx.Model(&user).Updates(map[string]any{"role": in.Role, "token_version": gorm.Expr("token_version + 1")}).Error; err != nil {
			return errcode.DatabaseError
		}
		if err := tx.First(&user, user.ID).Error; err != nil {
			return errcode.DatabaseError
		}
		return nil
	})
	if err != nil {
		return response.AdminUser{}, accountWriteError(err)
	}
	return adminAccount(ctx, s.DB, user)
}

// AdminResetPassword 不解除冻结；目标账号的全部旧 AT/RT 同时失效。
func (s *UserService) AdminResetPassword(ctx context.Context, in request.AdminResetPassword) error {
	return s.changePassword(ctx, in.UserID, "", in.NewPassword, false)
}

func (s *UserService) changePassword(ctx context.Context, id, current, next string, verifyCurrent bool) error {
	if s.DB == nil {
		return errcode.NotImplemented
	}
	if verifyCurrent && current == "" {
		return errcode.InvalidArgument
	}
	if s.passwords == nil {
		return errcode.DependencyUnavailable
	}
	if s.passwords.Validate(next) != nil {
		return errcode.InvalidArgument
	}
	hash, err := s.passwords.Hash(next)
	if err != nil {
		return errcode.DependencyUnavailable
	}
	err = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		user, err := findAccount(ctx, tx, id, true)
		if err != nil {
			return err
		}
		if verifyCurrent && s.passwords.Verify(user.PasswordHash, current) != nil {
			return errcode.VerifyPasswordFailed
		}
		if err := tx.Model(&user).Updates(map[string]any{"password_hash": hash, "token_version": gorm.Expr("token_version + 1")}).Error; err != nil {
			return errcode.DatabaseError
		}
		return consumeSecurityCodes(tx, user.ID, time.Now().UTC())
	})
	return accountWriteError(err)
}

func (s *UserService) updateNickname(ctx context.Context, id, nickname string) (entity.User, error) {
	if s.DB == nil {
		return entity.User{}, errcode.NotImplemented
	}
	nickname = strings.TrimSpace(nickname)
	if !validNickname(nickname) {
		return entity.User{}, errcode.InvalidArgument
	}
	var user entity.User
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		user, err = findAccount(ctx, tx, id, true)
		if err != nil {
			return err
		}
		if err := tx.Model(&user).Update("nickname", nickname).Error; err != nil {
			return errcode.DatabaseError
		}
		if err := tx.First(&user, user.ID).Error; err != nil {
			return errcode.DatabaseError
		}
		return nil
	})
	return user, accountWriteError(err)
}

func parseUserID(raw string) (uint, error) {
	if raw == "" || strings.TrimSpace(raw) != raw {
		return 0, errcode.InvalidArgument
	}
	for _, char := range raw {
		if char < '0' || char > '9' {
			return 0, errcode.InvalidArgument
		}
	}
	id, err := strconv.ParseUint(raw, 10, 63)
	if err != nil || id == 0 {
		return 0, errcode.InvalidArgument
	}
	return uint(id), nil
}

func findAccount(ctx context.Context, db *gorm.DB, raw string, lock bool) (entity.User, error) {
	if db == nil {
		return entity.User{}, errcode.NotImplemented
	}
	id, err := parseUserID(raw)
	if err != nil {
		return entity.User{}, err
	}
	query := db.WithContext(ctx)
	if lock {
		query = query.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	var user entity.User
	if err := query.First(&user, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return entity.User{}, errcode.ResourceNotFound
		}
		return entity.User{}, errcode.DatabaseError
	}
	return user, nil
}

func publicAccount(user entity.User) response.PublicUser {
	return response.PublicUser{ID: strconv.FormatUint(uint64(user.ID), 10), Username: user.Username, Nickname: user.Nickname, Role: user.Role, CreatedAt: user.CreatedAt, UpdatedAt: user.UpdatedAt}
}

func accountDetails(user entity.User) response.AccountUser {
	return response.AccountUser{PublicUser: publicAccount(user), Mail: user.Mail, MailVerified: user.MailVerified, MailVerifiedAt: user.MailVerifiedAt, MailRequired: user.Role == "admin" && !user.MailVerified}
}

func adminAccount(ctx context.Context, db *gorm.DB, user entity.User) (response.AdminUser, error) {
	var count int64
	if err := db.WithContext(ctx).Model(&entity.Fronze{}).Where("user_id = ?", user.ID).Count(&count).Error; err != nil {
		return response.AdminUser{}, errcode.DatabaseError
	}
	return response.AdminUser{PublicUser: publicAccount(user), Frozen: count > 0}, nil
}

func accountWriteError(err error) error {
	if err == nil {
		return nil
	}
	var business *errcode.Error
	if errors.As(err, &business) {
		return err
	}
	return errcode.DatabaseError
}

// lockAdminChanges 复用站点单行锁串行化角色/冻结变更，避免两个管理员同时失去权限。
// 一律先锁设置，再锁用户，密码与邮件流程只锁用户，不形成反向锁顺序。
func lockAdminChanges(tx *gorm.DB) error {
	var setting entity.SiteSetting
	if err := tx.Select("id").Clauses(clause.Locking{Strength: "UPDATE"}).First(&setting).Error; err != nil {
		return errcode.DatabaseError
	}
	return nil
}

func protectLastAdmin(tx *gorm.DB, user entity.User) error {
	if user.Role != "admin" || !user.MailVerified {
		return nil
	}
	var frozen int64
	if err := tx.Model(&entity.Fronze{}).Where("user_id = ?", user.ID).Count(&frozen).Error; err != nil {
		return errcode.DatabaseError
	}
	if frozen > 0 {
		return nil
	}
	var otherAdmins int64
	if err := tx.Model(&entity.User{}).Where("id <> ? AND role = ? AND mail_verified = ?", user.ID, "admin", true).
		Where("NOT EXISTS (SELECT 1 FROM fronze WHERE fronze.user_id = users.id AND fronze.deleted_at IS NULL)").Count(&otherAdmins).Error; err != nil {
		return errcode.DatabaseError
	}
	if otherAdmins == 0 {
		return errcode.ResourceConflict
	}
	return nil
}

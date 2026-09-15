package service

import (
	"context"
	"errors"
	"log/slog"
	"time"

	authiface "vpsmonitor/iface/auth"
	mailiface "vpsmonitor/iface/mail"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
	mailutil "vpsmonitor/utils/mail"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type PasswordResetService struct {
	DB        *gorm.DB
	sender    mailiface.Sender
	passwords authiface.PasswordProvider
}

func NewPasswordResetService(db *gorm.DB, sender mailiface.Sender, passwords authiface.PasswordProvider) *PasswordResetService {
	return &PasswordResetService{DB: db, sender: sender, passwords: passwords}
}

// RequestCode 对未知、未验证邮箱和冷却中的请求返回相同的 202 数据形状。
func (s *PasswordResetService) RequestCode(ctx context.Context, in request.PasswordResetCode) (response.CodeResult, error) {
	if s.DB == nil {
		return response.CodeResult{}, errcode.NotImplemented
	}
	address, err := mailutil.NormalizeAddress(in.Mail)
	if err != nil {
		return response.CodeResult{}, err
	}
	if s.sender == nil || s.sender.Ready() != nil {
		return response.CodeResult{}, errcode.MailUnavailable
	}
	publicID := uuid.NewString()
	out := response.CodeResult{
		ResetID:    publicID,
		ExpiresIn:  int64(mailCodeLifetime.Seconds()),
		RetryAfter: int64(mailCodeCooldown.Seconds()),
		Message:    "如果该邮箱已绑定并验证，验证码将发送至该邮箱，请稍后查收。",
	}
	// 对不存在的邮箱也执行同等哈希计算，不返回账号存在性。
	code, hash, err := newMailCode()
	if err != nil {
		return response.CodeResult{}, err
	}
	err = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var user entity.User
		if err := tx.Model(&entity.User{}).
			Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("lower(mail) = ? AND mail_verified = ?", address, true).
			First(&user).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return errcode.DatabaseError
		}
		now := time.Now().UTC()
		var count int64
		if err := tx.Model(&entity.PasswordReset{}).Where("user_id = ? AND created_at > ?", user.ID, now.Add(-mailCodeCooldown)).Count(&count).Error; err != nil {
			return errcode.DatabaseError
		}
		if count > 0 {
			return nil
		}
		record := entity.PasswordReset{PublicID: publicID, UserID: user.ID, CodeHash: hash, ExpiresAt: now.Add(mailCodeLifetime)}
		if err := tx.Create(&record).Error; err != nil {
			return errcode.DatabaseError
		}
		if err := s.sender.Send(ctx, mailiface.Message{To: []string{address}, Subject: "VPS Monitor 密码重置验证码", TextBody: "你的密码重置验证码为：" + code + "\n有效期为 10 分钟。请勿向他人透露验证码。如非本人操作，请忽略此邮件。"}); err != nil {
			return errcode.MailUnavailable
		}
		if err := tx.Model(&entity.PasswordReset{}).Where("user_id = ? AND id <> ? AND consumed_at IS NULL", user.ID, record.ID).Update("consumed_at", now).Error; err != nil {
			return errcode.DatabaseError
		}
		return nil
	})
	if errors.Is(err, errcode.MailUnavailable) {
		// 个别地址投递失败也不泄露邮箱存在性；事务回滚，管理员可在日志中定位邮件服务故障。
		slog.ErrorContext(ctx, "password reset mail delivery failed", "reset_id", publicID)
		return out, nil
	}
	if err != nil {
		return response.CodeResult{}, err
	}
	return out, nil
}

// Confirm 在同一 SQL 事务更新密码并递增 token_version，且不解除冻结。
func (s *PasswordResetService) Confirm(ctx context.Context, in request.PasswordResetConfirm) error {
	if s.DB == nil {
		return errcode.NotImplemented
	}
	if s.passwords == nil {
		return errcode.DependencyUnavailable
	}
	if err := s.passwords.Validate(in.NewPassword); err != nil {
		return errcode.InvalidArgument
	}
	publicID, parseErr := uuid.Parse(in.ResetID)
	if parseErr != nil || !validMailCode(in.Code) {
		return errcode.PasswordResetInvalid
	}
	in.ResetID = publicID.String()
	var lookup entity.PasswordReset
	if err := s.DB.WithContext(ctx).Where("public_id = ?", in.ResetID).First(&lookup).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errcode.PasswordResetInvalid
		}
		return errcode.DatabaseError
	}
	var invalid bool
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 与发码、换绑、改密统一先锁用户，避免交错操作保留旧验证码。
		var user entity.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, lookup.UserID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errcode.PasswordResetInvalid
			}
			return errcode.DatabaseError
		}
		var record entity.PasswordReset
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&record, lookup.ID).Error; err != nil {
			return errcode.DatabaseError
		}
		now := time.Now().UTC()
		if user.Mail == nil || !user.MailVerified || record.ConsumedAt != nil || !record.ExpiresAt.After(now) || record.FailedAttempts >= mailCodeMaxAttempts {
			return errcode.PasswordResetInvalid
		}
		if bcrypt.CompareHashAndPassword([]byte(record.CodeHash), []byte(in.Code)) != nil {
			invalid = true
			if err := tx.Model(&record).Update("failed_attempts", gorm.Expr("failed_attempts + 1")).Error; err != nil {
				return errcode.DatabaseError
			}
			return nil
		}
		hash, err := s.passwords.Hash(in.NewPassword)
		if err != nil {
			return errcode.DependencyUnavailable
		}
		if err := tx.Model(&user).Updates(map[string]any{"password_hash": hash, "token_version": gorm.Expr("token_version + 1")}).Error; err != nil {
			return errcode.DatabaseError
		}
		return consumeSecurityCodes(tx, user.ID, now)
	})
	if err != nil {
		return err
	}
	if invalid {
		return errcode.PasswordResetInvalid
	}
	return nil
}

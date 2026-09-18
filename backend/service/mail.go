package service

import (
	"context"
	"errors"
	"time"

	authiface "vpsmonitor/iface/auth"
	mailiface "vpsmonitor/iface/mail"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
	mailutil "vpsmonitor/utils/mail"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type MailService struct {
	DB        *gorm.DB
	sender    mailiface.Sender
	passwords authiface.PasswordProvider
}

func NewMailService(db *gorm.DB, sender mailiface.Sender, passwords authiface.PasswordProvider) *MailService {
	return &MailService{DB: db, sender: sender, passwords: passwords}
}
func (s *MailService) GetStatus(ctx context.Context, userID string) (response.MailStatus, error) {
	if s.DB == nil {
		return response.MailStatus{}, errcode.NotImplemented
	}
	id, err := parseUserID(userID)
	if err != nil {
		return response.MailStatus{}, err
	}
	var user entity.User
	if err := s.DB.WithContext(ctx).First(&user, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return response.MailStatus{}, errcode.ResourceNotFound
		}
		return response.MailStatus{}, errcode.DatabaseError
	}
	return response.MailStatus{Mail: user.Mail, Verified: user.MailVerified}, nil
}

// SendCode 保留原邮箱直到新邮箱验证通过；换绑必须再次验证当前密码。
func (s *MailService) SendCode(ctx context.Context, userID string, in request.MailCode) (response.CodeResult, error) {
	if s.DB == nil {
		return response.CodeResult{}, errcode.NotImplemented
	}
	id, err := parseUserID(userID)
	if err != nil {
		return response.CodeResult{}, err
	}
	address, err := mailutil.NormalizeAddress(in.Mail)
	if err != nil {
		return response.CodeResult{}, err
	}
	if s.sender == nil || s.sender.Ready() != nil {
		return response.CodeResult{}, errcode.MailUnavailable
	}
	code, hash, err := newMailCode()
	if err != nil {
		return response.CodeResult{}, err
	}
	publicID := uuid.NewString()
	err = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var user entity.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errcode.ResourceNotFound
			}
			return errcode.DatabaseError
		}
		if user.Mail != nil && user.MailVerified && *user.Mail == address {
			return errcode.MailUnchanged
		}
		if user.Mail != nil && *user.Mail != address {
			if s.passwords == nil {
				return errcode.DependencyUnavailable
			}
			if in.CurrentPassword == nil || s.passwords.Verify(user.PasswordHash, *in.CurrentPassword) != nil {
				return errcode.InvalidCredentials
			}
		}
		var count int64
		if err := tx.Unscoped().Model(&entity.User{}).Where("lower(mail) = ? AND id <> ?", address, id).Count(&count).Error; err != nil {
			return errcode.DatabaseError
		}
		if count > 0 {
			return errcode.MailExists
		}
		now := time.Now().UTC()
		if err := tx.Model(&entity.MailVerification{}).Where("user_id = ? AND created_at > ?", id, now.Add(-mailCodeCooldown)).Count(&count).Error; err != nil {
			return errcode.DatabaseError
		}
		if count > 0 {
			return errcode.RateLimited
		}
		verification := entity.MailVerification{PublicID: publicID, UserID: user.ID, Mail: address, CodeHash: hash, ExpiresAt: now.Add(mailCodeLifetime)}
		if err := tx.Create(&verification).Error; err != nil {
			return errcode.DatabaseError
		}
		if err := s.sender.Send(ctx, mailiface.Message{To: []string{address}, Subject: "VPS Monitor 邮箱验证码", TextBody: "你的邮箱验证码为：" + code + "\r\n有效期为 10 分钟。请勿向他人透露验证码。如非本人操作，请忽略此邮件。"}); err != nil {
			return errcode.MailUnavailable
		}
		if err := tx.Model(&entity.MailVerification{}).Where("user_id = ? AND id <> ? AND consumed_at IS NULL", user.ID, verification.ID).Update("consumed_at", now).Error; err != nil {
			return errcode.DatabaseError
		}
		return nil
	})
	if err != nil {
		return response.CodeResult{}, err
	}
	return response.CodeResult{VerificationID: publicID, ExpiresIn: int64(mailCodeLifetime.Seconds()), RetryAfter: int64(mailCodeCooldown.Seconds())}, nil
}

func (s *MailService) Confirm(ctx context.Context, userID string, in request.MailConfirm) (response.AccountUser, error) {
	if s.DB == nil {
		return response.AccountUser{}, errcode.NotImplemented
	}
	id, err := parseUserID(userID)
	if err != nil {
		return response.AccountUser{}, err
	}
	publicID, parseErr := uuid.Parse(in.VerificationID)
	if parseErr != nil || !validMailCode(in.Code) {
		return response.AccountUser{}, errcode.MailCodeInvalid
	}
	in.VerificationID = publicID.String()
	var out response.AccountUser
	var invalid bool
	err = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var user entity.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errcode.MailCodeInvalid
			}
			return errcode.DatabaseError
		}
		var record entity.MailVerification
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("public_id = ? AND user_id = ?", in.VerificationID, id).First(&record).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errcode.MailCodeInvalid
			}
			return errcode.DatabaseError
		}
		now := time.Now().UTC()
		if record.ConsumedAt != nil || !record.ExpiresAt.After(now) || record.FailedAttempts >= mailCodeMaxAttempts {
			return errcode.MailCodeInvalid
		}
		if bcrypt.CompareHashAndPassword([]byte(record.CodeHash), []byte(in.Code)) != nil {
			// 错误次数必须提交，不能随公开业务错误回滚。
			invalid = true
			if err := tx.Model(&record).Update("failed_attempts", gorm.Expr("failed_attempts + 1")).Error; err != nil {
				return errcode.DatabaseError
			}
			return nil
		}
		var count int64
		if err := tx.Unscoped().Model(&entity.User{}).Where("lower(mail) = ? AND id <> ?", record.Mail, id).Count(&count).Error; err != nil {
			return errcode.DatabaseError
		}
		if count > 0 {
			return errcode.MailExists
		}
		if err := tx.Model(&user).Updates(map[string]any{"mail": record.Mail, "mail_verified": true, "mail_verified_at": now}).Error; err != nil {
			var pgErr *pgconn.PgError
			if errors.Is(err, gorm.ErrDuplicatedKey) || (errors.As(err, &pgErr) && pgErr.Code == "23505") {
				return errcode.MailExists
			}
			return errcode.DatabaseError
		}
		if err := consumeSecurityCodes(tx, user.ID, now); err != nil {
			return err
		}
		if err := tx.First(&user, user.ID).Error; err != nil {
			return errcode.DatabaseError
		}
		out = mailAccountUser(user)
		return nil
	})
	if err != nil {
		return response.AccountUser{}, err
	}
	if invalid {
		return response.AccountUser{}, errcode.MailCodeInvalid
	}
	return out, nil
}

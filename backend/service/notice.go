package service

import (
	"context"
	"strings"
	"unicode"
	"unicode/utf8"
	enqueueiface "vpsmonitor/iface/enqueue"
	messageiface "vpsmonitor/iface/message"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/response"
	"vpsmonitor/utils/notice"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type NoticeService struct {
	DB       *gorm.DB
	RedisCli *redis.Client
	Reader   messageiface.Reader
	Producer enqueueiface.Producer
}

func NewNoticeService(db *gorm.DB, redisCli *redis.Client) *NoticeService {
	return &NoticeService{DB: db, RedisCli: redisCli}
}

/*
对收藏所有vps开启通知，不支持指定vps进行通知
*/
func (s *NoticeService) AddNotices(ctx context.Context, uid string) error {
	return s.setNoticeEnabled(ctx, uid, true)
}

func (s *NoticeService) GetNotice(ctx context.Context, uid string) (response.NoticeSettings, error) {
	user, err := findAccount(ctx, s.DB, uid, false)
	if err != nil {
		return response.NoticeSettings{}, err
	}
	return noticeSettings(user), nil
}

func (s *NoticeService) BindServerKey(ctx context.Context, uid, key string) (response.NoticeSettings, error) {
	key, err := normalizeServerKey(key)
	if err != nil {
		return response.NoticeSettings{}, err
	}
	if s.DB == nil {
		return response.NoticeSettings{}, errcode.NotImplemented
	}
	var out response.NoticeSettings
	err = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		user, err := findAccount(ctx, tx, uid, true)
		if err != nil {
			return err
		}
		if err := tx.Model(&user).Update("server_turbo_key", key).Error; err != nil {
			return err
		}
		user.ServerTurboKey = key
		out = noticeSettings(user)
		return nil
	})
	if err != nil {
		return response.NoticeSettings{}, accountWriteError(err)
	}
	return out, nil
}

/*
检查user表ServerTurboKey字段是否不为空
*/
func (s *NoticeService) CheckServerKey(ctx context.Context, uid string) (string, error) {
	user, err := findAccount(ctx, s.DB, uid, false)
	if err != nil {
		return "", err
	}
	if user.ServerTurboKey != "" {
		return user.ServerTurboKey, nil
	}
	return "", errcode.ServerTurboNoRecord
}

// TestNotice sends one immediate message without changing notification settings or history.
func (s *NoticeService) TestNotice(ctx context.Context, uid string) error {
	key, err := s.CheckServerKey(ctx, uid)
	if err != nil {
		return err
	}
	result, err := notice.ServerTurbo(ctx, key, "VPS Monitor 微信通知测试", "如果你收到了这条消息，说明 Server 酱 Key 已绑定且测试通知发送成功。")
	if err != nil || result == nil || result.Code != 0 {
		return errcode.ServerTurboFailed
	}
	return nil
}

func (s *NoticeService) DelNotices(ctx context.Context, uid string) error {
	return s.setNoticeEnabled(ctx, uid, false)
}

func (s *NoticeService) setNoticeEnabled(ctx context.Context, uid string, enabled bool) error {
	if s.DB == nil {
		return errcode.NotImplemented
	}
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		user, err := findAccount(ctx, tx, uid, true)
		if err != nil {
			return err
		}
		if enabled && user.ServerTurboKey == "" {
			return errcode.ServerTurboNoRecord
		}
		return tx.Model(&user).Update("notice_enabled", enabled).Error
	})
	return accountWriteError(err)
}

func noticeSettings(user entity.User) response.NoticeSettings {
	return response.NoticeSettings{
		NoticeEnabled: user.NoticeEnabled,
		KeyBound:      user.ServerTurboKey != "",
	}
}

func normalizeServerKey(key string) (string, error) {
	key = strings.TrimSpace(key)
	if !utf8.ValidString(key) || key == "" || key == "{key}" || utf8.RuneCountInString(key) > 64 ||
		strings.ContainsFunc(key, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) }) {
		return "", errcode.InvalidArgument
	}
	return key, nil
}

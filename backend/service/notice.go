package service

import (
	"context"
	enqueueiface "vpsmonitor/iface/enqueue"
	messageiface "vpsmonitor/iface/message"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/request"

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
func (s *NoticeService) AddNotices(ctx context.Context, uid string, in request.VPSListQuery) error {
	var user entity.User
	err := s.DB.WithContext(ctx).Model(entity.User{}).Where("id = ?", uid).Find(&user).Error
	if err != nil {
		return err
	}
	if user.ServerTurboKey == "" {
		return errcode.ServerTurboNoRecord
	}
	return s.DB.WithContext(ctx).
		Model(&entity.User{}).
		Where("id = ?", user.ID).
		Update("notice_enabled", true).Error
}

/*
检查user表ServerTurboKey字段是否不为空
*/
func (s *NoticeService) CheckServerKey(ctx context.Context, uid string) (string, error) {
	var user entity.User
	err := s.DB.WithContext(ctx).Model(&entity.User{}).Where("id = ?", uid).Find(&user).Error
	if err != nil {
		return "", err
	}
	if user.ServerTurboKey != "" {
		return user.ServerTurboKey, nil
	}
	return "", errcode.ServerTurboNoRecord
}
func (s *NoticeService) DelNotices(ctx context.Context, uid string, vpsId string) error {
	return nil
}

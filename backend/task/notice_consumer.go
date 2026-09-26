package task

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"time"
	messageiface "vpsmonitor/iface/message"
	"vpsmonitor/model/dto"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
	"vpsmonitor/service"
	"vpsmonitor/utils/notice"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type NoticeConsumer struct {
	Enabled      bool
	Reader       messageiface.Reader
	Acknowledger messageiface.Acknowledger
	Service      *service.StockService
	Options      messageiface.ReadOptions
	Reclaimer    messageiface.Reclaimer
}

// Run 默认不读取消息；启用后在处理和确认语义完成前也拒绝消费，防止真实消息丢失。
func (c *NoticeConsumer) Run(ctx context.Context) error {
	if !c.Enabled {
		return nil
	}

	for {
		deliveries, err := c.Reader.Read(ctx, c.Options)
		if errors.Is(err, redis.Nil) {
			continue
		}
		if err != nil {
			return err
		}
		for _, delivery := range deliveries {
			if err := c.processDelivery(ctx, delivery); err != nil {
				log.Printf("process message id=%s: %v", delivery.ID, err)
			}
		}
	}

}
func (c *NoticeConsumer) RecoverPending(ctx context.Context) error {
	if !c.Enabled {
		return nil
	}
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil

		case <-ticker.C:
			start := "0-0"
			for {
				msgs, nextStart, err := c.Reclaimer.AutoClaim(ctx, messageiface.ClaimOptions{
					Stream:   c.Options.Stream,
					Group:    c.Options.Group,
					Consumer: c.Options.Consumer + "-recovery",
					MinIdle:  2 * time.Minute,
					Start:    start,
					Count:    5,
				})
				if err != nil {
					log.Printf("auto claim: %v", err)
					break
				}
				for _, msg := range msgs {
					pending, err := c.Reclaimer.GetPending(ctx, messageiface.PendingOptions{
						Stream: c.Options.Stream,
						Group:  c.Options.Group,
						Start:  msg.ID,
						End:    msg.ID,
						Count:  1,
					})
					if err != nil {
						slog.Error("获取pending消息失败")
					}
					if len(pending) == 0 {
						continue
					}
					if pending[0].RetryCount > 3 {
						err := c.Acknowledger.Ack(ctx, messageiface.ReadOptions{
							Stream: c.Options.Stream,
							Group:  c.Options.Group,
						}, msg.ID)
						if err != nil {
							log.Printf("pending message ack failed, message id=%s: %v", msg.ID, err)
						}
						continue
					}
					if err := c.processDelivery(ctx, msg); err != nil {
						log.Printf("process claimed message id=%s: %v", msg.ID, err)
					}
				}
				if nextStart == "0-0" {
					break
				}
				start = nextStart
			}
		}
	}
}

// 拿到消息进行对应业务逻辑处理
func (c *NoticeConsumer) processDelivery(ctx context.Context, delivery messageiface.Delivery) error {
	var noticeEnabledTask dto.NoticeEnabledTask
	err := json.Unmarshal(delivery.Payload, &noticeEnabledTask)
	if err != nil {
		return err
	}
	db := c.Service.DB.WithContext(ctx)
	var user entity.User
	if err := db.Where("id = ?", noticeEnabledTask.UserId).Take(&user).Error; err != nil {
		return err
	}
	if !user.NoticeEnabled || user.ServerTurboKey == "" {
		return fmt.Errorf("用户未启用通知或用户未绑定key")
	}

	// 查询该用户、该商品对应的通知记录。
	var no entity.Notice
	err = db.Where(
		"user_id = ? AND vps_id = ?",
		user.ID, noticeEnabledTask.VpsId,
	).Take(&no).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		// 还没有通知记录。
		// 读取商品，取得准确的商品 ID 和商家 ID。
		var vps entity.VPS
		if err := db.Where("id = ?", noticeEnabledTask.VpsId).Take(&vps).Error; err != nil {
			return err
		}

		initial := entity.Notice{
			UserID:          user.ID,
			VpsID:           uint64(vps.ID),
			MerchantID:      vps.MerchantID,
			SendNoticeTimes: 0,
			SendAt:          nil,
		}

		// 如果另一个消费者已经创建了同一条记录，则不重复插入，
		// 也不覆盖它已经保存的发送次数和时间。
		err = db.Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "user_id"},
				{Name: "vps_id"},
			},
			DoNothing: true,
		}).Create(&initial).Error
		if err != nil {
			return err
		}

		// 无论是自己创建成功，还是其他消费者先创建，
		// 都重新读取数据库里的实际记录。
		err = db.Where(
			"user_id = ? AND vps_id = ?",
			user.ID, vps.ID,
		).Take(&no).Error
		if err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		// 必须重新查询：前面读取的 no 可能已经被其他消费者修改。
		var current entity.Notice
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ? AND vps_id = ?",
				user.ID, noticeEnabledTask.VpsId).
			Take(&current).Error; err != nil {
			return err
		}

		if current.SendNoticeTimes >= 3 {
			return errcode.SendTimesGT3
		}
		if current.SendNoticeTimes > 0 {
			if current.SendAt == nil {
				return fmt.Errorf("通知记录异常：已发送过，但缺少发送时间")
			}
			if time.Since(*current.SendAt) < time.Hour*12 {
				return errcode.IntervalLT2
			}
		}

		key := user.ServerTurboKey
		res, err := notice.ServerTurbo(ctx, key, noticeEnabledTask.VpsName, "监控到有货")
		if err != nil {
			return err
		}
		if res.Code != 0 {
			slog.Error("server酱发送失败",
				"code", res.Code,
				"message", res.Message,
			)
			return errcode.ServerTurboFailed
		}
		now := time.Now()
		err = tx.Model(entity.Notice{}).
			Where("user_id = ? and vps_id = ?", noticeEnabledTask.UserId, noticeEnabledTask.VpsId).
			Updates(map[string]interface{}{"send_notice_times": gorm.Expr("send_notice_times+?", 1), "send_at": &now}).Error
		if err != nil {
			return err
		}

		// 返回 nil 提交事务
		return nil
	})
	if err != nil {
		return err
	}

	if err := c.Acknowledger.Ack(ctx, c.Options, delivery.ID); err != nil {
		return err
	}
	return nil
}

func (c *NoticeConsumer) discard(ctx context.Context, delivery messageiface.Delivery, cause error) error {
	log.Printf(
		"discard collection task id=%s: %v",
		delivery.ID,
		cause,
	)

	if err := c.Acknowledger.Ack(ctx, c.Options, delivery.ID); err != nil {
		log.Printf("ack discarded task id=%s: %v", delivery.ID, err)
		return err
	}

	//if err := c.Acknowledger.Del(ctx, c.Options, delivery.ID, ); err != nil {
	//	// ACK 已经成功，DEL 失败只代表清理失败。
	//	// 消息不会重新进入消费流程，可以等待 MAXLEN 清理。
	//	log.Printf("delete discarded task id=%s: %v", delivery.ID, err)
	//}
	return nil
}

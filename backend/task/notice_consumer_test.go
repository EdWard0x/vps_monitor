package task

import (
	"errors"
	"testing"
	"time"

	messageiface "vpsmonitor/iface/message"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
)

func TestNextNoticeCount(t *testing.T) {
	now := time.Date(2026, 9, 28, 0, 0, 0, 0, time.UTC)
	consumer := NoticeConsumer{Options: messageiface.ReadOptions{
		NoticeDuration: 10 * time.Minute, NoticeResetDuration: 7 * 24 * time.Hour,
	}}
	for _, tc := range []struct {
		name    string
		count   uint64
		elapsed time.Duration
		want    uint64
		wantErr error
	}{
		{"first notification", 0, 0, 1, nil},
		{"send interval not reached", 1, 9 * time.Minute, 0, errcode.IntervalNotReach},
		{"send interval reached", 2, 10 * time.Minute, 3, nil},
		{"limit before reset", 3, 7*24*time.Hour - time.Second, 0, errcode.SendTimesGT3},
		{"reset at boundary", 3, 7 * 24 * time.Hour, 1, nil},
		{"restock months later", 3, 90 * 24 * time.Hour, 1, nil},
		{"reset partial count", 2, 7 * 24 * time.Hour, 1, nil},
		{"next send after reset", 1, 10 * time.Minute, 2, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			current := entity.Notice{SendNoticeTimes: tc.count}
			if tc.count > 0 {
				lastSent := now.Add(-tc.elapsed)
				current.SendAt = &lastSent
			}
			got, err := consumer.nextNoticeCount(current, now)
			if got != tc.want || !errors.Is(err, tc.wantErr) {
				t.Fatalf("got count=%d err=%v; want count=%d err=%v", got, err, tc.want, tc.wantErr)
			}
		})
	}
	if _, err := consumer.nextNoticeCount(entity.Notice{SendNoticeTimes: 3}, now); err == nil {
		t.Fatal("must not reset a sent notice without a send timestamp")
	}
}

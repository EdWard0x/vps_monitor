package ratelimit

import (
	"sync"
	"time"
)

type bucket struct {
	Start time.Time
	Count int
}

// Memory 是进程内固定窗口计数器；Mutex 避免并发请求同时读写 map。
// 多个 API 进程各自计数，重启后计数清空，不能当作跨实例的统一限流。
type Memory struct {
	mu    sync.Mutex
	items map[string]bucket
}

func New() *Memory { return &Memory{items: map[string]bucket{}} }
func (m *Memory) Allow(key string, max int, window time.Duration) (bool, int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	b := m.items[key]
	if b.Start.IsZero() || now.Sub(b.Start) >= window {
		m.items[key] = bucket{Start: now, Count: 1}
		return true, 0
	}
	if b.Count >= max {
		retry := int((window - now.Sub(b.Start) + time.Second - 1) / time.Second)
		return false, retry
	}
	b.Count++
	m.items[key] = b
	return true, 0
}

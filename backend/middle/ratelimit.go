package middle

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"strings"
	"sync"
	"time"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/response"
)

// RateLimit 按进程、来源 IP 限流；认证和验证码路由共享更严格的额度。
func RateLimit() gin.HandlerFunc {
	type bucket struct {
		count int
		reset time.Time
	}
	var mu sync.Mutex
	buckets := make(map[string]bucket)
	lastSweep := time.Now()
	return func(c *gin.Context) {
		if !strings.HasPrefix(c.Request.URL.Path, "/api/") || c.Request.Method == http.MethodOptions {
			c.Next()
			return
		}
		limit, kind := 300, "api:"
		if strings.HasPrefix(c.Request.URL.Path, "/api/v1/auth/") || strings.HasPrefix(c.Request.URL.Path, "/api/v1/me/mail/") {
			limit, kind = 30, "auth:"
		}
		now, key := time.Now(), kind+c.ClientIP()
		mu.Lock()
		if now.Sub(lastSweep) >= time.Minute {
			for k, b := range buckets {
				if !now.Before(b.reset) {
					delete(buckets, k)
				}
			}
			lastSweep = now
		}
		b, exists := buckets[key]
		full := !exists && len(buckets) >= 10000
		if !now.Before(b.reset) {
			b = bucket{reset: now.Add(time.Minute)}
		}
		blocked := full || b.count >= limit
		if !blocked {
			b.count++
			buckets[key] = b
		}
		mu.Unlock()
		if blocked {
			c.Header("Retry-After", "60")
			response.Error(c, errcode.RateLimited)
			return
		}
		c.Next()
	}
}

package middle

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"net/url"
	"strings"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/response"
)

// CORS 仅允许配置来源或同源；预检在鉴权前结束。
func CORS(origins []string) gin.HandlerFunc {
	allowed := make(map[string]bool, len(origins))
	for _, origin := range origins {
		allowed[strings.TrimRight(origin, "/")] = true
	}
	return func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		c.Header("X-Content-Type-Options", "nosniff")
		origin := c.GetHeader("Origin")
		if origin != "" {
			c.Writer.Header().Add("Vary", "Origin")
			scheme := "http"
			if c.Request.TLS != nil {
				scheme = "https"
			}
			u, err := url.Parse(origin)
			sameOrigin := err == nil && u.Scheme == scheme && u.Host == c.Request.Host && u.Path == "" && u.RawQuery == "" && u.Fragment == "" && u.User == nil
			if !allowed[origin] && !sameOrigin {
				response.Error(c, errcode.CSRFRejected)
				return
			}
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-CSRF-Token, X-Request-ID")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			c.Header("Access-Control-Expose-Headers", "X-Request-ID, Retry-After")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20)
		c.Next()
	}
}

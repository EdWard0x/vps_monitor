package middle

import (
	"github.com/gin-gonic/gin"
	"log/slog"
	"time"
)

func Logging(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		started := time.Now()
		c.Next()
		logger.Info("http_request", "method", c.Request.Method, "path", c.Request.URL.Path, "status", c.Writer.Status(), "duration_ms", time.Since(started).Milliseconds())
	}
}

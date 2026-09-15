package router

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"vpsmonitor/api"
)

type Middleware struct {
	Authenticate gin.HandlerFunc
	Admin        gin.HandlerFunc
	CSRF         gin.HandlerFunc
}

func Init(engine *gin.Engine, group api.Group, mw Middleware, ready func() bool) {
	engine.GET("/health/live", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "live"}) })
	engine.GET("/health/ready", func(c *gin.Context) {
		if ready != nil && ready() {
			c.JSON(http.StatusOK, gin.H{"status": "ready"})
			return
		}
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "not_ready"})
	})
	v1 := engine.Group("/api/v1")
	InitAuthRouter(v1, group, mw)
	InitPublicRouter(v1, group)
	me := v1.Group("/me", mw.Authenticate)
	InitMeRouter(me, group)
	admin := v1.Group("/admin", mw.Authenticate, mw.Admin)
	InitAdminRouter(admin, group)
	InitMerchantRouter(admin, v1, group)
	InitVPSRouter(admin, v1, group)
	InitSettingsRouter(admin, v1, group)
}

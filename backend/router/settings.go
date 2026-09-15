package router

import (
	"github.com/gin-gonic/gin"
	"vpsmonitor/api"
)

func InitSettingsRouter(admin, public *gin.RouterGroup, a api.Group) {
	public.GET("/settings/info", a.SettingsApi.GetPublic)
	r := admin.Group("/settings")
	r.GET("/info", a.SettingsApi.GetAdmin)
	r.PUT("/update", a.SettingsApi.Update)
}

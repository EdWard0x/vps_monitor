package router

import (
	"github.com/gin-gonic/gin"
	"vpsmonitor/api"
)

func InitDashboardRouter(admin *gin.RouterGroup, a api.Group) {
	admin.GET("/dashboard/info", a.DashboardApi.GetSummary)
}

package router

import (
	"vpsmonitor/api"

	"github.com/gin-gonic/gin"
)

func InitPublicRouter(v1 *gin.RouterGroup, a api.Group) {
	InitStockRouter(v1, a)
}
func InitAdminRouter(admin *gin.RouterGroup, a api.Group) {
	InitUserRouter(admin, a)
	InitFrozeRouter(admin, a)
	InitDashboardRouter(admin, a)
}

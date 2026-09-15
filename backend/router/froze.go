package router

import (
	"github.com/gin-gonic/gin"
	"vpsmonitor/api"
)

func InitFrozeRouter(admin *gin.RouterGroup, a api.Group) {
	r := admin.Group("/froze")
	r.POST("/freeze", a.FrozeApi.Freeze)
	r.POST("/unfreeze", a.FrozeApi.Unfreeze)
}

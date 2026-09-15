package router

import (
	"github.com/gin-gonic/gin"
	"vpsmonitor/api"
)

func InitVPSRouter(admin, public *gin.RouterGroup, a api.Group) {
	r := admin.Group("/vps")
	r.POST("/create", a.VPSApi.VPSCreate)
	r.DELETE("/delete", a.VPSApi.VPSDelete)
	r.PUT("/update", a.VPSApi.VPSUpdate)
	r.GET("/list", a.VPSApi.VPSAdminList)
	r.GET("/info", a.VPSApi.VPSAdminInfo)
	p := public.Group("/vps")
	p.GET("/list", a.VPSApi.VPSList)
	p.GET("/info", a.VPSApi.VPSInfo)
}

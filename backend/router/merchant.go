package router

import (
	"github.com/gin-gonic/gin"
	"vpsmonitor/api"
)

func InitMerchantRouter(admin, public *gin.RouterGroup, a api.Group) {
	r := admin.Group("/merchant")
	r.POST("/create", a.MerchantApi.MerchantCreate)
	r.DELETE("/delete", a.MerchantApi.MerchantDelete)
	r.PUT("/update", a.MerchantApi.MerchantUpdate)
	r.GET("/list", a.MerchantApi.MerchantAdminList)
	r.GET("/info", a.MerchantApi.MerchantAdminInfo)
	p := public.Group("/merchant")
	p.GET("/list", a.MerchantApi.MerchantList)
	p.GET("/info", a.MerchantApi.MerchantInfo)
}

package router

import (
	"github.com/gin-gonic/gin"
	"vpsmonitor/api"
)

func InitStockRouter(public *gin.RouterGroup, a api.Group) {
	public.GET("/stock/info", a.StockApi.GetCurrent)
}

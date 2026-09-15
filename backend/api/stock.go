package api

import (
	"github.com/gin-gonic/gin"
	"vpsmonitor/model/response"
	"vpsmonitor/service"
)

type StockApi struct{ Service *service.StockService }

func (a StockApi) GetCurrent(c *gin.Context) {
	out, err := a.Service.GetCurrent(c.Request.Context(), c.Query("vps_id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}

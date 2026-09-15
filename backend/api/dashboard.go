package api

import (
	"github.com/gin-gonic/gin"
	"vpsmonitor/model/response"
	"vpsmonitor/service"
)

type DashboardApi struct{ Service *service.DashboardService }

func (a DashboardApi) GetSummary(c *gin.Context) {
	out, err := a.Service.GetSummary(c.Request.Context())
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}

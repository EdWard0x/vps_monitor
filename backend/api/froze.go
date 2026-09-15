package api

import (
	"github.com/gin-gonic/gin"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
	"vpsmonitor/service"
)

type FrozeApi struct{ Service *service.FrozeService }

func (a FrozeApi) Freeze(c *gin.Context) {
	var in request.Froze
	if !bindJSON(c, &in) {
		return
	}
	out, err := a.Service.Freeze(c.Request.Context(), in.UserID)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}
func (a FrozeApi) Unfreeze(c *gin.Context) {
	var in request.Froze
	if !bindJSON(c, &in) {
		return
	}
	out, err := a.Service.Unfreeze(c.Request.Context(), in.UserID)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}

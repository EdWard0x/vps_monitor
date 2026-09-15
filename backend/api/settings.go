package api

import (
	"github.com/gin-gonic/gin"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
	"vpsmonitor/service"
)

type SettingsApi struct{ Service *service.SettingsService }

func (a SettingsApi) GetPublic(c *gin.Context) {
	out, err := a.Service.GetPublic(c.Request.Context())
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}
func (a SettingsApi) GetAdmin(c *gin.Context) {
	out, err := a.Service.GetAdmin(c.Request.Context())
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}
func (a SettingsApi) Update(c *gin.Context) {
	var in request.SettingsUpdate
	if !bindJSON(c, &in) {
		return
	}
	out, err := a.Service.Update(c.Request.Context(), in)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}

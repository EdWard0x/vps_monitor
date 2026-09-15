package api

import (
	"github.com/gin-gonic/gin"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
	"vpsmonitor/service"
)

type VPSApi struct{ Service *service.VPSService }

func (a VPSApi) VPSCreate(c *gin.Context) {
	var in request.VPSCreate
	if !bindJSON(c, &in) {
		return
	}
	out, err := a.Service.Create(c.Request.Context(), in)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}
func (a VPSApi) VPSUpdate(c *gin.Context) {
	var in request.VPSUpdate
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
func (a VPSApi) VPSDelete(c *gin.Context) {
	if err := a.Service.Delete(c.Request.Context(), c.Query("id")); err != nil {
		response.Error(c, err)
		return
	}
	noContentData(c)
}
func (a VPSApi) VPSList(c *gin.Context) {
	var in request.VPSListQuery
	if !bindQuery(c, &in) {
		return
	}
	out, err := a.Service.List(c.Request.Context(), in)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}
func (a VPSApi) VPSInfo(c *gin.Context) {
	out, err := a.Service.Info(c.Request.Context(), c.Query("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}
func (a VPSApi) VPSAdminList(c *gin.Context) {
	var in request.VPSListQuery
	if !bindQuery(c, &in) {
		return
	}
	out, err := a.Service.AdminList(c.Request.Context(), in)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}
func (a VPSApi) VPSAdminInfo(c *gin.Context) {
	out, err := a.Service.AdminInfo(c.Request.Context(), c.Query("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}

package api

import (
	"github.com/gin-gonic/gin"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
	"vpsmonitor/service"
)

type MerchantApi struct{ Service *service.MerchantService }

func (a MerchantApi) MerchantCreate(c *gin.Context) {
	var in request.MerchantCreate
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
func (a MerchantApi) MerchantUpdate(c *gin.Context) {
	var in request.MerchantUpdate
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
func (a MerchantApi) MerchantDelete(c *gin.Context) {
	if err := a.Service.Delete(c.Request.Context(), c.Query("id")); err != nil {
		response.Error(c, err)
		return
	}
	noContentData(c)
}
func (a MerchantApi) MerchantList(c *gin.Context) {
	var in request.MerchantListQuery
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
func (a MerchantApi) MerchantInfo(c *gin.Context) {
	out, err := a.Service.Info(c.Request.Context(), c.Query("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}
func (a MerchantApi) MerchantAdminList(c *gin.Context) {
	var in request.MerchantListQuery
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
func (a MerchantApi) MerchantAdminInfo(c *gin.Context) {
	out, err := a.Service.AdminInfo(c.Request.Context(), c.Query("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}

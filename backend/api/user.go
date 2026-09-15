package api

import (
	"github.com/gin-gonic/gin"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
	"vpsmonitor/service"
)

type UserApi struct{ Service *service.UserService }

func (a UserApi) GetMe(c *gin.Context) {
	out, err := a.Service.GetMe(c.Request.Context(), principalID(c))
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}
func (a UserApi) UpdateMe(c *gin.Context) {
	var in request.UpdateMe
	if !bindJSON(c, &in) {
		return
	}
	out, err := a.Service.UpdateMe(c.Request.Context(), principalID(c), in)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}
func (a UserApi) ChangePassword(c *gin.Context) {
	var in request.ChangePassword
	if !bindJSON(c, &in) {
		return
	}
	if err := a.Service.ChangePassword(c.Request.Context(), principalID(c), in); err != nil {
		response.Error(c, err)
		return
	}
	noContentData(c)
}
func (a UserApi) ListUsers(c *gin.Context) {
	var in request.UserListQuery
	if !bindQuery(c, &in) {
		return
	}
	out, err := a.Service.ListUsers(c.Request.Context(), in)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}
func (a UserApi) GetUser(c *gin.Context) {
	out, err := a.Service.GetUser(c.Request.Context(), c.Query("id"))
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}
func (a UserApi) UpdateUser(c *gin.Context) {
	var in request.UpdateUser
	if !bindJSON(c, &in) {
		return
	}
	out, err := a.Service.UpdateUser(c.Request.Context(), in)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}
func (a UserApi) ChangeRole(c *gin.Context) {
	var in request.ChangeRole
	if !bindJSON(c, &in) {
		return
	}
	out, err := a.Service.ChangeRole(c.Request.Context(), in)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}
func (a UserApi) AdminResetPassword(c *gin.Context) {
	var in request.AdminResetPassword
	if !bindJSON(c, &in) {
		return
	}
	if err := a.Service.AdminResetPassword(c.Request.Context(), in); err != nil {
		response.Error(c, err)
		return
	}
	noContentData(c)
}

package api

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
	"vpsmonitor/service"
)

type PasswordResetApi struct{ Service *service.PasswordResetService }

func (a PasswordResetApi) RequestCode(c *gin.Context) {
	var in request.PasswordResetCode
	if !bindJSON(c, &in) {
		return
	}
	out, err := a.Service.RequestCode(c.Request.Context(), in)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, http.StatusAccepted, out)
}
func (a PasswordResetApi) Confirm(c *gin.Context) {
	var in request.PasswordResetConfirm
	if !bindJSON(c, &in) {
		return
	}
	if err := a.Service.Confirm(c.Request.Context(), in); err != nil {
		response.Error(c, err)
		return
	}
	noContentData(c)
}

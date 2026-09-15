package api

import (
	"github.com/gin-gonic/gin"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
	"vpsmonitor/service"
)

type MailApi struct{ Service *service.MailService }

func (a MailApi) GetStatus(c *gin.Context) {
	out, err := a.Service.GetStatus(c.Request.Context(), principalID(c))
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}
func (a MailApi) SendCode(c *gin.Context) {
	var in request.MailCode
	if !bindJSON(c, &in) {
		return
	}
	out, err := a.Service.SendCode(c.Request.Context(), principalID(c), in)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}
func (a MailApi) Confirm(c *gin.Context) {
	var in request.MailConfirm
	if !bindJSON(c, &in) {
		return
	}
	out, err := a.Service.Confirm(c.Request.Context(), principalID(c), in)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}

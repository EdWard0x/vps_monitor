package api

import (
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
	"vpsmonitor/service"

	"github.com/gin-gonic/gin"
)

type NoticeApi struct{ Service *service.NoticeService }

// 添加通知
func (a NoticeApi) AddNotices(c *gin.Context) {

	var in request.VPSListQuery
	if !bindQuery(c, &in) {
		return
	}

	_, err := a.Service.CheckServerKey(c.Request.Context(), principalID(c))
	if err != nil {
		response.Error(c, err)
		return
	}
	err = a.Service.AddNotices(c.Request.Context(), principalID(c), in)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, "success")
}

// 取消通知
func (a NoticeApi) DelNotices(c *gin.Context) {
	vpsId := c.Query("vpsId")
	if vpsId == "" {
		response.Error(c, errcode.InvalidArgument)
		return
	}
	err := a.Service.DelNotices(c.Request.Context(), principalID(c), vpsId)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, "success")
}

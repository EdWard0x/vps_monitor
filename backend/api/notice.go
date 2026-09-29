package api

import (
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
	"vpsmonitor/service"

	"github.com/gin-gonic/gin"
)

type NoticeApi struct{ Service *service.NoticeService }

// 查询当前用户的通知设置，不返回 Key。
func (a NoticeApi) GetNotice(c *gin.Context) {
	out, err := a.Service.GetNotice(c.Request.Context(), principalID(c))
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}

// 保存或替换当前用户的 Server 酱 Key。
func (a NoticeApi) BindServerKey(c *gin.Context) {
	var in request.BindServerKey
	if !bindJSON(c, &in) {
		return
	}
	out, err := a.Service.BindServerKey(c.Request.Context(), principalID(c), in.SendKey)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, out)
}

// 立即发送一次测试消息，不写入库存通知记录。
func (a NoticeApi) TestNotice(c *gin.Context) {
	if err := a.Service.TestNotice(c.Request.Context(), principalID(c)); err != nil {
		response.Error(c, err)
		return
	}
	ok(c, "success")
}

// 对全部收藏开启通知。
func (a NoticeApi) AddNotices(c *gin.Context) {
	err := a.Service.AddNotices(c.Request.Context(), principalID(c))
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, "success")
}

// 关闭全部通知，保留 Key、收藏和通知记录。
func (a NoticeApi) DelNotices(c *gin.Context) {
	err := a.Service.DelNotices(c.Request.Context(), principalID(c))
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, "success")
}

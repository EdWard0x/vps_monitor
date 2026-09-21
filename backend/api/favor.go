package api

import (
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
	"vpsmonitor/service"

	"github.com/gin-gonic/gin"
)

type FavorApi struct{ Service *service.FavorService }

// 收藏vps
func (a FavorApi) AddFavors(c *gin.Context) {
	vpsId := c.Query("vpsId")
	if vpsId == "" {
		response.Error(c, errcode.InvalidArgument)
		return
	}
	err := a.Service.AddFavors(c.Request.Context(), principalID(c), vpsId)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, "success")
}

// 获取收藏vps
func (a FavorApi) ListFavors(c *gin.Context) {
	var in request.VPSListQuery
	if !bindQuery(c, &in) {
		return
	}

	out, err := a.Service.ListFavors(c.Request.Context(), principalID(c), in)
	if err != nil {
		response.Error(c, err)
		return
	}

	ok(c, out)
}

// 取消收藏vps
func (a FavorApi) DelFavors(c *gin.Context) {
	vpsId := c.Query("vpsId")
	if vpsId == "" {
		response.Error(c, errcode.InvalidArgument)
		return
	}
	err := a.Service.DelFavors(c.Request.Context(), principalID(c), vpsId)
	if err != nil {
		response.Error(c, err)
		return
	}
	ok(c, "success")
}

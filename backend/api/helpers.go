package api

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/response"
)

func bindJSON(c *gin.Context, dst any) bool {
	if err := c.ShouldBindJSON(dst); err != nil {
		response.Error(c, errcode.InvalidArgument)
		return false
	}
	return true
}
func bindQuery(c *gin.Context, dst any) bool {
	if err := c.ShouldBindQuery(dst); err != nil {
		response.Error(c, errcode.InvalidArgument)
		return false
	}
	return true
}
func principalID(c *gin.Context) string {
	value, _ := c.Get("user_id")
	id, _ := value.(string)
	return id
}
func ok(c *gin.Context, data any)  { response.Success(c, http.StatusOK, data) }
func noContentData(c *gin.Context) { response.Success(c, http.StatusOK, nil) }

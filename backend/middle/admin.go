package middle

import (
	"github.com/gin-gonic/gin"
	authiface "vpsmonitor/iface/auth"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/response"
)

// RequireAdmin 仅信任 Authenticate 从当前用户数据形成的 Principal。
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		raw, ok := c.Get("principal")
		if !ok {
			response.Error(c, errcode.AuthRequired)
			return
		}
		principal, ok := raw.(authiface.Principal)
		if !ok || principal.Role != "admin" {
			response.Error(c, errcode.PermissionDenied)
			return
		}
		if !principal.MailVerified {
			response.Error(c, errcode.MailRequired)
			return
		}
		c.Next()
	}
}

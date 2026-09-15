package middle

import (
	"github.com/gin-gonic/gin"
	"strings"
	authiface "vpsmonitor/iface/auth"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/response"
)

// Authenticate 必须由真实 Authenticator 完成完整 AT、冻结和用户版本校验；占位绝不放行。
func Authenticate(authenticator authiface.Authenticator) gin.HandlerFunc {
	return func(c *gin.Context) {
		if authenticator == nil {
			response.Error(c, errcode.NotImplemented)
			return
		}
		header := strings.TrimSpace(c.GetHeader("Authorization"))
		if !strings.HasPrefix(header, "Bearer ") {
			response.Error(c, errcode.AuthRequired)
			return
		}
		principal, err := authenticator.Authenticate(c.Request.Context(), strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")))
		if err != nil {
			response.Error(c, err)
			return
		}
		c.Set("user_id", principal.UserID)
		c.Set("principal", principal)
		c.Next()
	}
}

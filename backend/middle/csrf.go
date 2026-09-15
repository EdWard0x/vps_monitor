package middle

import (
	"crypto/subtle"

	"github.com/gin-gonic/gin"
	authiface "vpsmonitor/iface/auth"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/response"
)

// CSRF 实现双提交校验：客户端必须显式提交与浏览器 Cookie 完全相同的
// X-CSRF-Token，并且 token 本身还必须通过 Provider 的签名和时效校验。
func CSRF(verifier authiface.CSRFVerifier, cookieName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if verifier == nil || cookieName == "" {
			response.Error(c, errcode.NotImplemented)
			return
		}
		headerToken := c.GetHeader("X-CSRF-Token")
		cookieToken, err := c.Cookie(cookieName)
		if err != nil || headerToken == "" || len(headerToken) != len(cookieToken) || subtle.ConstantTimeCompare([]byte(headerToken), []byte(cookieToken)) != 1 {
			response.Error(c, errcode.CSRFRejected)
			return
		}
		if err := verifier.VerifyCSRF(c.Request.Context(), headerToken); err != nil {
			response.Error(c, errcode.CSRFRejected)
			return
		}
		c.Next()
	}
}

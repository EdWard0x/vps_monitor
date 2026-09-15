package router

import (
	"github.com/gin-gonic/gin"
	"vpsmonitor/api"
)

func InitAuthRouter(v1 *gin.RouterGroup, a api.Group, mw Middleware) {
	auth := v1.Group("/auth")
	auth.GET("/csrf", a.AuthApi.IssueCSRF)
	auth.POST("/register", mw.CSRF, a.AuthApi.Register)
	auth.POST("/login", mw.CSRF, a.AuthApi.Login)
	auth.POST("/refresh", mw.CSRF, a.AuthApi.Refresh)
	auth.POST("/logout", mw.CSRF, a.AuthApi.Logout)
	reset := auth.Group("/password-reset", mw.CSRF)
	reset.POST("/code", a.PasswordResetApi.RequestCode)
	reset.POST("/confirm", a.PasswordResetApi.Confirm)
}

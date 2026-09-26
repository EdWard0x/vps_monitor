package router

import (
	"vpsmonitor/api"

	"github.com/gin-gonic/gin"
)

func InitMeRouter(me *gin.RouterGroup, a api.Group) {
	me.GET("/info", a.UserApi.GetMe)
	me.PUT("/update", a.UserApi.UpdateMe)
	me.PUT("/password", a.UserApi.ChangePassword)
	me.POST("/mail/code", a.MailApi.SendCode)
	me.POST("/mail/verify", a.MailApi.Confirm)

	//收藏
	me.POST("/addFavor", a.FavorApi.AddFavors)
	me.GET("/listFavors", a.FavorApi.ListFavors)
	me.DELETE("/delFavor", a.FavorApi.DelFavors)

	//通知
	me.POST("/addNotice", a.NoticeApi.AddNotices)
	me.DELETE("/delNotice", a.NoticeApi.DelNotices)
}
func InitUserRouter(admin *gin.RouterGroup, a api.Group) {
	user := admin.Group("/user")
	user.GET("/list", a.UserApi.ListUsers)
	user.GET("/info", a.UserApi.GetUser)
	user.PUT("/update", a.UserApi.UpdateUser)
	user.PUT("/role", a.UserApi.ChangeRole)
	user.POST("/resetPassword", a.UserApi.AdminResetPassword)
}

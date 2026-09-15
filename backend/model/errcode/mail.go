package errcode

import "net/http"

var (
	MailExists           = &Error{200012, http.StatusConflict, "该邮箱不可用于绑定"}
	MailCodeInvalid      = &Error{200013, http.StatusBadRequest, "验证码错误、过期或已失效"}
	MailUnavailable      = &Error{200014, http.StatusServiceUnavailable, "邮件服务暂不可用或发送失败"}
	MailUnchanged        = &Error{200015, http.StatusConflict, "已绑定相同邮箱"}
	PasswordResetInvalid = &Error{200016, http.StatusBadRequest, "重置请求或验证码错误、过期或已失效"}
)

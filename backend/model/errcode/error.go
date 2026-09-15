package errcode

import (
	"errors"
	"net/http"
)

// Error 是可稳定映射到 HTTP 响应的业务错误。
type Error struct {
	Code       int
	HTTPStatus int
	Message    string
}

func (e *Error) Error() string { return e.Message }

var (
	InvalidArgument  = &Error{100001, http.StatusBadRequest, "参数错误"}
	RateLimited      = &Error{100003, http.StatusTooManyRequests, "请求过于频繁"}
	CSRFRejected     = &Error{100004, http.StatusForbidden, "请求验证失败"}
	ResourceNotFound = &Error{100005, http.StatusNotFound, "资源不存在"}
	ResourceConflict = &Error{100006, http.StatusConflict, "资源冲突或仍被引用"}

	InvalidCredentials = &Error{200001, http.StatusUnauthorized, "用户名或密码错误"}
	AuthRequired       = &Error{200002, http.StatusUnauthorized, "需要登录"}
	AccessExpired      = &Error{200003, http.StatusUnauthorized, "访问令牌已过期"}
	UserFrozen         = &Error{200005, http.StatusForbidden, "账号已冻结"}
	PermissionDenied   = &Error{200006, http.StatusForbidden, "没有权限"}
	InvalidToken       = &Error{200009, http.StatusUnauthorized, "令牌无效"}
	MailRequired       = &Error{200011, http.StatusForbidden, "请先完成邮箱验证"}
	TokenRevoked       = &Error{200017, http.StatusUnauthorized, "令牌已撤销"}

	InvalidUsername       = &Error{300001, http.StatusBadRequest, "用户名不合法"}
	UsernameAlreadyExists = &Error{300002, http.StatusConflict, "用户名已存在"}
	VerifyPasswordFailed  = &Error{300003, http.StatusUnauthorized, "验证密码失败"}

	DatabaseError = &Error{400001, http.StatusInternalServerError, "数据库操作失败"}

	DependencyUnavailable = &Error{900004, http.StatusServiceUnavailable, "依赖服务不可用"}
	NotImplemented        = &Error{900005, http.StatusNotImplemented, "功能尚未实现"}
)

// Resolve 返回最接近的公开错误；未知错误按依赖异常处理，避免泄漏内部细节。
func Resolve(err error) *Error {
	var target *Error
	if errors.As(err, &target) {
		return target
	}
	return DependencyUnavailable
}

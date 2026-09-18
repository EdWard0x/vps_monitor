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

	DatabaseError = &Error{400001, http.StatusInternalServerError, "数据库操作失败"}

	FlareResolveFailed = &Error{400001, http.StatusGatewayTimeout, "flare解析器处理失败"}
	QueryHtmlFailed    = &Error{400001, http.StatusInternalServerError, "html解析失败"}

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

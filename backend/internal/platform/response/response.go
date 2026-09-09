package response

import (
	"errors"
	"github.com/gin-gonic/gin"
	"vpsmonitor/internal/platform/apperror"
)

// Envelope 是所有正常业务响应的外层结构，HTTP 状态码和业务 Code 是两个不同维度。
// 成功时 Code=0，Data 放实际结果；RequestID 用来对应同一次请求。
type Envelope struct {
	Code      int                   `json:"code"`
	Message   string                `json:"message"`
	Data      any                   `json:"data"`
	RequestID string                `json:"request_id"`
	Errors    []apperror.FieldError `json:"errors,omitempty"`
}

func Write(c *gin.Context, status int, data any) {
	c.JSON(status, Envelope{Code: 0, Message: "ok", Data: data, RequestID: c.GetString("request_id")})
}

// Error 保留已知业务错误的状态码；未知错误对外转为统一 500，不把底层原因写给客户端。
// 当前函数没有记录 Cause 日志，不能仅凭响应中的 request_id 找到完整内部错误。
func Error(c *gin.Context, err error) {
	var ae *apperror.Error
	if !errors.As(err, &ae) {
		ae = apperror.Wrap(900001, 500, "服务暂时异常，请稍后重试", err)
	}
	c.AbortWithStatusJSON(ae.HTTP, Envelope{Code: ae.Code, Message: ae.Message, Data: nil, RequestID: c.GetString("request_id"), Errors: ae.Fields})
}

package response

import (
	"github.com/gin-gonic/gin"
	"vpsmonitor/model/errcode"
)

type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}
type Envelope struct {
	Code      int          `json:"code"`
	Message   string       `json:"message"`
	Data      any          `json:"data"`
	RequestID string       `json:"request_id"`
	Errors    []FieldError `json:"errors,omitempty"`
}

func Success(c *gin.Context, status int, data any) {
	c.JSON(status, Envelope{Code: 0, Message: "ok", Data: data, RequestID: requestID(c)})
}
func Error(c *gin.Context, err error) {
	e := errcode.Resolve(err)
	c.AbortWithStatusJSON(e.HTTPStatus, Envelope{Code: e.Code, Message: e.Message, Data: nil, RequestID: requestID(c)})
}
func requestID(c *gin.Context) string {
	if v, ok := c.Get("request_id"); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

type List[T any] struct {
	Items    []T   `json:"items"`
	Total    int64 `json:"total"`
	Page     int   `json:"page"`
	PageSize int   `json:"page_size"`
}

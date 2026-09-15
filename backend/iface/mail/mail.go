package mail

import (
	"context"
)

// Message 是 service 交给底层邮件发送器的稳定参数。
type Message struct {
	To       []string
	Subject  string
	TextBody string
	HTMLBody string
}

// Sender 定义邮件基础设施边界。service 只依赖此接口，不了解 SMTP 细节。
type Sender interface {
	Ready() error
	Send(context.Context, Message) error
}

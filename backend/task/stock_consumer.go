package task

import (
	"context"
	messageiface "vpsmonitor/iface/message"
	"vpsmonitor/model/errcode"
	"vpsmonitor/service"
)

type StockConsumer struct {
	Enabled      bool
	Reader       messageiface.Reader
	Acknowledger messageiface.Acknowledger
	Service      *service.StockService
	Options      messageiface.ReadOptions
}

// Run 默认不读取消息；启用后在处理和确认语义完成前也拒绝消费，防止真实消息丢失。
func (c *StockConsumer) Run(context.Context) error {
	if !c.Enabled {
		return nil
	}

	return errcode.NotImplemented
}

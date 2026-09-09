// Package ports 定义应用需要的能力接口和跨层参数。接口说明“能做什么”，实现决定“怎么做”。
package ports

import (
	"context"
	"time"
	"vpsmonitor/internal/domain"
)

type Page struct{ Page, Size int }
type VPSFilter struct {
	MerchantID                       *int64
	Status                           *int16
	Q, Currency, BillingPeriod, Sort string
	Enabled                          *bool
	Page                             Page
}
type UserFilter struct {
	Q, Role string
	Enabled *bool
	Page    Page
}
type CommentFilter struct {
	VPSID, UserID *int64
	Visibility    *int16
	IsAnonymous   *bool
	Q             string
	Page          Page
}
type MerchantFilter struct {
	Q       string
	Enabled *bool
	Page    Page
}
type MonitorFilter struct {
	MerchantID *int64
	Status     *int16
	Enabled    *bool
	Q          string
	Page       Page
}

// PublicVPS 聚合套餐、商家、配置和库存，供 HTTP 层转换为响应。
// 名称中的 Public 不代表可直接全部序列化：内部仍有租约、错误等管理字段。
type PublicVPS struct {
	VPS      domain.VPS
	Merchant domain.Merchant
	Config   domain.MonitorConfig
	Stock    domain.Stock
}
type MonitorRow struct{ PublicVPS }
type CommentRow struct {
	Comment    domain.Comment
	User       domain.User
	ReplyCount int64
	Renderable bool
}
type Lease struct {
	VPS     domain.VPS
	Config  domain.MonitorConfig
	Token   string
	Version int64
}

// Repository 是当前实现共用的仓储接口，业务较多，学习时只看正在追踪的方法。
// 查询中的 bool 通常表示 public；GetSettings 的 bool 则表示是否加行锁。
// Transaction 回调中的 Repository 绑定同一个事务，应使用回调参数，不能误用外部 Repo。
// Update* 的 map 键是数据库列名；这种写法支持更新 false、0、nil，但编译器无法检查键名。
type Repository interface {
	Ping(context.Context) error
	Transaction(context.Context, func(Repository) error) error
	GetSettings(context.Context, bool) (domain.Settings, time.Time, error)
	UpdateSettings(context.Context, map[string]string, int64) (domain.Settings, time.Time, error)
	ListMerchants(context.Context, MerchantFilter, bool) ([]domain.Merchant, int64, error)
	GetMerchant(context.Context, int64, bool) (domain.Merchant, error)
	CreateMerchant(context.Context, domain.Merchant) (domain.Merchant, error)
	UpdateMerchant(context.Context, int64, map[string]any) (domain.Merchant, error)
	ListVPS(context.Context, VPSFilter, bool) ([]PublicVPS, int64, error)
	GetVPS(context.Context, int64, bool) (PublicVPS, error)
	CreateVPS(context.Context, domain.VPS, domain.MonitorConfig) (PublicVPS, error)
	UpdateVPS(context.Context, int64, map[string]any) (PublicVPS, error)
	GetUserByUsername(context.Context, string) (domain.User, error)
	GetUser(context.Context, int64) (domain.User, error)
	CreateUser(context.Context, domain.User) (domain.User, error)
	UpdateUser(context.Context, int64, map[string]any) (domain.User, error)
	ListUsers(context.Context, UserFilter) ([]domain.User, int64, error)
	CreateSession(context.Context, domain.Session) error
	GetSessionUser(context.Context, string) (domain.Session, domain.User, error)
	RotateSession(context.Context, string, int64, string, string, time.Time) (string, error)
	RevokeSession(context.Context, string, int64) error
	RevokeAllSessions(context.Context, int64, time.Time) (int64, error)
	ListSessions(context.Context, int64, Page) ([]domain.Session, int64, error)
	CreateComment(context.Context, int64, int64, string, bool, *int64) (domain.Comment, error)
	GetComment(context.Context, int64) (CommentRow, error)
	ListComments(context.Context, int64, *int64, *time.Time, int64, int, bool) ([]CommentRow, error)
	SearchComments(context.Context, int64, string, *time.Time, int64, int) ([]CommentRow, error)
	ListOwnComments(context.Context, int64, CommentFilter) ([]domain.Comment, int64, error)
	DeleteOwnComment(context.Context, int64, int64) error
	ListAdminComments(context.Context, CommentFilter) ([]CommentRow, int64, error)
	SetCommentVisibility(context.Context, int64, int16) (CommentRow, error)
	DeleteComment(context.Context, int64) error
	ListMonitors(context.Context, MonitorFilter) ([]MonitorRow, int64, error)
	UpdateMonitor(context.Context, int64, domain.MonitorConfig, int64) (domain.MonitorConfig, error)
	QueueCheck(context.Context, int64) (domain.MonitorConfig, error)
	ClaimDue(context.Context, time.Time, int) ([]Lease, error)
	CompleteLease(context.Context, Lease, domain.Observation, time.Time) error
	Dashboard(context.Context) (map[string]any, error)
}

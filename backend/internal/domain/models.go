// Package domain 定义业务数据结构，阅读时可把它当作本项目的数据词典。
// 当前实体同时承担 GORM 表映射，包含 gorm 标签和 TableName；并非完全独立的领域模型。
package domain

import (
	"github.com/shopspring/decimal"
	"time"
)

// Merchant 是商家；一个商家可以拥有多个 VPS 套餐。
type Merchant struct {
	ID                   int64 `gorm:"primaryKey"`
	Code                 string
	Name                 string
	WebsiteURL           string
	Enabled              bool
	CreatedAt, UpdatedAt time.Time
}

func (Merchant) TableName() string { return "merchant" }

// VPS 表示在售套餐的规格和价格，不是正在运行的虚拟机实例。
// 金额使用 decimal；TransferGB 的 nil 表示未知，0 表示不限流量，正数表示额度。
// PortMbps 的 nil 表示速率未知；非空时必须为正数。
type VPS struct {
	ID                         int64 `gorm:"primaryKey"`
	MerchantID                 int64
	Code, Name, Description    string
	CPUCores, MemoryMB, DiskGB int
	DiskType                   string
	TransferGB, PortMbps       *int
	PriceAmount                decimal.Decimal `gorm:"type:numeric(12,2)"`
	Currency, BillingPeriod    string
	Enabled                    bool
	CreatedAt, UpdatedAt       time.Time
}

func (VPS) TableName() string { return "vps_detail" }

// MonitorConfig 与 VPS 一对一，保存采集方式和调度状态。
// LeaseToken 标识某次领取，LeaseExpiresAt 是领取有效期；ConfigVersion 随配置更新递增。
// Worker 回写时核对这些字段，避免旧任务覆盖新配置下的库存。
type MonitorConfig struct {
	VPSID                               int64 `gorm:"column:vps_id;primaryKey"`
	SourceURL, CollectorCode            string
	PollIntervalSeconds, TimeoutSeconds int
	Enabled                             bool
	NextCheckAt                         time.Time
	LeaseToken                          *string
	LeaseExpiresAt                      *time.Time
	ConfigVersion                       int64
	UpdatedAt                           time.Time
}

func (MonitorConfig) TableName() string { return "vps_monitor_configs" }

// Stock 保存最近一次库存观测：Status 1=有货，2=无货，3=未知。
// Quantity 为 nil 表示数量未知，指向 0 才表示数量明确为零。
type Stock struct {
	VPSID                        int64 `gorm:"column:vps_id;primaryKey"`
	Status                       int16
	Quantity                     *int
	LastCheckedAt, LastInStockAt *time.Time
	LastErrorCode                *string
	UpdatedAt                    time.Time
}

func (Stock) TableName() string { return "vps_stocks" }

// User 是账户记录。PasswordHash 只保存密码哈希，HTTP 响应通过 userDTO 排除它。
type User struct {
	ID                                     int64 `gorm:"primaryKey"`
	Username, Nickname, PasswordHash, Role string
	Enabled                                bool
	CreatedAt, UpdatedAt                   time.Time
}

func (User) TableName() string { return "users" }

// Session 对应一次登录；同一用户可有多条会话。
// RefreshJTIHash 保存当前刷新令牌标识的哈希，RevokedAt 非 nil 表示已撤销。
type Session struct {
	ID                   string `gorm:"primaryKey"`
	UserID               int64
	RefreshJTIHash       string `gorm:"column:refresh_jti_hash"`
	RefreshExpiresAt     time.Time
	RevokedAt            *time.Time
	CreatedAt, UpdatedAt time.Time
}

func (Session) TableName() string { return "user_sessions" }

// Comment 用 ParentID 连接直接父评论，用 RootID 指向所在讨论串的根。
// 根评论深度为 0，最多允许深度 4；根节点的 ParentID 和 RootID 都为 nil。
// Visibility：1=可见，2=待审核，3=隐藏，4=已删除。匿名不抹掉内部作者信息。
type Comment struct {
	ID, VPSID, UserID     int64
	UserNickname, Content string
	IsAnonymous           bool
	Visibility            int16
	ParentID, RootID      *int64
	Depth                 int16
	CreatedAt, UpdatedAt  time.Time
}

func (Comment) TableName() string { return "comments" }

type SiteSetting struct {
	Key, Value string
	UpdatedBy  *int64
	UpdatedAt  time.Time
}

func (SiteSetting) TableName() string { return "site_settings" }

// Observation 是采集器的返回值；它还未写入数据库，需经过 Worker 校验和租约核对。
type Observation struct {
	Status    int16
	Quantity  *int
	ErrorCode string
}
type Claim struct {
	UserID    int64
	SessionID string
}
type Settings struct {
	SiteName                 string `json:"site_name"`
	RegistrationEnabled      bool   `json:"registration_enabled"`
	CommentsEnabled          bool   `json:"comments_enabled"`
	AnonymousCommentsEnabled bool   `json:"anonymous_comments_enabled"`
	CommentReviewRequired    bool   `json:"comment_review_required"`
	CommentMaxDepth          int    `json:"comment_max_depth"`
}

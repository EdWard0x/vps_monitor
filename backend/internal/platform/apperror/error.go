package apperror

import "fmt"

type FieldError struct {
	Field  string `json:"field"`
	Reason string `json:"reason"`
	Limit  *int   `json:"limit,omitempty"`
}

// Error 将业务编号、HTTP 状态和可展示文案放在一起；Cause 用于保存底层原因。
// 包级错误值被多个请求复用，应当作只读值，不要在 handler 中直接修改其字段。
type Error struct {
	Code    int
	HTTP    int
	Message string
	Fields  []FieldError
	Cause   error
}

func (e *Error) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Cause)
	}
	return e.Message
}
func New(code, http int, msg string) *Error { return &Error{Code: code, HTTP: http, Message: msg} }
func Wrap(code, http int, msg string, cause error) *Error {
	return &Error{Code: code, HTTP: http, Message: msg, Cause: cause}
}

var (
	InvalidArgument      = New(100001, 400, "请求参数不合法")
	InvalidJSON          = New(100002, 400, "请求格式不正确")
	RateLimited          = New(100003, 429, "操作过于频繁，请稍后再试")
	CSRFRejected         = New(100004, 403, "请求验证失败，请刷新页面")
	NotFound             = New(100005, 404, "资源不存在")
	BodyTooLarge         = New(100006, 413, "请求内容过大")
	UnsupportedMedia     = New(100007, 415, "不支持的请求格式")
	InvalidCredentials   = New(200001, 401, "用户名或密码错误，或账户不可用")
	AuthRequired         = New(200002, 401, "请先登录")
	AccessExpired        = New(200003, 401, "登录凭证已过期")
	SessionRevoked       = New(200004, 401, "登录会话已失效，请重新登录")
	UserDisabled         = New(200005, 401, "账户已停用")
	PermissionDenied     = New(200006, 403, "没有操作权限")
	UsernameExists       = New(200007, 409, "用户名已被使用")
	RegistrationDisabled = New(200008, 403, "暂未开放注册")
	InvalidToken         = New(200009, 401, "登录凭证无效")
	RefreshReused        = New(200010, 401, "登录会话已失效，请重新登录")
	VPSNotFound          = New(300001, 404, "VPS 不存在或已下架")
	MonitorDisabled      = New(300002, 409, "请先启用商家、VPS 和监控")
	MonitorBusy          = New(300003, 409, "当前正在检查，请稍后查看")
	VersionConflict      = New(300004, 409, "配置已更新，请刷新后重试")
	CollectorUnavailable = New(300005, 422, "当前采集器不可用")
	SourceURLRejected    = New(300006, 422, "监控地址不符合访问要求")
	CommentsDisabled     = New(400001, 403, "暂未开放评论")
	AnonymousDisabled    = New(400002, 403, "暂未开放匿名评论")
	ParentNotFound       = New(400003, 404, "回复的评论不存在")
	DepthExceeded        = New(400004, 422, "已达到评论嵌套层数上限")
	CommentNotOwned      = New(400005, 403, "只能删除自己的评论")
	CommentStateConflict = New(400006, 409, "当前评论状态不支持此操作")
	ParentUnavailable    = New(400007, 409, "该评论暂不支持回复")
	LastAdmin            = New(500001, 409, "必须保留至少一个启用的管理员")
	CodeExists           = New(500002, 409, "商家或 VPS 标识已存在")
	Internal             = New(900001, 500, "服务暂时异常，请稍后重试")
	DBUnavailable        = New(900002, 503, "服务暂不可用，请稍后重试")
)

package application

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
	"vpsmonitor/internal/domain"
	"vpsmonitor/internal/platform/apperror"
	"vpsmonitor/internal/platform/pagination"
	"vpsmonitor/internal/ports"

	"github.com/google/uuid"
)

// Service 汇集应用用例和所需依赖；当前认证、评论、校验和监控共用这个结构体。
// Repo/Tokens 等字段是能力接口，实际对象由 bootstrap.Build 注入。
// 当前有些 CRUD 由 HTTP 层直接调用 Repo，不是所有请求都会经过 Service 方法。
type Service struct {
	Repo                ports.Repository
	Tokens              ports.TokenService
	Passwords           ports.PasswordService
	CSRF                ports.CSRFService
	Cursor              pagination.Signer
	Collectors          ports.CollectorRegistry
	Demo                bool
	MerchantConcurrency int
}

var usernameRE = regexp.MustCompile(`^[a-z0-9_]{4,32}$`)
var codeRE = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)

func NormalizeUsername(s string) string { return strings.ToLower(strings.TrimSpace(s)) }
func validPassword(s string) bool {
	n := utf8.RuneCountInString(s)
	return n >= 12 && n <= 128 && len([]byte(s)) <= 512
}
func validNickname(s string) bool {
	n := utf8.RuneCountInString(strings.TrimSpace(s))
	return n >= 1 && n <= 32
}
func validHTTPURL(raw string) bool {
	if len(raw) > 2048 {
		return false
	}
	u, e := url.Parse(raw)
	if e != nil || u.Host == "" || u.User != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	p := u.Port()
	return p == "" || p == "80" || p == "443"
}

// Register 按“读取注册开关 → 归一化输入 → 校验 → 哈希密码 → 保存用户”执行。
// ctx 沿调用链传入仓储；它承载取消信号等请求信息，不是业务数据本身。
func (s *Service) Register(ctx context.Context, username, nickname, password string) (domain.User, error) {
	settings, _, e := s.Repo.GetSettings(ctx, false)
	if e != nil {
		return domain.User{}, e
	}
	if !settings.RegistrationEnabled {
		return domain.User{}, apperror.RegistrationDisabled
	}
	username = NormalizeUsername(username)
	nickname = strings.TrimSpace(nickname)
	if !usernameRE.MatchString(username) || !validNickname(nickname) || !validPassword(password) {
		return domain.User{}, apperror.InvalidArgument
	}
	h, e := s.Passwords.Hash(password)
	if e != nil {
		return domain.User{}, e
	}
	return s.Repo.CreateUser(ctx, domain.User{Username: username, Nickname: nickname, PasswordHash: h, Role: "user", Enabled: true})
}

// Login 校验密码，创建一次登录会话，并返回用户、access、refresh、access 剩余秒数和错误。
// HTTP 层负责设置 Cookie；这里不依赖 Gin，也不直接操作 HTTP 响应。
func (s *Service) Login(ctx context.Context, username, password string) (domain.User, string, string, int, error) {
	username = NormalizeUsername(username)
	u, e := s.Repo.GetUserByUsername(ctx, username)
	if e != nil || !u.Enabled || !s.Passwords.Verify(u.PasswordHash, password) {
		s.Passwords.Verify("$argon2id$v=19$m=19456,t=2,p=1$MDEyMzQ1Njc4OWFiY2RlZg$L8mP9v7k5m3j1h0fXx0vX8lVq2pB3sZP9Y7n4Y0WqQo", "dummy-password-value")
		return domain.User{}, "", "", 0, apperror.InvalidCredentials
	}
	sid := uuid.NewString()
	absolute := time.Now().UTC().Add(7 * 24 * time.Hour)
	access, refresh, jti, expires, e := s.Tokens.Issue(u.ID, sid, absolute)
	if e != nil {
		return u, "", "", 0, e
	}
	sess := domain.Session{ID: sid, UserID: u.ID, RefreshJTIHash: s.Tokens.HashJTI(jti), RefreshExpiresAt: absolute, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}
	if e = s.Repo.CreateSession(ctx, sess); e != nil {
		return u, "", "", 0, e
	}
	return u, access, refresh, expires, nil
}

// Authenticate 不只验证令牌签名，还读取数据库中的会话、账户状态和当前角色。
// 因此权限判断不依赖 JWT 中缓存的旧角色；admin=true 时进一步要求管理员身份。
func (s *Service) Authenticate(ctx context.Context, raw string, admin bool) (domain.User, domain.Session, error) {
	c, e := s.Tokens.Verify(raw, "access")
	if e != nil {
		if strings.Contains(e.Error(), "expired") {
			return domain.User{}, domain.Session{}, apperror.AccessExpired
		}
		return domain.User{}, domain.Session{}, apperror.InvalidToken
	}
	uid, e := strconv.ParseInt(c.Subject, 10, 64)
	if e != nil {
		return domain.User{}, domain.Session{}, apperror.InvalidToken
	}
	sess, u, e := s.Repo.GetSessionUser(ctx, c.SessionID)
	if e != nil || sess.UserID != uid {
		return domain.User{}, domain.Session{}, apperror.SessionRevoked
	}
	if !u.Enabled {
		return domain.User{}, domain.Session{}, apperror.UserDisabled
	}
	if sess.RevokedAt != nil || !sess.RefreshExpiresAt.After(time.Now().UTC()) {
		return domain.User{}, domain.Session{}, apperror.SessionRevoked
	}
	if admin && u.Role != "admin" {
		return domain.User{}, domain.Session{}, apperror.PermissionDenied
	}
	return u, sess, nil
}

// Refresh 先准备新令牌，再由 RotateSession 在数据库事务内竞争更新刷新 JTI。
// 只有更新成功才把新令牌返回；旧 JTI 被再次使用时，仓储会提交会话撤销。
func (s *Service) Refresh(ctx context.Context, raw string) (string, string, int, error) {
	c, e := s.Tokens.Verify(raw, "refresh")
	if e != nil {
		return "", "", 0, apperror.InvalidToken
	}
	uid, e := strconv.ParseInt(c.Subject, 10, 64)
	if e != nil {
		return "", "", 0, apperror.InvalidToken
	}
	sess, u, e := s.Repo.GetSessionUser(ctx, c.SessionID)
	if e != nil || sess.UserID != uid {
		return "", "", 0, apperror.SessionRevoked
	}
	if !u.Enabled {
		return "", "", 0, apperror.UserDisabled
	}
	access, refresh, newJTI, expires, e := s.Tokens.Issue(uid, c.SessionID, sess.RefreshExpiresAt)
	if e != nil {
		return "", "", 0, e
	}
	result, e := s.Repo.RotateSession(ctx, c.SessionID, uid, s.Tokens.HashJTI(c.ID), s.Tokens.HashJTI(newJTI), time.Now().UTC())
	if e != nil {
		return "", "", 0, e
	}
	if result == "reused" {
		return "", "", 0, apperror.RefreshReused
	}
	if result != "ok" {
		return "", "", 0, apperror.SessionRevoked
	}
	return access, refresh, expires, nil
}

// ChangePassword 把改密码和撤销会话放在同一事务里，密码哈希计算放在事务之前。
// fresh 的比较意图是检测旧哈希变化；当前 GetUser 本身不加行锁，不能视为完整的并发保证。
func (s *Service) ChangePassword(ctx context.Context, user domain.User, current, next string) error {
	if !validPassword(next) || !s.Passwords.Verify(user.PasswordHash, current) {
		return apperror.InvalidCredentials
	}
	h, e := s.Passwords.Hash(next)
	if e != nil {
		return e
	}
	return s.Repo.Transaction(ctx, func(r ports.Repository) error {
		fresh, e := r.GetUser(ctx, user.ID)
		if e != nil {
			return e
		}
		if subtle.ConstantTimeCompare([]byte(fresh.PasswordHash), []byte(user.PasswordHash)) != 1 {
			// 当前复用了评论错误码，语义不匹配；阅读时不要把它理解成评论相关操作。
			return apperror.CommentStateConflict
		}
		if _, e = r.UpdateUser(ctx, user.ID, map[string]any{"password_hash": h}); e != nil {
			return e
		}
		_, e = r.RevokeAllSessions(ctx, user.ID, time.Now().UTC())
		return e
	})
}
func (s *Service) CreateAdmin(ctx context.Context, username, nickname, password string) (domain.User, error) {
	username = NormalizeUsername(username)
	nickname = strings.TrimSpace(nickname)
	if !usernameRE.MatchString(username) || !validNickname(nickname) || !validPassword(password) {
		//fmt.Println("Invalid input:", username, nickname, password)
		return domain.User{}, apperror.InvalidArgument
	}
	if _, e := s.Repo.GetUserByUsername(ctx, username); e == nil {
		return domain.User{}, apperror.UsernameExists
	} else if !errors.Is(e, apperror.NotFound) {
		return domain.User{}, e
	}
	h, e := s.Passwords.Hash(password)
	if e != nil {
		return domain.User{}, e
	}
	return s.Repo.CreateUser(ctx, domain.User{Username: username, Nickname: nickname, PasswordHash: h, Role: "admin", Enabled: true})
}
func (s *Service) ValidateMerchant(code, name, website string) error {
	if !codeRE.MatchString(code) || utf8.RuneCountInString(strings.TrimSpace(name)) < 1 || utf8.RuneCountInString(strings.TrimSpace(name)) > 128 || !validHTTPURL(website) {
		return apperror.InvalidArgument
	}
	return nil
}
func (s *Service) ValidateMonitor(c domain.MonitorConfig) error {
	if !validHTTPURL(c.SourceURL) || c.PollIntervalSeconds < 60 || c.PollIntervalSeconds > 86400 || c.TimeoutSeconds < 1 || c.TimeoutSeconds > 60 || c.TimeoutSeconds >= c.PollIntervalSeconds {
		return apperror.SourceURLRejected
	}
	collector, ok := s.Collectors.Get(c.CollectorCode)
	if !ok || !collector.Available() {
		return apperror.CollectorUnavailable
	}
	return nil
}

// ValidateVPS 校验完整套餐；PATCH 调用方先把局部修改合并到旧值，再调用此方法。
func (s *Service) ValidateVPS(v domain.VPS) error {
	if !codeRE.MatchString(v.Code) || utf8.RuneCountInString(strings.TrimSpace(v.Name)) < 1 || utf8.RuneCountInString(strings.TrimSpace(v.Name)) > 128 || utf8.RuneCountInString(v.Description) > 10000 || v.CPUCores < 1 || v.MemoryMB < 1 || v.DiskGB < 1 || v.PriceAmount.IsNegative() {
		return apperror.InvalidArgument
	}
	if v.DiskType != "ssd" && v.DiskType != "nvme" && v.DiskType != "hdd" && v.DiskType != "unknown" {
		return apperror.InvalidArgument
	}
	if v.TransferGB != nil && *v.TransferGB < 0 || v.PortMbps != nil && *v.PortMbps <= 0 {
		return apperror.InvalidArgument
	}
	if !regexp.MustCompile(`^[A-Z]{3}$`).MatchString(v.Currency) {
		return apperror.InvalidArgument
	}
	if v.BillingPeriod != "monthly" && v.BillingPeriod != "quarterly" && v.BillingPeriod != "yearly" && v.BillingPeriod != "one_time" {
		return apperror.InvalidArgument
	}
	return nil
}
func (s *Service) ResetPassword(ctx context.Context, userID int64, password string) error {
	if !validPassword(password) {
		return apperror.InvalidArgument
	}
	h, e := s.Passwords.Hash(password)
	if e != nil {
		return e
	}
	return s.Repo.Transaction(ctx, func(r ports.Repository) error {
		if _, e := r.UpdateUser(ctx, userID, map[string]any{"password_hash": h}); e != nil {
			return e
		}
		_, e := r.RevokeAllSessions(ctx, userID, time.Now().UTC())
		return e
	})
}

// CreateComment 在应用层检查正文；开关、父节点和深度规则目前在仓储事务中执行。
func (s *Service) CreateComment(ctx context.Context, vps, user int64, content string, anon bool, parent *int64) (domain.Comment, error) {
	content = strings.TrimSpace(content)
	n := utf8.RuneCountInString(content)
	if n < 1 || n > 2000 {
		return domain.Comment{}, apperror.InvalidArgument
	}
	return s.Repo.CreateComment(ctx, vps, user, content, anon, parent)
}

// RunWorkerOnce 完成一批“领取任务 → 并发采集 → 校验观测 → 尝试回写”。
// 网络采集发生在 ClaimDue 和 CompleteLease 两次数据库操作之间，不占着数据库事务等待网络。
func (s *Service) RunWorkerOnce(ctx context.Context, limit int) error {
	leases, e := s.Repo.ClaimDue(ctx, time.Now().UTC(), limit)
	if e != nil {
		return e
	}
	perMerchant := s.MerchantConcurrency
	if perMerchant < 1 {
		perMerchant = 2
	}
	// 每个商家一个带缓冲的 channel：放入一个值代表占用一个并发名额，取出代表释放。
	// 它只限制本次扫描中的并发；任务在等待名额前已经领取，租约时间也已经开始计时。
	guards := map[int64]chan struct{}{}
	for _, l := range leases {
		if guards[l.VPS.MerchantID] == nil {
			guards[l.VPS.MerchantID] = make(chan struct{}, perMerchant)
		}
	}
	// WaitGroup 等待所有 goroutine 收尾；Mutex 保护多个 goroutine 共享的 first 错误。
	var wg sync.WaitGroup
	var first error
	var mu sync.Mutex
	//从env中传递processorURL
	for _, l := range leases {
		l := l
		wg.Add(1)
		go func() {
			defer wg.Done()
			guard := guards[l.VPS.MerchantID]
			select {
			case guard <- struct{}{}:
				defer func() { <-guard }()
			case <-ctx.Done():
				return
			}
			c, ok := s.Collectors.Get(l.Config.CollectorCode)
			if !ok || !c.Available() {
				_ = s.Repo.CompleteLease(ctx, l, domain.Observation{Status: 3, ErrorCode: "SOURCE_URL_REJECTED"}, time.Now().UTC())
				return
			}
			// 每个采集任务有自己的超时；取消后及时释放定时器资源。
			task, cancel := context.WithTimeout(ctx, time.Duration(l.Config.TimeoutSeconds)*time.Second)
			o, collectErr := c.Collect(task, ports.CollectRequest{VPSID: l.VPS.ID, Code: l.VPS.Code, SourceURL: l.Config.SourceURL, ProcessorURL: os.Getenv("PROCESSOR_URL")})
			cancel()
			if collectErr != nil {
				o = domain.Observation{Status: 3, ErrorCode: "FETCH_NETWORK"}
			}
			// 无货必须带明确的零数量；未知状态不能同时声称有确定数量。
			if o.Status < 1 || o.Status > 3 || (o.Status == 2 && (o.Quantity == nil || *o.Quantity != 0)) || (o.Status == 3 && o.Quantity != nil) {
				o = domain.Observation{Status: 3, ErrorCode: "PARSE_CONFLICT"}
			}
			if err := s.Repo.CompleteLease(ctx, l, o, time.Now().UTC()); err != nil {
				mu.Lock()
				if first == nil {
					first = err
				}
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	return first
}
func ParseID(raw string) (int64, error) {
	v, e := strconv.ParseInt(raw, 10, 64)
	if e != nil || v <= 0 {
		return 0, apperror.InvalidArgument
	}
	return v, nil
}
func Bearer(h string) (string, error) {
	p := strings.Fields(h)
	if len(p) != 2 || !strings.EqualFold(p[0], "Bearer") {
		return "", apperror.AuthRequired
	}
	return p[1], nil
}
func (s *Service) String() string { return fmt.Sprintf("service(demo=%v)", s.Demo) }

package service

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
	authiface "vpsmonitor/iface/auth"
	frozeiface "vpsmonitor/iface/froze"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/request"
	"vpsmonitor/model/response"
)

type AuthService struct {
	DB        *gorm.DB
	tokens    authiface.TokenProvider
	passwords authiface.PasswordProvider
	csrf      authiface.CSRFProvider
	frozen    frozeiface.Checker
}

type RefreshCredential struct {
	Token     string
	ExpiresAt time.Time
}

func NewAuthService(db *gorm.DB, tokens authiface.TokenProvider, passwords authiface.PasswordProvider, csrf authiface.CSRFProvider, frozen frozeiface.Checker) *AuthService {
	return &AuthService{DB: db, tokens: tokens, passwords: passwords, csrf: csrf, frozen: frozen}
}

var usernamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_]{2,63}$`)

// Register 只创建普通用户；站点关闭注册时，管理员候选账号仍可由 CLI 创建。
func (s *AuthService) Register(ctx context.Context, in request.Register) (response.PublicUser, error) {
	if s.DB == nil {
		return response.PublicUser{}, errcode.NotImplemented
	}
	var settings entity.SiteSetting
	err := s.DB.WithContext(ctx).First(&settings).Error
	if errors.Is(err, gorm.ErrRecordNotFound) || (err == nil && !settings.RegistrationEnabled) {
		return response.PublicUser{}, errcode.RegistrationDisabled
	}
	if err != nil {
		return response.PublicUser{}, errcode.DatabaseError
	}
	return s.CreateCandidate(ctx, in)
}

// CreateCandidate 供本机管理员初始化命令使用，不通过公开路由绕过注册开关。
func (s *AuthService) CreateCandidate(ctx context.Context, in request.Register) (response.PublicUser, error) {
	if s.DB == nil {
		return response.PublicUser{}, errcode.NotImplemented
	}
	username := strings.ToLower(strings.TrimSpace(in.Username))
	if !usernamePattern.MatchString(username) {
		return response.PublicUser{}, errcode.InvalidUsername
	}
	nickname := strings.TrimSpace(in.Nickname)
	if !validNickname(nickname) {
		return response.PublicUser{}, errcode.InvalidArgument
	}
	if s.passwords == nil {
		return response.PublicUser{}, errcode.DependencyUnavailable
	}
	if s.passwords.Validate(in.Password) != nil {
		return response.PublicUser{}, errcode.InvalidArgument
	}
	hash, err := s.passwords.Hash(in.Password)
	if err != nil {
		return response.PublicUser{}, errcode.DependencyUnavailable
	}
	user := entity.User{Username: username, Nickname: nickname, PasswordHash: hash, Role: "user", TokenVersion: 1}
	if err := s.DB.WithContext(ctx).Create(&user).Error; err != nil {
		var pgErr *pgconn.PgError
		if errors.Is(err, gorm.ErrDuplicatedKey) || (errors.As(err, &pgErr) && pgErr.Code == "23505") {
			return response.PublicUser{}, errcode.UsernameAlreadyExists
		}
		return response.PublicUser{}, errcode.DatabaseError
	}
	return publicAccount(user), nil
}

func validNickname(value string) bool {
	return value != "" && utf8.ValidString(value) && utf8.RuneCountInString(value) <= 64
}

// Login 使用当前 token_version 签发 AT/RT，正常登录不递增版本。
func (s *AuthService) Login(ctx context.Context, in request.Login) (response.LoginResult, RefreshCredential, error) {
	if s.DB == nil {
		return response.LoginResult{}, RefreshCredential{}, errcode.NotImplemented
	}
	if s.passwords == nil || s.tokens == nil || s.frozen == nil {
		return response.LoginResult{}, RefreshCredential{}, errcode.DependencyUnavailable
	}
	var user entity.User
	if err := s.DB.WithContext(ctx).Where("username = ?", strings.ToLower(strings.TrimSpace(in.Username))).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return response.LoginResult{}, RefreshCredential{}, errcode.InvalidCredentials
		}
		return response.LoginResult{}, RefreshCredential{}, errcode.DatabaseError
	}
	if err := s.passwords.Verify(user.PasswordHash, in.Password); err != nil {
		return response.LoginResult{}, RefreshCredential{}, errcode.InvalidCredentials
	}
	account := accountDetails(user)
	if err := s.frozen.Check(ctx, account.ID); err != nil {
		return response.LoginResult{}, RefreshCredential{}, err
	}
	pair, err := s.tokens.Issue(ctx, authiface.TokenIssueInput{UserID: account.ID, Role: user.Role, TokenVersion: user.TokenVersion})
	if err != nil {
		return response.LoginResult{}, RefreshCredential{}, err
	}
	credential := RefreshCredential{Token: pair.RefreshToken, ExpiresAt: pair.RefreshExpiresAt}
	return response.LoginResult{User: account, AccessToken: pair.AccessToken, TokenType: "Bearer", ExpiresIn: tokenExpiresIn(pair.AccessExpiresAt)}, credential, nil
}

// Refresh 验证 RT、冻结状态和当前版本，沿用原 RT 截止时间，避免无限续期。
func (s *AuthService) Refresh(ctx context.Context, raw string) (response.TokenResult, RefreshCredential, error) {
	if s.DB == nil {
		return response.TokenResult{}, RefreshCredential{}, errcode.NotImplemented
	}
	if s.tokens == nil {
		return response.TokenResult{}, RefreshCredential{}, errcode.DependencyUnavailable
	}
	claims, err := s.tokens.Verify(ctx, raw, authiface.RefreshToken)
	if err != nil {
		return response.TokenResult{}, RefreshCredential{}, err
	}
	user, err := s.currentUser(ctx, claims)
	if err != nil {
		return response.TokenResult{}, RefreshCredential{}, err
	}
	pair, err := s.tokens.Issue(ctx, authiface.TokenIssueInput{UserID: claims.Subject, Role: user.Role, TokenVersion: user.TokenVersion, RefreshExpiresAt: claims.ExpiresAt})
	if err != nil {
		return response.TokenResult{}, RefreshCredential{}, err
	}
	credential := RefreshCredential{Token: pair.RefreshToken, ExpiresAt: pair.RefreshExpiresAt}
	return response.TokenResult{AccessToken: pair.AccessToken, TokenType: "Bearer", ExpiresIn: tokenExpiresIn(pair.AccessExpiresAt)}, credential, nil
}

// Logout 由 API 清除当前浏览器 RT Cookie，不承诺撤销其它设备或已复制令牌。
func (*AuthService) Logout(ctx context.Context) error { return ctx.Err() }

// IssueCSRF 复用仍有效的双提交 CSRF 凭据，避免多个标签页互相覆盖 Cookie。
func (s *AuthService) IssueCSRF(ctx context.Context, existingToken string) (response.CSRFResult, error) {
	if s.csrf == nil {
		return response.CSRFResult{}, errcode.NotImplemented
	}
	if existingToken != "" && s.csrf.Verify(ctx, existingToken) == nil {
		return response.CSRFResult{Token: existingToken}, nil
	}
	token, err := s.csrf.Issue(ctx)
	if err != nil {
		return response.CSRFResult{}, err
	}
	return response.CSRFResult{Token: token}, nil
}

// Authenticate 每次从 SQL 读取当前角色和邮箱状态，不信任客户端传来的角色。
func (s *AuthService) Authenticate(ctx context.Context, raw string) (authiface.Principal, error) {
	if s.DB == nil {
		return authiface.Principal{}, errcode.NotImplemented
	}
	if s.tokens == nil {
		return authiface.Principal{}, errcode.DependencyUnavailable
	}
	claims, err := s.tokens.Verify(ctx, raw, authiface.AccessToken)
	if err != nil {
		return authiface.Principal{}, err
	}
	user, err := s.currentUser(ctx, claims)
	if err != nil {
		return authiface.Principal{}, err
	}
	return authiface.Principal{UserID: publicAccount(user).ID, Role: user.Role, MailVerified: user.MailVerified, TokenVersion: user.TokenVersion}, nil
}

func (s *AuthService) VerifyCSRF(ctx context.Context, token string) error {
	if s.csrf == nil {
		return errcode.NotImplemented
	}
	return s.csrf.Verify(ctx, token)
}

func (s *AuthService) currentUser(ctx context.Context, claims authiface.TokenClaims) (entity.User, error) {
	userID, err := parseUserID(claims.Subject)
	if err != nil || claims.TokenVersion == 0 {
		return entity.User{}, errcode.InvalidToken
	}
	if s.frozen == nil {
		return entity.User{}, errcode.DependencyUnavailable
	}
	if err := s.frozen.Check(ctx, claims.Subject); err != nil {
		return entity.User{}, err
	}
	var user entity.User
	if err := s.DB.WithContext(ctx).First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return entity.User{}, errcode.InvalidToken
		}
		return entity.User{}, errcode.DatabaseError
	}
	if user.TokenVersion != claims.TokenVersion {
		return entity.User{}, errcode.TokenRevoked
	}
	return user, nil
}

func tokenExpiresIn(expiresAt time.Time) int64 { return max(0, int64(time.Until(expiresAt).Seconds())) }

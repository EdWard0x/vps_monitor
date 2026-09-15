package initialize

import (
	"vpsmonitor/config"
	frozeiface "vpsmonitor/iface/froze"
	"vpsmonitor/service"
	csrfutil "vpsmonitor/utils/csrf"
	jwtutil "vpsmonitor/utils/jwt"
	mailutil "vpsmonitor/utils/mail"
	passwordutil "vpsmonitor/utils/password"

	"gorm.io/gorm"
)

// BuildServices 统一装配依赖。骨架模式传入 nil DB，绝不在包级 init 建立连接。
func BuildServices(cfg config.Config, db *gorm.DB, cache frozeiface.Cache) service.Group {
	frozen := service.NewFrozeService(db, cache, cfg.Redis.FrozenCacheTTL)
	password := passwordutil.Provider{}
	tokens := jwtutil.New(
		cfg.JWT.AccessSecret, cfg.JWT.RefreshSecret, cfg.JWT.Issuer,
		cfg.JWT.AccessAudience, cfg.JWT.RefreshAudience,
		cfg.JWT.AccessTTL, cfg.JWT.RefreshTTL,
	)
	csrf := csrfutil.New(cfg.HTTP.CSRFSecret, cfg.HTTP.CSRFTokenTTL)
	sender := mailutil.New(cfg.Mail)
	return service.Group{
		Auth: service.NewAuthService(db, tokens, password, csrf, frozen),
		User: service.NewUserService(db, password), Mail: service.NewMailService(db, sender, password),
		PasswordReset: service.NewPasswordResetService(db, sender, password),
		Froze:         frozen, Merchant: service.NewMerchantService(db),
		VPS:       service.NewVPSService(db),
		Stock:     service.NewStockService(db),
		Settings:  service.NewSettingsService(db),
		Dashboard: service.NewDashboardService(db),
	}
}

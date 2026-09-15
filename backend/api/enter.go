package api

import "vpsmonitor/service"

type Group struct {
	AuthApi          AuthApi
	PasswordResetApi PasswordResetApi
	UserApi          UserApi
	MailApi          MailApi
	FrozeApi         FrozeApi
	MerchantApi      MerchantApi
	VPSApi           VPSApi
	StockApi         StockApi
	SettingsApi      SettingsApi
	DashboardApi     DashboardApi
}

func NewGroup(s service.Group, csrfCookie, refreshCookie CookieOptions) Group {
	return Group{
		AuthApi:          AuthApi{Service: s.Auth, CSRFCookie: csrfCookie, RefreshCookie: refreshCookie},
		PasswordResetApi: PasswordResetApi{s.PasswordReset},
		UserApi:          UserApi{s.User},
		MailApi:          MailApi{s.Mail},
		FrozeApi:         FrozeApi{s.Froze},
		MerchantApi:      MerchantApi{s.Merchant},
		VPSApi:           VPSApi{s.VPS},
		StockApi:         StockApi{s.Stock},
		SettingsApi:      SettingsApi{s.Settings},
		DashboardApi:     DashboardApi{s.Dashboard},
	}
}

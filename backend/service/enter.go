package service

type Group struct {
	Auth          *AuthService
	User          *UserService
	Mail          *MailService
	PasswordReset *PasswordResetService
	Froze         *FrozeService
	Merchant      *MerchantService
	VPS           *VPSService
	Stock         *StockService
	Settings      *SettingsService
	Dashboard     *DashboardService
}

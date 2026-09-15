package request

type SettingsUpdate struct {
	SiteName            *string `json:"site_name"`
	RegistrationEnabled *bool   `json:"registration_enabled"`
	CollectionEnabled   *bool   `json:"collection_enabled"`
}

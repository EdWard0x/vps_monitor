package flag

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"

	"gorm.io/gorm"
	"vpsmonitor/config"
	"vpsmonitor/initialize"
	"vpsmonitor/model/entity"
	"vpsmonitor/model/errcode"
	"vpsmonitor/model/request"
	"vpsmonitor/service"
	passwordutil "vpsmonitor/utils/password"
)

type AdminCommand struct {
	Action   string
	Username string
	Nickname string
}

// RunAdmin 显式创建普通候选账号，候选账号通过邮箱验证后才能提升角色。
// 密码仅从 ADMIN_PASSWORD 读取，不写入命令参数、日志或种子数据。
func RunAdmin(ctx context.Context, command AdminCommand) error {
	if command.Action != "create" && command.Action != "promote" {
		return fmt.Errorf("action must be create or promote")
	}
	username := strings.ToLower(strings.TrimSpace(command.Username))
	if username == "" {
		return fmt.Errorf("username is required")
	}
	if command.Action == "create" && passwordutil.Validate(os.Getenv("ADMIN_PASSWORD")) != nil {
		return fmt.Errorf("ADMIN_PASSWORD must contain 8 to 72 UTF-8 bytes")
	}
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if cfg.Database.URL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	db, raw, err := initialize.OpenDatabase(cfg.Database)
	if err != nil {
		return err
	}
	defer raw.Close()
	if command.Action == "create" {
		nickname := strings.TrimSpace(command.Nickname)
		if nickname == "" {
			nickname = username
		}
		auth := service.NewAuthService(db, nil, passwordutil.Provider{}, nil, nil)
		_, err := auth.CreateCandidate(ctx, request.Register{Username: username, Nickname: nickname, Password: os.Getenv("ADMIN_PASSWORD")})
		return err
	}
	var user entity.User
	if err := db.WithContext(ctx).Where("username = ?", username).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errcode.ResourceNotFound
		}
		return errcode.DatabaseError
	}
	_, err = service.NewUserService(db, nil).ChangeRole(ctx, request.ChangeRole{ID: strconv.FormatUint(uint64(user.ID), 10), Role: "admin"})
	return err
}

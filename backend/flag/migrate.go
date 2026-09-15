package flag

import (
	"context"
	"fmt"
	"strings"

	"vpsmonitor/service"
)

type MigrateCommand struct {
	Direction string
	Directory string
}
type MigrateResult struct {
	Direction string                    `json:"direction"`
	Changed   []service.MigrationStatus `json:"changed,omitempty"`
	Status    []service.MigrationStatus `json:"status,omitempty"`
}

func RunMigrate(ctx context.Context, migrations *service.MigrationService, command MigrateCommand) (MigrateResult, error) {
	direction := strings.ToLower(strings.TrimSpace(command.Direction))
	if strings.TrimSpace(command.Directory) == "" {
		return MigrateResult{}, fmt.Errorf("migration directory is required")
	}
	switch direction {
	case "up":
		changed, err := migrations.Up(ctx, command.Directory)
		return MigrateResult{Direction: direction, Changed: changed}, err
	case "down":
		changed, err := migrations.Down(ctx, command.Directory)
		result := MigrateResult{Direction: direction}
		if changed != nil {
			result.Changed = []service.MigrationStatus{*changed}
		}
		return result, err
	case "status":
		status, err := migrations.Status(ctx, command.Directory)
		return MigrateResult{Direction: direction, Status: status}, err
	default:
		return MigrateResult{}, fmt.Errorf("direction must be up, down, or status")
	}
}

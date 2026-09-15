package main

import (
	"context"
	"encoding/json"
	stdflag "flag"
	"fmt"
	"os"
	"strings"

	"vpsmonitor/config"
	appflag "vpsmonitor/flag"
	"vpsmonitor/initialize"
	"vpsmonitor/service"
)

func main() {
	command, err := parseCommand(os.Args[1:])
	if err != nil {
		exitError(err)
	}
	cfg, err := config.Load()
	if err != nil {
		exitError(err)
	}
	if strings.TrimSpace(cfg.Database.URL) == "" {
		exitError(fmt.Errorf("DATABASE_URL is required"))
	}
	_, rawDB, err := initialize.OpenDatabase(cfg.Database)
	if err != nil {
		exitError(fmt.Errorf("connect database: %w", err))
	}
	defer rawDB.Close()
	result, err := appflag.RunMigrate(context.Background(), service.NewMigrationService(rawDB), command)
	if err != nil {
		exitError(err)
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		exitError(err)
	}
}

func parseCommand(arguments []string) (appflag.MigrateCommand, error) {
	set := stdflag.NewFlagSet("migrate", stdflag.ContinueOnError)
	set.SetOutput(os.Stderr)
	directory := set.String("dir", "migrations", "migration SQL directory")
	directionFlag := set.String("direction", "", "up, down, or status (legacy form)")
	direction := ""
	if len(arguments) > 0 && !strings.HasPrefix(arguments[0], "-") {
		direction = arguments[0]
		arguments = arguments[1:]
	}
	if err := set.Parse(arguments); err != nil {
		return appflag.MigrateCommand{}, err
	}
	if set.NArg() != 0 {
		return appflag.MigrateCommand{}, fmt.Errorf("unexpected arguments: %s", strings.Join(set.Args(), " "))
	}
	if direction == "" {
		direction = *directionFlag
	}
	return appflag.MigrateCommand{Direction: direction, Directory: *directory}, nil
}

func exitError(err error) { fmt.Fprintln(os.Stderr, "migrate:", err); os.Exit(1) }

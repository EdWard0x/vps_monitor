package service

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadMigrationFilesSortsAndRequiresPairs(t *testing.T) {
	directory := t.TempDir()
	writeMigrationTestFile(t, directory, "010_second.up.sql", "SELECT 2;")
	writeMigrationTestFile(t, directory, "010_second.down.sql", "SELECT -2;")
	writeMigrationTestFile(t, directory, "002_first.up.sql", "SELECT 1;")
	writeMigrationTestFile(t, directory, "002_first.down.sql", "SELECT -1;")
	files, err := loadMigrationFiles(directory)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 2 || files[0].Version != 2 || files[1].Version != 10 {
		t.Fatalf("unexpected order: %#v", files)
	}
	if len(files[0].Checksum) != 64 {
		t.Fatalf("unexpected checksum %q", files[0].Checksum)
	}
	os.Remove(filepath.Join(directory, "010_second.down.sql"))
	if _, err := loadMigrationFiles(directory); err == nil {
		t.Fatal("missing down file must fail")
	}
}

func TestInitialMigrationMatchesCurrentScope(t *testing.T) {
	files, err := loadMigrationFiles(filepath.Join("..", "migrations"))
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 3 || files[0].Version != 1 || files[0].Name != "initial" {
		t.Fatalf("unexpected migrations: %#v", files)
	}
	lower := strings.ToLower(files[0].UpSQL)
	for _, required := range []string{"create table users", "create table fronze", "create table merchant", "create table vps_detail", "create table vps_stocks", "create table site_settings", "create table user_mail_verifications", "create table password_reset_requests", "token_version"} {
		if !strings.Contains(lower, required) {
			t.Errorf("missing %q", required)
		}
	}
	for _, removed := range []string{"user_sessions", "comments", "vps_monitor_configs", "collector_code", "refresh_jti"} {
		if strings.Contains(lower, removed) {
			t.Errorf("removed schema remains: %q", removed)
		}
	}
	for index, statement := range migrationSplitPattern.Split(strings.ReplaceAll(files[0].UpSQL, "\r\n", "\n"), -1) {
		if statement = strings.TrimSpace(statement); statement != "" && strings.Count(statement, ";") != 1 {
			t.Errorf("up statement %d must contain exactly one command terminator", index+1)
		}
	}
}

func TestValidateMigrationHistoryRejectsGapsAndChanges(t *testing.T) {
	files := []migrationFile{{Version: 1, Name: "one", Checksum: "a"}, {Version: 2, Name: "two", Checksum: "b"}}
	if err := validateMigrationHistory(files, map[int64]appliedMigration{2: {Name: "two", Checksum: "b"}}); err == nil {
		t.Fatal("non-contiguous history must fail")
	}
	if err := validateMigrationHistory(files, map[int64]appliedMigration{1: {Name: "one", Checksum: "changed"}}); err == nil {
		t.Fatal("checksum change must fail")
	}
}

func writeMigrationTestFile(t *testing.T, directory, name, contents string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(directory, name), []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
}

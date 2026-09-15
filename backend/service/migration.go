package service

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const migrationLockID int64 = 867530912473

var (
	migrationFilePattern  = regexp.MustCompile(`^([0-9]+)_([a-z0-9][a-z0-9_-]*)\.(up|down)\.sql$`)
	migrationSplitPattern = regexp.MustCompile(`(?m)^\s*-- migrate:split\s*$`)
)

type MigrationStatus struct {
	Version       int64      `json:"version"`
	Name          string     `json:"name"`
	Applied       bool       `json:"applied"`
	AppliedAt     *time.Time `json:"applied_at,omitempty"`
	ChecksumValid *bool      `json:"checksum_valid,omitempty"`
}

type migrationFile struct {
	Version  int64
	Name     string
	UpSQL    string
	DownSQL  string
	Checksum string
}

type appliedMigration struct {
	Name      string
	Checksum  string
	AppliedAt time.Time
}

type MigrationService struct{ DB *sql.DB }

func NewMigrationService(db *sql.DB) *MigrationService { return &MigrationService{DB: db} }

// Up 在同一事务和 PostgreSQL advisory lock 下按版本升序应用所有待执行迁移。
func (s *MigrationService) Up(ctx context.Context, directory string) ([]MigrationStatus, error) {
	files, err := loadMigrationFiles(directory)
	if err != nil {
		return nil, err
	}
	var result []MigrationStatus
	err = s.withLockedTransaction(ctx, func(tx *sql.Tx) error {
		applied, err := loadAppliedMigrations(ctx, tx)
		if err != nil {
			return err
		}
		if err := validateMigrationHistory(files, applied); err != nil {
			return err
		}
		for _, file := range files {
			if _, ok := applied[file.Version]; ok {
				continue
			}
			if err := executeMigrationSQL(ctx, tx, file.UpSQL); err != nil {
				return fmt.Errorf("apply migration %03d_%s: %w", file.Version, file.Name, err)
			}
			var appliedAt time.Time
			if err := tx.QueryRowContext(ctx, `INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3) RETURNING applied_at`, file.Version, file.Name, file.Checksum).Scan(&appliedAt); err != nil {
				return fmt.Errorf("record migration %03d_%s: %w", file.Version, file.Name, err)
			}
			valid := true
			result = append(result, MigrationStatus{Version: file.Version, Name: file.Name, Applied: true, AppliedAt: &appliedAt, ChecksumValid: &valid})
		}
		return nil
	})
	return result, err
}

// Down 回滚最近一个已应用版本；没有已应用迁移时返回 nil。
func (s *MigrationService) Down(ctx context.Context, directory string) (*MigrationStatus, error) {
	files, err := loadMigrationFiles(directory)
	if err != nil {
		return nil, err
	}
	byVersion := make(map[int64]migrationFile, len(files))
	for _, file := range files {
		byVersion[file.Version] = file
	}
	var result *MigrationStatus
	err = s.withLockedTransaction(ctx, func(tx *sql.Tx) error {
		applied, err := loadAppliedMigrations(ctx, tx)
		if err != nil {
			return err
		}
		if len(applied) == 0 {
			return nil
		}
		versions := make([]int64, 0, len(applied))
		for version := range applied {
			versions = append(versions, version)
		}
		sort.Slice(versions, func(i, j int) bool { return versions[i] > versions[j] })
		version := versions[0]
		file, ok := byVersion[version]
		if !ok {
			return fmt.Errorf("applied migration version %d has no local SQL files", version)
		}
		record := applied[version]
		if record.Name != file.Name || record.Checksum != file.Checksum {
			return fmt.Errorf("applied migration %03d_%s differs from local files", version, record.Name)
		}
		if err := executeMigrationSQL(ctx, tx, file.DownSQL); err != nil {
			return fmt.Errorf("revert migration %03d_%s: %w", file.Version, file.Name, err)
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM schema_migrations WHERE version = $1`, version); err != nil {
			return fmt.Errorf("remove migration record %d: %w", version, err)
		}
		valid := true
		result = &MigrationStatus{Version: version, Name: file.Name, Applied: false, ChecksumValid: &valid}
		return nil
	})
	return result, err
}

// Status 对比本地迁移与数据库记录，并报告校验和是否一致。
func (s *MigrationService) Status(ctx context.Context, directory string) ([]MigrationStatus, error) {
	files, err := loadMigrationFiles(directory)
	if err != nil {
		return nil, err
	}
	var result []MigrationStatus
	err = s.withLockedTransaction(ctx, func(tx *sql.Tx) error {
		applied, err := loadAppliedMigrations(ctx, tx)
		if err != nil {
			return err
		}
		if err := validateMigrationHistory(files, applied); err != nil {
			return err
		}
		for _, file := range files {
			status := MigrationStatus{Version: file.Version, Name: file.Name}
			if record, ok := applied[file.Version]; ok {
				valid := record.Name == file.Name && record.Checksum == file.Checksum
				status.Applied = true
				status.AppliedAt = &record.AppliedAt
				status.ChecksumValid = &valid
			}
			result = append(result, status)
		}
		return nil
	})
	return result, err
}

func (s *MigrationService) withLockedTransaction(ctx context.Context, operation func(*sql.Tx) error) error {
	if s == nil || s.DB == nil {
		return errors.New("migration database is not configured")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin migration transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock($1)`, migrationLockID); err != nil {
		return fmt.Errorf("acquire migration lock: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
        version bigint PRIMARY KEY,
        name text NOT NULL,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
    )`); err != nil {
		return fmt.Errorf("initialize migration metadata: %w", err)
	}
	if err := operation(tx); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit migration transaction: %w", err)
	}
	return nil
}

func loadAppliedMigrations(ctx context.Context, tx *sql.Tx) (map[int64]appliedMigration, error) {
	rows, err := tx.QueryContext(ctx, `SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version`)
	if err != nil {
		return nil, fmt.Errorf("read migration history: %w", err)
	}
	defer rows.Close()
	result := map[int64]appliedMigration{}
	for rows.Next() {
		var version int64
		var record appliedMigration
		if err := rows.Scan(&version, &record.Name, &record.Checksum, &record.AppliedAt); err != nil {
			return nil, fmt.Errorf("scan migration history: %w", err)
		}
		result[version] = record
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate migration history: %w", err)
	}
	return result, nil
}

func validateMigrationHistory(files []migrationFile, applied map[int64]appliedMigration) error {
	local := make(map[int64]migrationFile, len(files))
	for _, file := range files {
		local[file.Version] = file
	}
	for version, record := range applied {
		file, ok := local[version]
		if !ok {
			return fmt.Errorf("applied migration version %d has no local SQL files", version)
		}
		if record.Name != file.Name || record.Checksum != file.Checksum {
			return fmt.Errorf("applied migration %03d_%s differs from local files", version, record.Name)
		}
	}
	seenPending := false
	for _, file := range files {
		_, ok := applied[file.Version]
		if !ok {
			seenPending = true
			continue
		}
		if seenPending {
			return fmt.Errorf("migration history is not contiguous before version %d", file.Version)
		}
	}
	return nil
}

func loadMigrationFiles(directory string) ([]migrationFile, error) {
	entries, err := os.ReadDir(directory)
	if err != nil {
		return nil, fmt.Errorf("read migration directory %q: %w", directory, err)
	}
	type pair struct{ name, upPath, downPath string }
	pairs := map[int64]pair{}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		matches := migrationFilePattern.FindStringSubmatch(entry.Name())
		if matches == nil {
			continue
		}
		version, err := strconv.ParseInt(matches[1], 10, 64)
		if err != nil || version <= 0 {
			return nil, fmt.Errorf("invalid migration version in %q", entry.Name())
		}
		current := pairs[version]
		if current.name != "" && current.name != matches[2] {
			return nil, fmt.Errorf("migration version %d uses multiple names", version)
		}
		current.name = matches[2]
		path := filepath.Join(directory, entry.Name())
		if matches[3] == "up" {
			if current.upPath != "" {
				return nil, fmt.Errorf("duplicate up migration for version %d", version)
			}
			current.upPath = path
		} else {
			if current.downPath != "" {
				return nil, fmt.Errorf("duplicate down migration for version %d", version)
			}
			current.downPath = path
		}
		pairs[version] = current
	}
	if len(pairs) == 0 {
		return nil, fmt.Errorf("no migration SQL files found in %q", directory)
	}
	versions := make([]int64, 0, len(pairs))
	for version := range pairs {
		versions = append(versions, version)
	}
	sort.Slice(versions, func(i, j int) bool { return versions[i] < versions[j] })
	files := make([]migrationFile, 0, len(versions))
	for _, version := range versions {
		pair := pairs[version]
		if pair.upPath == "" || pair.downPath == "" {
			return nil, fmt.Errorf("migration %03d_%s must have both up and down files", version, pair.name)
		}
		up, err := os.ReadFile(pair.upPath)
		if err != nil {
			return nil, fmt.Errorf("read %q: %w", pair.upPath, err)
		}
		down, err := os.ReadFile(pair.downPath)
		if err != nil {
			return nil, fmt.Errorf("read %q: %w", pair.downPath, err)
		}
		digest := sha256.Sum256(append(append([]byte{}, up...), append([]byte{0}, down...)...))
		files = append(files, migrationFile{Version: version, Name: pair.name, UpSQL: string(up), DownSQL: string(down), Checksum: hex.EncodeToString(digest[:])})
	}
	return files, nil
}

func executeMigrationSQL(ctx context.Context, tx *sql.Tx, contents string) error {
	statements := migrationSplitPattern.Split(strings.ReplaceAll(contents, "\r\n", "\n"), -1)
	for index, statement := range statements {
		statement = strings.TrimSpace(statement)
		if statement == "" {
			continue
		}
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("statement %d: %w", index+1, err)
		}
	}
	return nil
}

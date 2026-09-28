package service

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

// Uses only an explicitly configured test database and a unique, disposable schema.
func TestMigrationLifecyclePreservesData(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to test real PostgreSQL migration transactions")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	admin := stdlib.OpenDB(*cfg)
	t.Cleanup(func() { _ = admin.Close() })
	schema := pgx.Identifier{"migration_test_" + uuid.NewString()}.Sanitize()
	if _, err := admin.ExecContext(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		if _, err := admin.ExecContext(cleanupCtx, "DROP SCHEMA "+schema+" CASCADE"); err != nil {
			t.Errorf("remove test schema: %v", err)
		}
	})
	cfg.RuntimeParams["search_path"] = schema
	db := stdlib.OpenDB(*cfg)
	t.Cleanup(func() { _ = db.Close() })
	migrations := NewMigrationService(db)
	directory := t.TempDir()
	files, err := loadMigrationFiles("../migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range files {
		// Preserve exact bytes: both directions participate in the history checksum.
		for _, suffix := range []string{"up", "down"} {
			name := filepath.Base(migrationPath(file, suffix))
			contents, err := os.ReadFile(filepath.Join("../migrations", name))
			if err != nil {
				t.Fatal(err)
			}
			writeMigrationTestFile(t, directory, name, string(contents))
		}
	}
	if applied, err := migrations.Up(ctx, directory); err != nil || len(applied) != len(files) {
		t.Fatalf("fresh database: applied=%v err=%v", applied, err)
	}
	if applied, err := migrations.Up(ctx, directory); err != nil || len(applied) != 0 {
		t.Fatalf("repeat up must be a no-op: applied=%v err=%v", applied, err)
	}

	// Representative data in every business table, including FK links and stock status 4.
	for _, statement := range []string{
		`INSERT INTO users (username, nickname, password_hash, notice_enabled, server_turbo_key) VALUES ('migration-user', 'Original name', 'password-hash', true, 'test-key')`,
		`INSERT INTO fronze (user_id) SELECT id FROM users`,
		`INSERT INTO merchant (code, name, website_url) VALUES ('test', 'Merchant', 'https://example.test')`,
		`INSERT INTO vps_detail (merchant_id, code, name, cpu_cores, memory_mb, disk_gb, disk_type, price_amount, currency, billing_period, purchase_url, has_stock) SELECT id, 'plan', 'Plan', 1, 1024, 20, 'ssd', 4.125, 'USD', 'monthly', 'https://example.test/buy', true FROM merchant`,
		`INSERT INTO vps_stocks (vps_id, status, quantity, delivery_id, last_checked_at, last_in_stock_at) SELECT id, 4, NULL, '100-1', now(), now() FROM vps_detail`,
		`INSERT INTO notices (user_id, vps_id, merchant_id, send_notice_times, send_at) SELECT u.id, v.id, v.merchant_id, 2, now() FROM users u CROSS JOIN vps_detail v`,
		`INSERT INTO user_mail_verifications (user_id, mail, code_hash, expires_at) SELECT id, 'reader@example.test', 'mail-hash', now() + interval '10 minutes' FROM users`,
		`INSERT INTO password_reset_requests (user_id, code_hash, expires_at) SELECT id, 'reset-hash', now() + interval '10 minutes' FROM users`,
	} {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	before := migrationDataSnapshot(t, ctx, db)
	nextVersion := files[len(files)-1].Version + 1
	upName := migrationPath(migrationFile{Version: nextVersion, Name: "preserve_data_test"}, "up")
	downName := migrationPath(migrationFile{Version: nextVersion, Name: "preserve_data_test"}, "down")
	upgrade := `ALTER TABLE users ADD COLUMN migration_test_label text;
-- migrate:split
UPDATE users SET migration_test_label = nickname;
-- migrate:split
ALTER TABLE users ALTER COLUMN migration_test_label SET NOT NULL;`
	writeMigrationTestFile(t, directory, upName, upgrade)
	writeMigrationTestFile(t, directory, downName, "ALTER TABLE users DROP COLUMN migration_test_label;")
	if applied, err := migrations.Up(ctx, directory); err != nil || len(applied) != 1 || applied[0].Version != nextVersion {
		t.Fatalf("incremental upgrade: applied=%v err=%v", applied, err)
	}
	var label string
	if err := db.QueryRowContext(ctx, "SELECT migration_test_label FROM users").Scan(&label); err != nil || label != "Original name" {
		t.Fatalf("backfill: label=%q err=%v", label, err)
	}
	assertData := func() {
		t.Helper()
		if after := migrationDataSnapshot(t, ctx, db); !reflect.DeepEqual(before, after) {
			t.Fatalf("existing data changed: before=%v after=%v", before, after)
		}
	}
	assertData()
	if applied, err := migrations.Up(ctx, directory); err != nil || len(applied) != 0 {
		t.Fatalf("repeat upgrade: applied=%v err=%v", applied, err)
	}
	assertData()

	// Changing published SQL must fail before any new SQL is run.
	writeMigrationTestFile(t, directory, upName, upgrade+"\n-- changed")
	if _, err := migrations.Up(ctx, directory); err == nil {
		t.Fatal("modified applied migration must be rejected")
	}
	writeMigrationTestFile(t, directory, upName, upgrade)
	assertData()

	// A successful pending file followed by a failing file rolls back the whole batch.
	staged := migrationFile{Version: nextVersion + 1, Name: "transaction_test"}
	failed := migrationFile{Version: nextVersion + 2, Name: "failure_test"}
	writeMigrationTestFile(t, directory, migrationPath(staged, "up"), "ALTER TABLE users ADD COLUMN should_rollback text;\n-- migrate:split\nUPDATE users SET nickname = 'must not persist';")
	writeMigrationTestFile(t, directory, migrationPath(staged, "down"), "ALTER TABLE users DROP COLUMN should_rollback;")
	writeMigrationTestFile(t, directory, migrationPath(failed, "up"), "SELECT 1 / 0;")
	writeMigrationTestFile(t, directory, migrationPath(failed, "down"), "SELECT 1;")
	if _, err := migrations.Up(ctx, directory); err == nil {
		t.Fatal("failing migration must abort")
	}
	assertData()
	var count int
	if err := db.QueryRowContext(ctx, "SELECT count(*) FROM schema_migrations").Scan(&count); err != nil || count != len(files)+1 {
		t.Fatalf("failed transaction changed history: count=%d err=%v", count, err)
	}
	if err := db.QueryRowContext(ctx, "SELECT count(*) FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'should_rollback'").Scan(&count); err != nil || count != 0 {
		t.Fatalf("failed transaction left a column: count=%d err=%v", count, err)
	}
	status, err := migrations.Status(ctx, directory)
	if err != nil || len(status) != len(files)+3 || status[len(status)-1].Applied || status[len(status)-2].Applied {
		t.Fatalf("unexpected status after rollback: status=%v err=%v", status, err)
	}
	if reverted, err := migrations.Down(ctx, directory); err != nil || reverted == nil || reverted.Version != nextVersion {
		t.Fatalf("test-only column rollback: reverted=%v err=%v", reverted, err)
	}
	assertData()
}

func migrationPath(file migrationFile, direction string) string {
	return fmt.Sprintf("%03d_%s.%s.sql", file.Version, file.Name, direction)
}

func migrationDataSnapshot(t *testing.T, ctx context.Context, db *sql.DB) map[string]string {
	t.Helper()
	result := map[string]string{}
	for _, table := range []string{"users", "fronze", "merchant", "vps_detail", "vps_stocks", "site_settings", "notices", "user_mail_verifications", "password_reset_requests"} {
		var rows string
		// Ignore only the synthetic new field; compare every original column and row.
		query := "SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'migration_test_label' ORDER BY id), '[]'::jsonb)::text FROM " + pgx.Identifier{table}.Sanitize() + " t"
		if err := db.QueryRowContext(ctx, query).Scan(&rows); err != nil {
			t.Fatal(err)
		}
		result[table] = rows
	}
	return result
}

package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"vpsmonitor/internal/infrastructure/database"
)

// main 执行建表或回退 SQL。它直接读取进程中的 DATABASE_URL，不加载 .env。
// down 会删除初始化脚本建立的表；学习时先阅读 SQL，不要在已有数据上试跑。
func main() {
	// 本地开发可使用 .env；容器和生产环境通常直接注入环境变量。
	//_ = godotenv.Load(".env")
	if len(os.Args) < 2 || (os.Args[1] != "up" && os.Args[1] != "down") {
		fmt.Fprintln(os.Stderr, "usage: migrate up|down [--file path]")
		os.Exit(2)
	}
	direction := os.Args[1]
	fs := flag.NewFlagSet(direction, flag.ExitOnError)
	file := fs.String("file", "", "SQL migration path")
	_ = fs.Parse(os.Args[2:])
	if *file == "" {
		*file = locate(filepath.Join("..", "docs", "sql", "postgres", "001_init."+direction+".sql"))
	}
	b, e := os.ReadFile(*file)
	if e != nil {
		fmt.Println("reading migration file failed")
		fatal(e)
	}
	migrationSQL := strings.TrimSpace(string(b))
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		fatal(fmt.Errorf("DATABASE_URL is required"))
	}
	db, e := database.Open(context.Background(), dsn, 5, 2)
	if e != nil {
		fatal(e)
	}
	if direction == "up" {
		var table sql.NullString
		if e = db.Raw("SELECT to_regclass('public.schema_migrations')").Scan(&table).Error; e != nil {
			fatal(e)
		}
		if table.Valid {
			var count int64
			if e = db.Raw("SELECT count(*) FROM schema_migrations WHERE version = ?", 1).Scan(&count).Error; e != nil {
				fatal(e)
			}
			if count > 0 {
				fmt.Println("migration 001 already applied")
				return
			}
			fatal(fmt.Errorf("schema_migrations exists but version 1 is missing; manual inspection required"))
		}
	}
	if e = db.Exec(migrationSQL).Error; e != nil {
		fatal(e)
	}
	fmt.Printf("migration 001 %s complete\n", direction)
}
func locate(p string) string {
	if _, e := os.Stat(p); e == nil {
		return p
	}
	alt := filepath.Join("docs", "sql", "postgres", filepath.Base(p))
	return alt
}
func fatal(e error) { fmt.Fprintln(os.Stderr, "error:", e); os.Exit(1) }

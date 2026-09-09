package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"vpsmonitor/internal/infrastructure/database"
)

// main 给空的演示数据库填入固定样例；它直接读取环境变量，不加载 .env。
// 种子里的用户不可登录，实际账户需通过注册接口或 cmd/admin 创建。
func main() {
	allow := flag.Bool("allow-demo", false, "confirm seeding an empty disposable database")
	file := flag.String("file", "", "seed SQL path")
	flag.Parse()
	if !*allow {
		fatal(fmt.Errorf("--allow-demo is required"))
	}
	if *file == "" {
		*file = locate(filepath.Join("..", "docs", "sql", "postgres", "demo_seed.sql"))
	}
	b, e := os.ReadFile(*file)
	if e != nil {
		fatal(e)
	}
	raw := string(b)
	start := strings.Index(raw, "BEGIN;")
	if start < 0 {
		fatal(fmt.Errorf("seed transaction not found"))
	}
	if os.Getenv("DEMO_MODE") != "true" {
		fatal(fmt.Errorf("DEMO_MODE=true is required"))
	}
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		fatal(fmt.Errorf("DATABASE_URL is required"))
	}
	db, e := database.Open(context.Background(), dsn, 5, 2)
	if e != nil {
		fatal(e)
	}
	if e = db.Exec(raw[start:]).Error; e != nil {
		fatal(e)
	}
	fmt.Println("demo seed complete")
}
func locate(p string) string {
	if _, e := os.Stat(p); e == nil {
		return p
	}
	return filepath.Join("docs", "sql", "postgres", filepath.Base(p))
}
func fatal(e error) { fmt.Fprintln(os.Stderr, "error:", e); os.Exit(1) }

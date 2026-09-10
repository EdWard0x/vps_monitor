package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"vpsmonitor/internal/bootstrap"
	"vpsmonitor/internal/platform/config"

	"golang.org/x/term"
)

var stdinReader = bufio.NewReader(os.Stdin)

// main 展示 HTTP 之外的调用入口：命令行读取参数后复用 Service.CreateAdmin。
// 密码交互输入，避免把密码写进命令参数和命令历史。
func main() {
	if len(os.Args) < 2 || os.Args[1] != "create" {
		fmt.Fprintln(os.Stderr, "usage: admin create --username NAME --nickname DISPLAY_NAME")
		os.Exit(2)
	}
	fs := flag.NewFlagSet("create", flag.ExitOnError)
	username := fs.String("username", "", "login username")
	nickname := fs.String("nickname", "", "display nickname")
	_ = fs.Parse(os.Args[2:])
	if *username == "" || *nickname == "" {
		fmt.Fprintln(os.Stderr, "username and nickname are required")
		os.Exit(2)
	}
	p1, e := readPassword("Password: ")
	if e != nil {
		fatal(e)
	}
	p2, e := readPassword("Repeat password: ")
	if e != nil {
		fatal(e)
	}
	if p1 != p2 {
		fatal(fmt.Errorf("passwords do not match"))
	}
	c, e := config.Load()
	if e != nil {
		fatal(e)
	}
	svc, e := bootstrap.Build(context.Background(), c)
	if e != nil {
		fatal(e)
	}
	u, e := svc.CreateAdmin(context.Background(), *username, *nickname, p1)
	if e != nil {
		fatal(e)
	}
	fmt.Printf("created administrator %s (id=%d)\n", u.Username, u.ID)
}
func readPassword(prompt string) (string, error) {
	fmt.Fprint(os.Stderr, prompt)
	if term.IsTerminal(int(os.Stdin.Fd())) {
		b, e := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(os.Stderr)
		return string(b), e
	}
	s, e := stdinReader.ReadString('\n')
	return strings.TrimRight(s, "\r\n"), e
}
func fatal(e error) { fmt.Fprintln(os.Stderr, "error:", e); os.Exit(1) }

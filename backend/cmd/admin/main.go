package main

import (
	"context"
	stdflag "flag"
	"fmt"
	"os"
	appflag "vpsmonitor/flag"
)

func main() {
	action := stdflag.String("action", "", "create or promote")
	username := stdflag.String("username", "", "candidate username")
	nickname := stdflag.String("nickname", "", "candidate nickname")
	stdflag.Parse()
	if err := appflag.RunAdmin(context.Background(), appflag.AdminCommand{Action: *action, Username: *username, Nickname: *nickname}); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

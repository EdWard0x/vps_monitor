package main

import (
	"context"
	"fmt"
	"os"
	appflag "vpsmonitor/flag"
)

func main() {
	if err := appflag.RunSeed(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

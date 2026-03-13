package main

import (
	"fmt"
	"os"

	"github.com/synonymdev/bitkit-e2e-tests/tools/seedkit/cmd"
)

func main() {
	if err := cmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

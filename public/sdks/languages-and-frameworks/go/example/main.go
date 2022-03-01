package main

import (
	"fmt"
	"os"

	_ "github.com/envkey/envkeygo/v2"
)

func main() {
	fmt.Println(os.Getenv("TEST_VAR"))
}

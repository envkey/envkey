package main

import (
	"fmt"
	"os"

	_ "github.com/envkey/envkey/public/sdks/languages/go/envkeygo"
)

func main() {
	fmt.Println(os.Getenv("TEST_VAR"))
}

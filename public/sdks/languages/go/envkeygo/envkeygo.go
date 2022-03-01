package envkeygo

import (
	"os"

	"github.com/envkey/envkeygo/loader"
)

func init() {
	shouldCache := os.Getenv("ENVKEY_SHOULD_CACHE") != ""
	loader.Load(shouldCache)
}

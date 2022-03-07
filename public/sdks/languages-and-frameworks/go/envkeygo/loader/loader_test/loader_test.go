package loader_test

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/envkey/envkeygo/v2/loader"
)

const VALID_ENVKEY = "ekunDrefdPeELwPpupdzJpsz-2Hs3HCiscoY1TfGcVdefum"
const INVALID_ENVKEY = "ekunDrefdPeELwPpupdzJpsz-2Hs3HCiscoY1TfGinvalid"

func TestLoadMissing(t *testing.T) {
	os.Clearenv()
	assert.Panics(t, func() { loader.Load(false, true) })
}

func TestLoadValid(t *testing.T) {
	os.Clearenv()
	os.Setenv("ENVKEY", VALID_ENVKEY)
	assert.NotPanics(t, func() { loader.Load(false, true) })
	assert.Equal(t, "it", os.Getenv("TEST"))
	assert.Equal(t, "works!", os.Getenv("TEST_2"))
}

func TestLoadInvalid(t *testing.T) {
	os.Clearenv()
	os.Setenv("ENVKEY", INVALID_ENVKEY)
	assert.Panics(t, func() { loader.Load(false, true) })
}

func TestLoadOverrides(t *testing.T) {
	os.Clearenv()
	os.Setenv("ENVKEY", VALID_ENVKEY)
	os.Setenv("TEST_2", "override")
	assert.NotPanics(t, func() { loader.Load(false, true) })
	assert.Equal(t, "it", os.Getenv("TEST"))
	assert.Equal(t, "override", os.Getenv("TEST_2"))
}

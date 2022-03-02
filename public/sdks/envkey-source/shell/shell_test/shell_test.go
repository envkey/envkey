package shell_test

import (
	"encoding/json"
	"testing"

	"github.com/envkey/envkey/public/sdks/envkey-source/parser"
	"github.com/envkey/envkey/public/sdks/envkey-source/shell"
	"github.com/stretchr/testify/assert"
)

var jsonBytes = []byte(`{"TEST": "it", "TEST_2":"works!", "TEST_INJECTION": "'\"'\"'$(uname)", "TEST_SINGLE_QUOTES": "this'\"'\"' is ok", "TEST_SPACES": "it does work!", "TEST_STRANGE_CHARS": "with quotes ` + "`" + ` '\"'\"' \\\" bäh"}`)

var envMap parser.EnvMap

func TestSource(t *testing.T) {
	json.Unmarshal(jsonBytes, &envMap)

	// Test valid
	validRes, _ := shell.Source(envMap, true, false, false)
	assert.Equal(t, correctValid, validRes)

	// Test --pam
	validRes2, _ := shell.Source(envMap, true, true, false)
	assert.Equal(t, correctPam, validRes2)

	// Test --dot-env
	validRes3, _ := shell.Source(envMap, true, false, true)
	assert.Equal(t, correctDotEnv, validRes3)
}

const correctValid = "export 'TEST'='it' 'TEST_2'='works!' 'TEST_INJECTION'=''\"'\"'\"'\"'\"'\"'\"'\"'$(uname)' 'TEST_SINGLE_QUOTES'='this'\"'\"'\"'\"'\"'\"'\"'\"' is ok' 'TEST_SPACES'='it does work!' 'TEST_STRANGE_CHARS'='with quotes ` '\"'\"'\"'\"'\"'\"'\"'\"' \\\" bäh' '__ENVKEY_LOADED'='TEST,TEST_2,TEST_INJECTION,TEST_SINGLE_QUOTES,TEST_SPACES,TEST_STRANGE_CHARS'"

const correctPam = "export TEST='it'\nexport TEST_2='works!'\nexport TEST_INJECTION=''\"'\"'$(uname)'\nexport TEST_SINGLE_QUOTES='this'\"'\"' is ok'\nexport TEST_SPACES='it does work!'\nexport TEST_STRANGE_CHARS='with quotes ` '\"'\"' \\\" bäh'"

const correctDotEnv = "TEST='it'\nTEST_2='works!'\nTEST_INJECTION=''\"'\"'\"'\"'\"'\"'\"'\"'$(uname)'\nTEST_SINGLE_QUOTES='this'\"'\"'\"'\"'\"'\"'\"'\"' is ok'\nTEST_SPACES='it does work!'\nTEST_STRANGE_CHARS='with quotes ` '\"'\"'\"'\"'\"'\"'\"'\"' \\\" bäh'\n"

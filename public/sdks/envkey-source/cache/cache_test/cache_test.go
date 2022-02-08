package cache_test

import (
	"io/ioutil"
	"os"
	"path/filepath"
	"testing"

	"github.com/envkey/envkey/public/sdks/envkey-source/cache"

	homedir "github.com/mitchellh/go-homedir"
	"github.com/stretchr/testify/assert"
)

const testPath = "~/.envkey/cache/test"

var testPathExpanded, _ = homedir.Expand(testPath)

func TestNewCache(t *testing.T) {
	var c *cache.Cache
	home, _ := homedir.Dir()

	// with no dir (default to homedir/.envkey/cache)
	c, _ = cache.NewCache("")
	assert.NotNil(t, c.Done, "done channel initialized")
	assert.Equal(t, c.Dir, (home + "/.envkey/cache"), "default dir is homedir/.envkey/cache")

	// with supplied dir
	c, _ = cache.NewCache("/dev/null")
	assert.NotNil(t, c.Done, "done channel initialized")
	assert.Equal(t, c.Dir, "/dev/null", "sets the dir")

	// homedir expansion
	c, _ = cache.NewCache("~/.envkey/cache/test")
	assert.NotNil(t, c.Done, "done channel initialized")
	assert.Equal(t, c.Dir, filepath.Join(home, ".envkey", "cache", "test"), "default dir is correctly expanded")
}

func TestWrite(t *testing.T) {
	c, _ := cache.NewCache(testPath)
	err := c.Write("some-envkey", []byte("test data"))

	assert.Nil(t, err, "Should not return an error.")
	assert.Equal(t, 1, len(c.Done), "Should add to done channel")

	res, err := ioutil.ReadFile(filepath.Join(testPathExpanded, "some-envkey"))
	assert.Equal(t, "test data", string(res), "Should correctly write to the file.")

	go os.Remove(filepath.Join(testPath, "some-envkey"))
}

func TestRead(t *testing.T) {
	writeCache, _ := cache.NewCache(testPath)
	writeCache.Write("some-envkey", []byte("test data"))

	c, _ := cache.NewCache(testPath)
	res, err := c.Read("some-envkey")
	assert.Nil(t, err, "Should not return an error.")
	assert.Equal(t, "test data", string(res), "Should correctly read from the file.")
	assert.Equal(t, 1, len(c.Done), "Should add to done channel")
}

func TestDelete(t *testing.T) {
	var err error

	writeCache, _ := cache.NewCache(testPath)
	writeCache.Write("some-envkey", []byte("test data"))

	c, _ := cache.NewCache(testPath)
	err = c.Delete("some-envkey")

	assert.Nil(t, err, "Should not return an error.")
	assert.Equal(t, 1, len(c.Done), "Should add to done channel")

	_, err = ioutil.ReadFile(filepath.Join(testPath, "some-envkey"))
	assert.NotNil(t, err, "Should have removed the cache file.")

}

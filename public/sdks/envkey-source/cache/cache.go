package cache

import (
	"io/ioutil"
	"os"
	"path/filepath"

	"github.com/mitchellh/go-homedir"
)

type Cache struct {
	Dir  string
	Done chan error
}

func DefaultPath() (string, error) {
	home, err := homedir.Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".envkey", "cache"), nil
}

func NewCache(dir string) (*Cache, error) {
	var withDir string
	var err error

	if dir == "" {
		withDir, err = DefaultPath()
		if err != nil {
			return nil, err
		}

	} else {
		withDir, err = homedir.Expand(dir)
		if err != nil {
			return nil, err
		}
	}
	return &Cache{withDir, make(chan error, 1)}, nil
}

func (cache *Cache) Write(envkeyParam string, body []byte) error {
	var err error

	// ensure dir exists
	err = os.MkdirAll(cache.Dir, 0700)
	if err != nil {
		select {
		case cache.Done <- err:
		default:
		}
		return err
	}

	dir := filepath.Join(cache.Dir, envkeyParam)
	err = ioutil.WriteFile(dir, body, 0600)

	select {
	case cache.Done <- err:
	default:
	}
	return err
}

func (cache *Cache) Read(envkeyParam string) ([]byte, error) {
	path := filepath.Join(cache.Dir, envkeyParam)
	b, err := ioutil.ReadFile(path)
	select {
	case cache.Done <- err:
	default:
	}
	return b, err
}

func (cache *Cache) Delete(envkeyParam string) error {
	path := filepath.Join(cache.Dir, envkeyParam)
	err := os.Remove(path)
	select {
	case cache.Done <- err:
	default:
	}
	return err
}

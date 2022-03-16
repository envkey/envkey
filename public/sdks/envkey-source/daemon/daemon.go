package daemon

import (
	"log"
	"math/rand"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/mitchellh/go-homedir"
	"gopkg.in/natefinch/lumberjack.v2"
)

var mutex sync.Mutex
var shouldCache bool

func InlineStart(shouldCacheArg bool) {
	shouldCache = shouldCacheArg

	home, err := homedir.Dir()
	if err != nil {
		panic(err)
	}

	logDir := filepath.Join(home, ".envkey", "logs")
	err = os.MkdirAll(logDir, os.ModePerm)
	if err != nil {
		panic(err)
	}

	log.SetOutput(&lumberjack.Logger{
		Filename:   filepath.Join(logDir, "envkey-source-daemon.log"),
		MaxSize:    25, // megabytes
		MaxBackups: 3,
		MaxAge:     30, //days
		Compress:   false,
	})

	// seed rand for WS backoff and fetch jitter
	rand.Seed(time.Now().UTC().UnixNano())

	go startTcpServer()
	go startHttpServer()
	go startSuspendedWatcher()

	// stop an interrupt of the client process from killing the daemon
	signal.Ignore(syscall.SIGINT,
		syscall.SIGTERM,
		syscall.SIGQUIT)

	select {}
}

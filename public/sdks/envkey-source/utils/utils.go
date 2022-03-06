package utils

import (
	"log"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/jwalton/go-supportscolor"
	colors "github.com/logrusorgru/aurora/v3"
)

var stderrLogger = log.New(os.Stderr, "", 0)
var stdoutLogger = log.New(os.Stdout, "", 0)

func Fatal(msg string, toStderr bool) {
	log.Println(msg)
	if toStderr {
		stderrLogger.Println(msg)
	} else {
		stdoutLogger.Println("echo 'error: " + msg + "'; false")
	}
	os.Exit(1)
}

func CheckError(err error, toStderr bool) {
	if err != nil {
		Fatal(err.Error(), toStderr)
	}
}

func FormatTerminal(s string, color func(interface{}) colors.Value) string {
	if !terminalSupportsColors() {
		return "envkey | " +
			time.Now().UTC().Format("2006-01-02T15:04:05.0000Z") + s
	}

	colorFn := color
	if colorFn == nil {
		colorFn = colors.Green
	}

	return colors.Sprintf(
		colors.Bold(
			colorFn(
				"🔑 envkey | " +
					time.Now().UTC().Format("2006-01-02T15:04:05.0000Z") + s,
			),
		),
	)
}

func IdPart(envkey string) string {
	return strings.Split(envkey, "-")[0]
}

func CommandExists(cmd string) bool {
	_, err := exec.LookPath(cmd)
	return err == nil
}

func terminalSupportsColors() bool {
	return supportscolor.Stdout().SupportsColor && supportscolor.Stderr().SupportsColor
}

package utils

import (
	"fmt"
	"os"
	"strings"
	"time"

	colors "github.com/logrusorgru/aurora/v3"
)

func Fatal(msg string, toStderr bool) {
	if toStderr {
		fmt.Fprintf(os.Stderr, msg)
	} else {
		fmt.Println("echo 'error: " + msg + "'; false")
	}
	os.Exit(1)
}

func CheckError(err error, toStderr bool) {
	if err != nil {
		Fatal(err.Error(), toStderr)
	}
}

func FormatTerminal(s string, color func(interface{}) colors.Value) string {
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

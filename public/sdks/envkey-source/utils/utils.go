package utils

import (
	"fmt"
	"os"
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

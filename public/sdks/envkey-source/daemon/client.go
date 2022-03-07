package daemon

import (
	"bufio"
	"bytes"
	"encoding/gob"
	"errors"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/google/uuid"
	colors "github.com/logrusorgru/aurora/v3"

	"github.com/envkey/envkey/public/sdks/envkey-source/fetch"
	"github.com/envkey/envkey/public/sdks/envkey-source/parser"
	"github.com/envkey/envkey/public/sdks/envkey-source/utils"
	"github.com/envkey/envkey/public/sdks/envkey-source/version"
)

// client state (foreground process)
var stderrLogger = log.New(os.Stderr, "", 0)
var tcpClientsByEnvkey = map[string]*net.TCPConn{}
var onChangeChannelsByEnvkey = make(map[string](chan struct{}))

func LaunchDetachedIfNeeded(opts DaemonOptions) error {
	alive := IsAlive()

	if alive {
		if opts.VerboseOutput {
			stderrLogger.Println(utils.FormatTerminal(" | envkey-source daemon already running", nil))
		}
	} else {
		if opts.VerboseOutput {
			stderrLogger.Println(utils.FormatTerminal(" | envkey-source daemon not running–starting", nil))
		}

		name := os.Args[0]
		cmdArgs := []string{"--daemon"}

		if opts.VerboseOutput {
			stderrLogger.Println(utils.FormatTerminal(" | executing "+name, nil))
		}

		cmd := exec.Command(name, cmdArgs...)
		err := cmd.Start()

		if err != nil {
			return err
		}

		err = cmd.Process.Release()

		if err != nil {
			return err
		}

		attempt := 0
		alive := false
		for !alive && attempt <= 50 {
			alive = IsAlive()
			attempt += 1
			time.Sleep(20 * time.Millisecond)
		}

		if alive {
			if opts.VerboseOutput {
				stderrLogger.Println(utils.FormatTerminal(" | envkey-source daemon is running", colors.Green))
			}
		} else {
			msg := "envkey-source daemon couldn't be started"
			if opts.VerboseOutput {
				stderrLogger.Println(utils.FormatTerminal(" | "+msg, colors.Red))
			}
			cmd.Process.Kill()
			return errors.New(msg)
		}
	}

	return nil
}

func IsAlive() bool {
	resp, err := http.Get("http://127.0.0.1:19409/alive")
	return err == nil && resp.StatusCode == 200
}

func Stop() {
	http.Get("http://127.0.0.1:19409/stop")
}

func Fetch(envkey, clientNameArg, clientVersionArg string) (string, error) {
	env, _, err := FetchMap(envkey, clientNameArg, clientVersionArg)

	if err != nil {
		return "", err
	}

	return env.ToJson()
}

func FetchMap(envkey, clientNameArg, clientVersionArg string) (parser.EnvMap, parser.EnvMap, error) {
	clientName := clientNameArg
	if clientName == "" {
		clientName = fetch.DefaultClientName
	}

	clientVersion := clientVersionArg
	if clientVersion == "" {
		clientVersion = version.Version
	}

	fetchUrl := fmt.Sprintf("http://127.0.0.1:19409/fetch/%s/%s/%s", envkey, url.QueryEscape(clientName),
		url.QueryEscape(clientVersion))

	resp, err := http.Get(fetchUrl)

	if err != nil {
		return nil, nil, err
	}

	if resp.StatusCode == 404 || resp.StatusCode == 401 {
		return nil, nil, errors.New("ENVKEY invalid")
	} else if resp.StatusCode != 200 {
		return nil, nil, errors.New("error loading ENVKEY")
	}

	body, err := ioutil.ReadAll(resp.Body)

	if err != nil {
		return nil, nil, err
	}

	var daemonResp DaemonResponse

	buf := bytes.NewBuffer(body)
	dec := gob.NewDecoder(buf)

	if err := dec.Decode(&daemonResp); err != nil {
		return nil, nil, err
	}

	return daemonResp.CurrentEnv, daemonResp.PreviousEnv, nil
}

func ListenChange(props ListenChangeProps) {
	envkey := props.Envkey

	RemoveListener(envkey)

	connIdBytes, err := uuid.NewRandom()
	if err != nil {
		props.OnDaemonConnectFailed(err)
		return
	}

	connId := connIdBytes.String()
	composite := strings.Join([]string{envkey, connId}, "|")

	tcpAddr, err := net.ResolveTCPAddr("tcp", "127.0.0.1:19410")
	if err != nil {
		props.OnDaemonConnectFailed(err)
	}
	client, err := net.DialTCP("tcp", nil, tcpAddr)
	if err != nil {
		props.OnDaemonConnectFailed(err)
	}

	writer := bufio.NewWriter(client)
	_, err = writer.WriteString(composite + "\n")

	if err != nil {
		props.OnDaemonConnectFailed(err)
	}

	err = writer.Flush()

	if err != nil {
		props.OnDaemonConnectFailed(err)
	}

	done := make(chan struct{})

	mutex.Lock()
	tcpClientsByEnvkey[envkey] = client
	onChangeChannelsByEnvkey[envkey] = done
	mutex.Unlock()

	go func() {
		defer close(done)
		for {
			reader := bufio.NewReader(client)
			res, err := reader.ReadString('\n')

			if err != nil {
				props.OnLostDaemonConnection(err)
			}
			msg := strings.TrimSpace(res)

			if msg == "envkey_invalid" {
				props.OnInvalid()
			} else if msg == "connection_throttled" {
				props.OnThrottled()
			} else if msg == "will_reconnect" {
				props.OnWillReconnect()
			} else if msg == "reconnected" {
				props.OnReconnected()
			} else if msg == "reconnected_no_change" {
				props.OnReconnectedNoChange()
			} else if msg == "suspended" {
				props.OnSuspended()
			} else if msg == "suspended_no_change" {
				props.OnSuspendedNoChange()
			} else {
				props.OnChange()
			}
		}
	}()

	for {
		select {
		case <-done:
			return
		}
	}
}

func RemoveListener(envkey string) {
	mutex.Lock()
	tcpClient := tcpClientsByEnvkey[envkey]
	onChangeChannel := onChangeChannelsByEnvkey[envkey]
	mutex.Unlock()

	if tcpClient != nil {
		tcpClient.Close()
	}

	if onChangeChannel != nil {
		close(onChangeChannel)
	}
}

func ListenChangeWithEnv(envkey, clientName, clientVersion string, onChange func(parser.EnvMap, parser.EnvMap)) {
	ListenChange(ListenChangeProps{
		Envkey: envkey,
		OnChange: func() {
			currentEnv, previousEnv, err := FetchMap(envkey, clientName, clientVersion)

			if err != nil {
				stderrLogger.Println(utils.FormatTerminal(" | couldn't fetch latest env: "+err.Error(), colors.Red))
				os.Exit(1)
			}

			onChange(currentEnv, previousEnv)
		},
		OnInvalid: func() {
			stderrLogger.Println(utils.FormatTerminal(" | ENVKEY invalid–watcher will exit", colors.Red))
			os.Exit(1)
		},
		OnThrottled: func() {
			stderrLogger.Println(utils.FormatTerminal(" | active socket connection limit reached–watcher will exit", colors.Red))
			os.Exit(1)
		},
		OnLostDaemonConnection: func(err error) {
			stderrLogger.Println(utils.FormatTerminal(" | lost connection to envkey daemon: "+err.Error(), colors.Red))
			os.Exit(1)
		},
		OnDaemonConnectFailed: func(err error) {
			stderrLogger.Println(utils.FormatTerminal(" | couldn't connect to envkey daemon: "+err.Error(), colors.Red))
			os.Exit(1)
		},
		OnWillReconnect: func() {
			stderrLogger.Println(utils.FormatTerminal(" | lost connection to EnvKey host–attempting to reconnect...", colors.Red))
		},
		OnReconnected: func() {
			stderrLogger.Println(utils.FormatTerminal(" | reconnected to EnvKey host–checking for changes...", colors.Green))
		},
		OnReconnectedNoChange: func() {
			stderrLogger.Println(utils.FormatTerminal(" | nothing changed–waiting for changes...", colors.Green))
		},
		OnSuspended: func() {
			stderrLogger.Println(utils.FormatTerminal(" | process was suspended–checking for changes...", colors.Green))
		},
		OnSuspendedNoChange: func() {
			stderrLogger.Println(utils.FormatTerminal(" | nothing changed–waiting for changes...", colors.Green))
		},
	})
}

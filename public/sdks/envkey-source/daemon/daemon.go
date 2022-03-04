package daemon

import (
	"bufio"
	"bytes"
	"encoding/gob"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"

	colors "github.com/logrusorgru/aurora/v3"

	"github.com/envkey/envkey/public/sdks/envkey-source/fetch"
	"github.com/envkey/envkey/public/sdks/envkey-source/parser"
	"github.com/envkey/envkey/public/sdks/envkey-source/version"
	"github.com/envkey/envkey/public/sdks/envkey-source/ws"

	// "github.com/davecgh/go-spew/spew"

	"github.com/mitchellh/go-homedir"
	"gopkg.in/natefinch/lumberjack.v2"
)

type ListenChangeProps struct {
	Envkey                 string
	OnChange               func()
	OnInvalid              func()
	OnThrottled            func()
	OnLostDaemonConnection func(error)
	OnDaemonConnectFailed  func(error)
	OnWillReconnect        func()
	OnReconnected          func()
}

type DaemonOptions struct {
	VerboseOutput bool
}

type SocketAuth struct {
	Type         string `json:"type"`
	EnvkeyIdPart string `json:"envkeyIdPart"`
	ConnectionId string `json:"connectionId"`
}

type DaemonResponse struct {
	CurrentEnv  parser.EnvMap
	PreviousEnv parser.EnvMap
}

// client state (foreground process)
var tcpClientsByEnvkey = map[string]*net.TCPConn{}
var onChangeChannelsByEnvkey = make(map[string](chan struct{}))

// daemon state (background process)
var websocketsByEnvkey = map[string]*ws.ReconnectingWebsocket{}
var tcpServerConnsByEnvkeyByConnId = map[string](map[string]net.Conn){}
var currentEnvsByEnvkey = map[string]parser.EnvMap{}
var previousEnvsByEnvkey = map[string]parser.EnvMap{}

var mutex sync.Mutex

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

func LaunchDetachedIfNeeded(opts DaemonOptions) error {
	alive := IsAlive()

	if alive {
		if opts.VerboseOutput {
			fmt.Fprintln(os.Stderr, FormatTerminal(" | envkey-source daemon already running", nil))
		}
	} else {
		if opts.VerboseOutput {
			fmt.Fprintln(os.Stderr, FormatTerminal(" | envkey-source daemon not running--starting", nil))
		}

		name := os.Args[0]
		cmdArgs := []string{"--daemon"}

		if opts.VerboseOutput {
			fmt.Fprintln(os.Stderr, FormatTerminal(" | executing "+name, nil))
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
				fmt.Fprintln(os.Stderr, FormatTerminal(" | envkey-source daemon is running", colors.Green))
			}
		} else {
			msg := "envkey-source daemon couldn't be started"
			if opts.VerboseOutput {
				fmt.Fprintln(os.Stderr, FormatTerminal(" | "+msg, colors.Red))
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

func InlineStart() {
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

	go startTcpServer()
	go startHttpServer()

	signal.Ignore(syscall.SIGINT,
		syscall.SIGTERM,
		syscall.SIGQUIT)

	select {}
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
				fmt.Fprintln(os.Stderr, FormatTerminal(" | couldn't fetch latest env: "+err.Error(), colors.Red))
				os.Exit(1)
			}

			onChange(currentEnv, previousEnv)
		},
		OnInvalid: func() {
			fmt.Fprintln(os.Stderr, FormatTerminal(" | ENVKEY invalid--watcher will exit", colors.Red))
			os.Exit(1)
		},
		OnThrottled: func() {
			fmt.Fprintln(os.Stderr, FormatTerminal(" | active socket connection limit reached--watcher will exit", colors.Red))
			os.Exit(1)
		},
		OnLostDaemonConnection: func(err error) {
			fmt.Fprintln(os.Stderr, FormatTerminal(" | lost connection to envkey daemon: "+err.Error(), colors.Red))
			os.Exit(1)
		},
		OnDaemonConnectFailed: func(err error) {
			fmt.Fprintln(os.Stderr, FormatTerminal(" | couldn't connect to envkey daemon: "+err.Error(), colors.Red))
			os.Exit(1)
		},
		OnWillReconnect: func() {
			fmt.Fprintln(os.Stderr, FormatTerminal(" | lost connection to EnvKey host--attempting to reconnect...", colors.Red))
		},
		OnReconnected: func() {
			fmt.Fprintln(os.Stderr, FormatTerminal(" | reconnected to EnvKey host--waiting for changes...", colors.Green))
		},
	})
}

func startTcpServer() {
	listener, err := net.Listen("tcp", "127.0.0.1:19410")
	if err != nil {
		log.Fatal(err)
	}

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Fatal(err)
		}
		go handleTcpConnection(conn)
	}
}

func handleTcpConnection(serverConn net.Conn) {
	var envkey string
	var connId string

	defer func() {
		log.Printf("closing Tcp Connection: %s|%s", idPart(envkey), connId)
		serverConn.Close()
		mutex.Lock()
		delete(tcpServerConnsByEnvkeyByConnId[envkey], connId)
		lastConnection := len(tcpServerConnsByEnvkeyByConnId[envkey]) == 0
		mutex.Unlock()

		if lastConnection && websocketsByEnvkey[envkey] != nil {
			closeWebsocket(envkey)
		}
	}()

	for {
		reader := bufio.NewReader(serverConn)
		msg, err := reader.ReadString('\n')

		if err != nil {
			log.Printf("TCP Connection %s|%s error: %s", idPart(envkey), connId, err)
			return
		}

		composite := strings.TrimSpace(msg)
		split := strings.Split(composite, "|")
		envkey = split[0]
		connId = split[1]

		log.Printf("TCP Connection established: %s|%s", idPart(envkey), connId)

		if currentEnvsByEnvkey[envkey] == nil {
			log.Printf("TCP Connection %s|%s: no currentEnv", idPart(envkey), connId)
			return
		} else {
			mutex.Lock()
			if tcpServerConnsByEnvkeyByConnId[envkey] == nil {
				tcpServerConnsByEnvkeyByConnId[envkey] = map[string]net.Conn{}
			}
			tcpServerConnsByEnvkeyByConnId[envkey][connId] = serverConn
			mutex.Unlock()
		}
	}

}

func startHttpServer() {
	r := mux.NewRouter()

	r.HandleFunc("/alive", aliveHandler).Methods("GET")
	r.HandleFunc("/stop", stopHandler).Methods("GET")
	r.HandleFunc("/fetch/{envkey}/{clientName}/{clientVersion}", fetchHandler).Methods("GET")

	http.Handle("/", r)
	log.Fatal(http.ListenAndServe(":19409", nil))
}

func aliveHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, "Still kickin'")
}

func stopHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	msg := "envkey-source daemon stopped"
	fmt.Fprint(w, msg)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	log.Println(msg)
	os.Exit(0)
}

func fetchHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	envkey := vars["envkey"]

	log.Printf("fetching env -- %s", idPart(envkey))

	if envkey == "" {
		w.WriteHeader(http.StatusNotFound)
		fmt.Fprint(w, "Not found")
	}

	defer func() {
		mutex.Lock()
		delete(previousEnvsByEnvkey, envkey)
		mutex.Unlock()
	}()

	var previousEnv parser.EnvMap
	var currentEnv parser.EnvMap

	mutex.Lock()
	previousEnv = previousEnvsByEnvkey[envkey]
	currentEnv = currentEnvsByEnvkey[envkey]
	socket := websocketsByEnvkey[envkey]
	mutex.Unlock()

	if currentEnv == nil {
		err := fetchCurrent(envkey, vars["clientName"], vars["clientVersion"])

		if err != nil {
			log.Println("fetch error:", err)

			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprintln(w, "Fetch error", err)
			return
		}

		go connectEnvkeyWebsocket(envkey, vars["clientName"], vars["clientVersion"])

		if err != nil {
			log.Println("Connect envkey socket error:", err)

			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprintln(w, "Connect envkey socket error", err)
			return
		}
	} else if socket == nil || !socket.IsConnected() {
		err := fetchCurrent(envkey, vars["clientName"], vars["clientVersion"])

		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprintln(w, "Fetch error", err)
			return
		}
	}

	resp := DaemonResponse{make(parser.EnvMap), make(parser.EnvMap)}
	if currentEnv != nil {
		resp.CurrentEnv = currentEnv
	}
	if previousEnv != nil {
		resp.PreviousEnv = previousEnv
	}
	var buf bytes.Buffer
	enc := gob.NewEncoder(&buf)

	if err := enc.Encode(resp); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintln(w, "Fetch error", err)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write(buf.Bytes())
}

func connectEnvkeyWebsocket(envkey, clientName, clientVersion string) error {
	mutex.Lock()
	connected := websocketsByEnvkey[envkey] != nil
	mutex.Unlock()

	if connected {
		log.Printf("websocket for %s already connected", idPart(envkey))
		return nil
	}

	envkeyIdPart, _, envkeyHost := fetch.SplitEnvkey(envkey)

	if envkeyHost == "" {
		envkeyHost = fetch.DefaultHost
	}

	endpoint := "wss://" + envkeyHost
	connectionIdBytes, err := uuid.NewRandom()

	if err != nil {
		return err
	}

	authorizationJsonBytes, err := json.Marshal(&SocketAuth{
		Type:         "fetchEnvkeySocketAuthParams",
		EnvkeyIdPart: envkeyIdPart,
		ConnectionId: connectionIdBytes.String(),
	})

	if err != nil {
		return err
	}

	socket := &ws.ReconnectingWebsocket{
		OnWillReconnect: func() {
			writeTCP(envkey, []byte("will_reconnect"))
		},
		OnReconnect: func() {
			err := fetchCurrent(envkey, clientName, clientVersion)

			if err != nil {
				log.Println("fetchCurrent error:", err.Error())
			}

			writeTCP(envkey, []byte("reconnected"))
		},
		OnInvalid: func() {
			writeTCP(envkey, []byte("envkey_invalid"))
		},
		OnThrottled: func() {
			writeTCP(envkey, []byte("connection_throttled"))
		},
	}
	socket.Dial(endpoint, http.Header{"authorization": {string(authorizationJsonBytes)}})
	log.Printf("connected to %s", endpoint)

	mutex.Lock()
	websocketsByEnvkey[envkey] = socket
	mutex.Unlock()

	defer closeWebsocket(envkey)

	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			_, message, err := socket.ReadMessage()

			if message != nil {
				log.Printf("%s websocket received message", idPart(envkey))

				err = fetchCurrent(envkey, clientName, clientVersion)
				if err != nil {
					log.Printf("fetchCurrent error: %s", err)
					return
				}
				log.Printf("%s fetched latest env", idPart(envkey))

				err = writeTCP(envkey, message)
				if err != nil {
					log.Printf("writeTCP error: %s", err)
					return
				}
			}

			if err != nil {
				// 401, 404, 429 (throttled) don't reconnect
				code := socket.GetHTTPResponse().StatusCode

				log.Printf("read websocket error: %s, code: %d", err, code)

				if code == 401 || code == 404 || code == 429 || socket.IsClosing() {
					return
				}
			}
		}
	}()

	for {
		select {
		case <-done:
			return nil
		}
	}
}

func writeTCP(envkey string, message []byte) error {
	mutex.Lock()
	tcpServerConns := tcpServerConnsByEnvkeyByConnId[envkey]
	mutex.Unlock()

	if tcpServerConns == nil {
		return errors.New("no TCP connections")
	} else {
		log.Printf("Sending message %s to %d TCP connections for %s", message, len(tcpServerConns), idPart(envkey))

		for _, conn := range tcpServerConns {
			writer := bufio.NewWriter(conn)
			_, err := writer.WriteString(string(message) + "\n")

			if err != nil {
				return err
			}

			err = writer.Flush()

			if err != nil {
				return err
			}
		}

	}

	return nil
}

func fetchCurrent(envkey, clientName, clientVersion string) error {
	fetchOptions := fetch.FetchOptions{
		ShouldCache:    false,
		CacheDir:       "",
		ClientName:     clientName,
		ClientVersion:  clientVersion,
		VerboseOutput:  false,
		TimeoutSeconds: 20,
		Retries:        3,
		RetryBackoff:   1,
	}

	fetchRes, err := fetch.FetchMap(envkey, fetchOptions)

	if err != nil {
		return err
	}

	mutex.Lock()
	previousEnvsByEnvkey[envkey] = currentEnvsByEnvkey[envkey]
	currentEnvsByEnvkey[envkey] = fetchRes
	mutex.Unlock()

	return nil
}

func closeWebsocket(envkey string) {
	mutex.Lock()
	conn := websocketsByEnvkey[envkey]
	mutex.Unlock()

	if conn == nil {
		return
	}

	log.Printf("%s websocket closing", idPart(envkey))

	mutex.Lock()
	socket := websocketsByEnvkey[envkey]
	delete(websocketsByEnvkey, envkey)
	delete(currentEnvsByEnvkey, envkey)
	delete(previousEnvsByEnvkey, envkey)
	tcpServerConns := tcpServerConnsByEnvkeyByConnId[envkey]
	delete(tcpServerConnsByEnvkeyByConnId, envkey)
	mutex.Unlock()

	if len(tcpServerConns) > 0 {
		log.Printf("Closing %d tcp connections", len(tcpServerConns))
	}

	for _, conn := range tcpServerConns {
		conn.Close()
	}
	socket.Close()
}

func idPart(envkey string) string {
	return strings.Split(envkey, "-")[0]
}

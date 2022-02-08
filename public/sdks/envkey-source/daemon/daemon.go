package daemon

import (
	"bufio"
	"bytes"
	"encoding/json"
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
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"

	colors "github.com/logrusorgru/aurora/v3"

	"github.com/envkey/envkey/public/sdks/envkey-source/fetch"
	"github.com/envkey/envkey/public/sdks/envkey-source/parser"
	"github.com/envkey/envkey/public/sdks/envkey-source/version"
	"github.com/envkey/envkey/public/sdks/envkey-source/ws"

	// "github.com/davecgh/go-spew/spew"
)

type DaemonOptions struct {
	VerboseOutput bool
}

type SocketAuth struct {
	Type         string `json:"type"`
	EnvkeyIdPart string `json:"envkeyIdPart"`
	ConnectionId string `json:"connectionId"`
}

type DaemonResponse struct {
	CurrentEnv parser.EnvMap
	PreviousEnv parser.EnvMap
}

var websocketsByEnvkey = map[string]*ws.ReconnectingWebsocket{}
var tcpServerConnsByEnvkey = map[string]net.Conn{}
var tcpClientsByEnvkey = map[string]*net.TCPConn{}
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
			fmt.Fprintln(os.Stderr, FormatTerminal(" | executing " + name, nil))
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
				fmt.Fprintln(os.Stderr, FormatTerminal(" | " + msg, colors.Red))
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
	go startTcpServer()
	go startHttpServer()
	select {
	}
}

func ListenChange(envkey, clientName, clientVersion string, onChange func(parser.EnvMap, parser.EnvMap)) {
	mutex.Lock()
	tcpClient := tcpClientsByEnvkey[envkey]
	mutex.Unlock()

	if tcpClient != nil {
		tcpClient.Close()
	}

	tcpAddr, err := net.ResolveTCPAddr("tcp", "127.0.0.1:19410")
	if err != nil {
		fmt.Fprintln(os.Stderr, FormatTerminal(" | couldn't connect to envkey daemon: "+err.Error(), colors.Red))
		os.Exit(1)
	}
	client, err := net.DialTCP("tcp", nil, tcpAddr)
	if err != nil {
		fmt.Fprintln(os.Stderr, FormatTerminal(" | couldn't connect to envkey daemon: "+err.Error(), colors.Red))
		os.Exit(1)
	}

	writer := bufio.NewWriter(client)
	_, err = writer.WriteString(envkey + "\n")

	if err != nil {
		fmt.Fprintln(os.Stderr, FormatTerminal(" | couldn't connect to envkey daemon: "+err.Error(), colors.Red))
		os.Exit(1)
	}

	err = writer.Flush()

	if err != nil {
		fmt.Fprintln(os.Stderr, FormatTerminal(" | couldn't connect to envkey daemon: "+err.Error(), colors.Red))
		os.Exit(1)
	}

	mutex.Lock()
	tcpClientsByEnvkey[envkey] = client
	mutex.Unlock()

	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			reader := bufio.NewReader(client)
			res, err := reader.ReadString('\n')

			if err != nil {
				fmt.Fprintln(os.Stderr, FormatTerminal(" | lost connection to envkey daemon: "+err.Error(), colors.Red))
				os.Exit(1)
			}
			msg := strings.TrimSpace(res)

			if msg == "envkey_invalid" {
				fmt.Fprintln(os.Stderr, FormatTerminal(" | ENVKEY invalid--watcher will exit", colors.Red))
				os.Exit(1)
			}

			currentEnv, previousEnv, err := FetchMap(envkey, clientName, clientVersion)

			if err != nil {
				fmt.Fprintln(os.Stderr, FormatTerminal(" | couldn't fetch latest env: "+err.Error(), colors.Red))
				os.Exit(1)
			}

			onChange(currentEnv, previousEnv)
		}
	}()

	for {
		select {
		case <-done:
			return
		}
	}
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

	defer func() {
		serverConn.Close()

		mutex.Lock()
		tcpServerConnsByEnvkey[envkey] = nil
		mutex.Unlock()
	}()

	for {
		reader := bufio.NewReader(serverConn)
		msg, err := reader.ReadString('\n')

		if err != nil {
			return
		}

		envkey = strings.TrimSpace(msg)

		if err != nil {
			println("tcp server error:", err)
		}

		if currentEnvsByEnvkey[envkey] == nil {
			return
		} else {
			mutex.Lock()
			tcpServerConnsByEnvkey[envkey] = serverConn
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
	fmt.Fprint(w, "envkey-source daemon stopped'")		
	if f, ok := w.(http.Flusher); ok { 
	  f.Flush() 
	}
	os.Exit(0)
}

func fetchHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	envkey := vars["envkey"]

	if envkey == "" {
		w.WriteHeader(http.StatusNotFound)
		fmt.Fprint(w, "Not found")
	}

	defer func (){
		mutex.Lock()
		previousEnvsByEnvkey[envkey] = nil
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

		mutex.Lock()
		previousEnv = previousEnvsByEnvkey[envkey]
		currentEnv = currentEnvsByEnvkey[envkey]
		mutex.Unlock()

		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprintln(w, "Fetch error", err)
			return
		}

		go connectEnvkeyWebsocket(envkey, vars["clientName"], vars["clientVersion"])

		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprintln(w, "Connect envkey socket error", err)
			return
		}		
	} else {
		if !socket.IsConnected() {			 
			err := fetchCurrent(envkey, vars["clientName"], vars["clientVersion"])

			mutex.Lock()			
			previousEnv = previousEnvsByEnvkey[envkey]
			currentEnv = currentEnvsByEnvkey[envkey]
			mutex.Unlock()

			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				fmt.Fprintln(w, "Fetch error", err)
				return
			}
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
		OnReconnect: func() {
			err := fetchCurrent(envkey, clientName, clientVersion)

			if err != nil {
				println("fetchCurrent error:", err.Error())
			}
		},
		OnInvalid: func() {
			writeTCP(envkey, []byte("envkey_invalid"))
		},
	}
	socket.Dial(endpoint, http.Header{"authorization": {string(authorizationJsonBytes)}})
	fmt.Printf("connected to %s", endpoint)

	mutex.Lock()
	websocketsByEnvkey[envkey] = socket
	mutex.Unlock()

	defer func() {
		mutex.Lock()
		websocketsByEnvkey[envkey] = nil
		currentEnvsByEnvkey[envkey] = nil
		previousEnvsByEnvkey[envkey] = nil
		tcpServerConn := tcpServerConnsByEnvkey[envkey]
		tcpServerConnsByEnvkey[envkey] = nil
		mutex.Unlock()

		socket.Close()
		tcpServerConn.Close()
	}()

	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			_, message, err := socket.ReadMessage()

			if message != nil {
				err = fetchCurrent(envkey, clientName, clientVersion)
				if err != nil {
					return
				}

				err = writeTCP(envkey, message)
				if err != nil {
					return
				}
			}

			if err != nil {
				// 401 and 404 don't reconnect
				code := socket.GetHTTPResponse().StatusCode

				if code == 401 || code == 404 {
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
	tcpServerConn := tcpServerConnsByEnvkey[envkey]
	mutex.Unlock()

	if tcpServerConn == nil {
		return errors.New("No TCP connection")
	} else {
		writer := bufio.NewWriter(tcpServerConn)
		_, err := writer.WriteString(string(message) + "\n")

		if err != nil {
			return err
		}

		err = writer.Flush()

		if err != nil {
			return err
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

package daemon

import (
	"bufio"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/envkey/envkey/public/sdks/envkey-source/fetch"
	"github.com/envkey/envkey/public/sdks/envkey-source/utils"
	"github.com/envkey/envkey/public/sdks/envkey-source/ws"
	"github.com/google/uuid"
)

const WS_PING_INTERVAL = time.Duration(5) * time.Second

var websocketsByEnvkey = map[string]*ws.ReconnectingWebsocket{}
var tcpServerConnsByEnvkeyByConnId = map[string](map[string]net.Conn){}

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
		log.Printf("closing Tcp Connection: %s|%s", utils.IdPart(envkey), connId)
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
			log.Printf("TCP Connection %s|%s error: %s", utils.IdPart(envkey), connId, err)
			return
		}

		composite := strings.TrimSpace(msg)
		split := strings.Split(composite, "|")
		envkey = split[0]
		connId = split[1]

		log.Printf("TCP Connection established: %s|%s", utils.IdPart(envkey), connId)

		if currentEnvsByEnvkey[envkey] == nil {
			log.Printf("TCP Connection %s|%s: no currentEnv", utils.IdPart(envkey), connId)
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

func connectEnvkeyWebsocket(envkey, clientName, clientVersion string) error {
	mutex.Lock()
	connected := websocketsByEnvkey[envkey] != nil
	mutex.Unlock()

	if connected {
		log.Printf("websocket for %s already connected", utils.IdPart(envkey))
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
			changed, err := fetchCurrent(envkey, clientName, clientVersion)

			if err == nil {
				writeTCP(envkey, []byte("reconnected"))
				time.Sleep(time.Duration(5) * time.Millisecond)

				if changed {
					writeTCP(envkey, []byte(""))
				} else {
					writeTCP(envkey, []byte("reconnected_no_change"))
				}
			} else {
				log.Println("fetchCurrent error:", err.Error())
			}
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
			if socket.IsClosedNoReconnect() {
				return
			}

			if socket.IsClosed() || socket.IsClosing() {
				time.Sleep(WS_PING_INTERVAL)
				continue
			}

			_, message, err := socket.ReadMessage()

			if message != nil {
				log.Printf("%s websocket received message", utils.IdPart(envkey))

				changed, err := fetchCurrent(envkey, clientName, clientVersion)
				if err != nil {
					log.Printf("fetchCurrent error: %s", err)
					return
				}
				log.Printf("%s fetched latest env. changed: %v", utils.IdPart(envkey), changed)

				if changed {
					err = writeTCP(envkey, []byte(""))
				}

				if err != nil {
					log.Printf("writeTCP error: %s", err)
					return
				}
			}

			if err != nil {
				if !socket.IsConnected() {
					time.Sleep(time.Duration(5000) * time.Millisecond)
					continue
				}

				// 401, 404, 429 (throttled) don't reconnect
				code := socket.GetHTTPResponse().StatusCode

				log.Printf("read websocket error: %s, code: %d", err, code)

				if code == 401 || code == 404 || code == 429 {
					return
				}
			}
		}
	}()

	go func() {
		for {
			if socket.IsClosedNoReconnect() {
				return
			}

			if !(!socket.IsConnected() || socket.IsClosing() || socket.IsClosed()) {
				socket.WriteHeartbeat()
			}

			time.Sleep(time.Duration(5000) * time.Millisecond)
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
	var connIds []string
	var tcpServerConns map[string]net.Conn

	mutex.Lock()
	tcpServerConns = tcpServerConnsByEnvkeyByConnId[envkey]

	if tcpServerConns != nil {
		connIds = make([]string, 0, len(tcpServerConns))
		for k := range tcpServerConns {
			connIds = append(connIds, k)
		}
	}
	mutex.Unlock()

	if tcpServerConns == nil {
		return errors.New("no TCP connections")
	} else {
		log.Printf("Sending message %s to %d TCP connections for %s", message, len(tcpServerConns), utils.IdPart(envkey))

		for _, connId := range connIds {
			mutex.Lock()
			conn := tcpServerConns[connId]
			mutex.Unlock()

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

func closeWebsocket(envkey string) {
	mutex.Lock()
	conn := websocketsByEnvkey[envkey]
	mutex.Unlock()

	if conn == nil {
		return
	}

	log.Printf("%s websocket closing", utils.IdPart(envkey))

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
	socket.Close(false)

	var socketsRemaining int
	mutex.Lock()
	socketsRemaining = len(websocketsByEnvkey)
	mutex.Unlock()

	if socketsRemaining == 0 {
		log.Printf("No socket connections remaining. Stopping daemon.")
		os.Exit(0)
	}
}

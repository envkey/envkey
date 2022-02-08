package ws

import (
	"errors"
	"fmt"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/jpillora/backoff"
)

var (
	ErrNotConnected   = errors.New("websocket not connected")
	ErrUrlEmpty       = errors.New("url can not be empty")
	ErrUrlWrongScheme = errors.New("websocket uri must start with ws or wss scheme")
)

type WsOpts func(dl *websocket.Dialer)

type ReconnectingWebsocket struct {
	ReconnectIntervalMin    time.Duration
	ReconnectIntervalMax    time.Duration
	ReconnectIntervalFactor float64
	HandshakeTimeout        time.Duration

	OnReconnect func()
	OnInvalid   func()

	Verbose bool

	dialer        *websocket.Dialer
	url           string
	requestHeader http.Header
	httpResponse  *http.Response
	mu            sync.Mutex
	dialErr       error
	isConnected   bool
	isClosed      bool

	*websocket.Conn
}

func (ws *ReconnectingWebsocket) WriteJSON(v interface{}) error {
	err := ErrNotConnected
	if ws.IsConnected() {
		err = ws.Conn.WriteJSON(v)
		if err != nil {
			ws.handleErrorCode(ws.httpResponse.StatusCode)
		}
	}

	return err
}

func (ws *ReconnectingWebsocket) WriteMessage(messageType int, data []byte) error {
	err := ErrNotConnected
	if ws.IsConnected() {
		err = ws.Conn.WriteMessage(messageType, data)
		if err != nil {
			ws.handleErrorCode(ws.httpResponse.StatusCode)
		}
	}

	return err
}

func (ws *ReconnectingWebsocket) ReadMessage() (messageType int, message []byte, err error) {
	err = ErrNotConnected
	if ws.IsConnected() {
		messageType, message, err = ws.Conn.ReadMessage()
		if err != nil {
			ws.handleErrorCode(ws.httpResponse.StatusCode)
		}
	}

	return
}

func (ws *ReconnectingWebsocket) Close() {
	ws.mu.Lock()
	if ws.Conn != nil {
		ws.Conn.Close()
	}
	ws.isConnected = false
	ws.mu.Unlock()
}

func (ws *ReconnectingWebsocket) CloseAndReconnect() {
	ws.Close()
	ws.Connect(true)
}

func (ws *ReconnectingWebsocket) Dial(urlStr string, reqHeader http.Header, opts ...WsOpts) error {
	_, err := parseUrl(urlStr)
	if err != nil {
		return err
	}

	ws.url = urlStr
	ws.requestHeader = reqHeader
	ws.setDefaults()

	ws.dialer = &websocket.Dialer{
		Proxy:            http.ProxyFromEnvironment,
		HandshakeTimeout: ws.HandshakeTimeout,
	}
	for _, opt := range opts {
		opt(ws.dialer)
	}

	hs := ws.HandshakeTimeout
	go ws.Connect(false)

	// wait on first attempt
	time.Sleep(hs)

	return nil
}

func (ws *ReconnectingWebsocket) Connect(isReconnect bool) {
	b := &backoff.Backoff{
		Min:    ws.ReconnectIntervalMin,
		Max:    ws.ReconnectIntervalMax,
		Factor: ws.ReconnectIntervalFactor,
		Jitter: true,
	}

	// seed rand for backoff
	rand.Seed(time.Now().UTC().UnixNano())

	for {
		nextInterval := b.Duration()

		wsConn, httpResp, err := ws.dialer.Dial(ws.url, ws.requestHeader)

		code := httpResp.StatusCode

		ws.mu.Lock()
		ws.Conn = wsConn
		ws.dialErr = err
		ws.isConnected = err == nil
		ws.httpResponse = httpResp
		ws.mu.Unlock()

		if err == nil {
			if ws.Verbose {
				fmt.Fprintf(os.Stderr, "Websocket.Dial: connection was successfully established with %s\n", ws.url)
			}

			if isReconnect && ws.OnReconnect != nil {
				ws.OnReconnect()
			}

			return
		} else if code == 401 || code == 404 {
			if ws.OnInvalid != nil {
				ws.OnInvalid()
			}
			return
		} else {
			if ws.Verbose {
				fmt.Fprintf(os.Stderr, "Websocket[%s].Dial: can't connect to websocket, will try again in %v\n", ws.url, nextInterval)
			}
		}

		time.Sleep(nextInterval)
	}
}

func (ws *ReconnectingWebsocket) GetHTTPResponse() *http.Response {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	return ws.httpResponse
}

func (ws *ReconnectingWebsocket) GetDialError() error {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	return ws.dialErr
}

func (ws *ReconnectingWebsocket) IsConnected() bool {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	return ws.isConnected
}

func (ws *ReconnectingWebsocket) setDefaults() {
	if ws.ReconnectIntervalMin == 0 {
		ws.ReconnectIntervalMin = 2 * time.Second
	}

	if ws.ReconnectIntervalMax == 0 {
		ws.ReconnectIntervalMax = 10 * time.Second
	}

	if ws.ReconnectIntervalFactor == 0 {
		ws.ReconnectIntervalFactor = 1.5
	}

	if ws.HandshakeTimeout == 0 {
		ws.HandshakeTimeout = 2 * time.Second
	}
}

func (ws *ReconnectingWebsocket) handleErrorCode(code int) {
	if code == 401 || code == 404 {
		if ws.OnInvalid != nil {
			ws.OnInvalid()
		}

		ws.Close()
	} else {
		ws.CloseAndReconnect()
	}
}

func parseUrl(urlStr string) (*url.URL, error) {
	if urlStr == "" {
		return nil, ErrUrlEmpty
	}
	u, err := url.Parse(urlStr)

	if err != nil {
		return nil, err
	}

	if u.Scheme != "ws" && u.Scheme != "wss" {
		return nil, ErrUrlWrongScheme
	}

	return u, nil
}

package ws

import (
	"errors"
	"log"
	"net/http"
	"net/url"
	"strings"
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

	OnWillReconnect func()
	OnReconnect     func()
	OnInvalid       func()
	OnThrottled     func()

	Verbose bool

	dialer              *websocket.Dialer
	url                 string
	requestHeader       http.Header
	httpResponse        *http.Response
	mu                  sync.Mutex
	dialErr             error
	isConnected         bool
	isClosing           bool
	isClosed            bool
	isClosedNoReconnect bool

	justLoggedReconnected   bool
	justLoggedWillReconnect bool

	*websocket.Conn
}

const PING_TIMEOUT = time.Duration(10000 * time.Millisecond)

func (ws *ReconnectingWebsocket) WriteJSON(v interface{}) error {
	err := ErrNotConnected
	if ws.IsConnected() {
		err = ws.Conn.WriteJSON(v)
		if err != nil {
			ws.handleError(err, ws.httpResponse.StatusCode)
		}
	}

	return err
}

func (ws *ReconnectingWebsocket) WriteMessage(messageType int, data []byte) error {
	err := ErrNotConnected
	if ws.IsConnected() {
		err = ws.Conn.WriteMessage(messageType, data)
		if err != nil {
			ws.handleError(err, ws.httpResponse.StatusCode)
		}
	}

	return err
}

func (ws *ReconnectingWebsocket) WriteHeartbeat() error {
	err := ErrNotConnected
	if ws.IsConnected() {
		err = ws.Conn.WriteMessage(websocket.PingMessage, []byte(""))

		ws.Conn.SetReadDeadline(time.Now().Add(PING_TIMEOUT))
		ws.Conn.SetPongHandler(func(appData string) error {
			ws.Conn.SetReadDeadline(time.Time{})
			return nil
		})

		if err != nil {
			ws.handleError(err, ws.httpResponse.StatusCode)
		}
	}

	return err
}

func (ws *ReconnectingWebsocket) ReadMessage() (messageType int, message []byte, err error) {

	err = ErrNotConnected
	if ws.IsConnected() {
		messageType, message, err = ws.Conn.ReadMessage()

		if err != nil {
			log.Println("WebSocket ReadMessage err:", err)
			ws.handleError(err, ws.httpResponse.StatusCode)
		}
	}
	return
}

func (ws *ReconnectingWebsocket) Close(willReconnect bool) {
	var err error
	if ws.Conn != nil {
		ws.mu.Lock()
		ws.isClosing = true
		ws.mu.Unlock()

		err = ws.Conn.Close()
	}

	if err == nil {
		ws.mu.Lock()
		ws.isConnected = false
		ws.isClosed = true
		ws.isClosing = false

		if !willReconnect {
			ws.isClosedNoReconnect = true
		}

		ws.mu.Unlock()
	}
}

func (ws *ReconnectingWebsocket) CloseAndReconnect() {
	ws.Close(true)
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

	loggedReconnect := false
	connectFailed := false

	for {
		nextInterval := b.Duration()
		wsConn, httpResp, err := ws.dialer.Dial(ws.url, ws.requestHeader)

		ws.mu.Lock()
		ws.Conn = wsConn
		ws.dialErr = err
		ws.isConnected = err == nil
		ws.httpResponse = httpResp

		if ws.isClosed && err == nil {
			ws.isClosed = false
		}

		ws.mu.Unlock()

		if err == nil {
			if connectFailed && loggedReconnect {
				loggedReconnect = false
			}
			if connectFailed {
				connectFailed = false

				ws.dispatchReconnected()
			}
		} else {
			connectFailed = true
			if !loggedReconnect {
				log.Printf("Websocket[%s].Dial: can't connect to websocket (err: %s, httpResp: %v), attempting to reconnect...\n", ws.url, err, httpResp == nil)
				loggedReconnect = true

				ws.dispatchWillReconnect()
			}

			time.Sleep(nextInterval)
			continue
		}

		code := httpResp.StatusCode

		if err == nil {
			log.Printf("Websocket.Dial: connection was successfully established with %s\n", ws.url)

			if isReconnect || connectFailed {
				ws.dispatchReconnected()
			}

			return
		} else if strings.Contains(err.Error(), "4001: forbidden") || code == 401 || code == 404 {
			log.Printf("Websocket.Dial: connection to %s failed: %d (invalid ENVKEY)\n", ws.url, code)
			if ws.OnInvalid != nil {
				ws.OnInvalid()
			}
			return
		} else if strings.Contains(err.Error(), "4002: throttled") || code == 429 {
			log.Printf("Websocket.Dial: connection to %s failed: %d (throttled)\n", ws.url, code)
			if ws.OnThrottled != nil {
				ws.OnThrottled()
			}
			return
		} else {
			if !loggedReconnect {
				log.Printf("Websocket[%s].Dial: can't connect to websocket (status: %d) attempting to reconnect...\n", ws.url, code)
				ws.dispatchWillReconnect()
				loggedReconnect = true
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

func (ws *ReconnectingWebsocket) IsClosing() bool {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	return ws.isClosing
}

func (ws *ReconnectingWebsocket) IsClosedNoReconnect() bool {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	return ws.isClosedNoReconnect
}

func (ws *ReconnectingWebsocket) IsClosed() bool {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	return ws.isClosed
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

func (ws *ReconnectingWebsocket) handleError(err error, code int) {

	if strings.Contains(err.Error(), "4001: forbidden") || code == 401 || code == 404 {
		if ws.OnInvalid != nil {
			ws.OnInvalid()
		}
		ws.Close(false)
	} else if strings.Contains(err.Error(), "4002: throttled") || code == 429 {
		if ws.OnThrottled != nil {
			ws.OnThrottled()
		}
		ws.Close(false)
	} else if !ws.IsClosing() {
		ws.dispatchWillReconnect()
		ws.CloseAndReconnect()
	}
}

func (ws *ReconnectingWebsocket) dispatchReconnected() {
	if ws.OnReconnect != nil && !ws.justLoggedReconnected {
		ws.OnReconnect()

		ws.mu.Lock()
		ws.justLoggedReconnected = true
		ws.mu.Unlock()

		go func() {
			time.Sleep(time.Duration(1000) * time.Millisecond)
			ws.mu.Lock()
			ws.justLoggedReconnected = false
			ws.mu.Unlock()
		}()
	}
}

func (ws *ReconnectingWebsocket) dispatchWillReconnect() {
	if !ws.IsClosing() && ws.OnWillReconnect != nil && !ws.justLoggedWillReconnect {
		ws.OnWillReconnect()

		ws.mu.Lock()
		ws.justLoggedWillReconnect = true
		ws.mu.Unlock()

		go func() {
			time.Sleep(time.Duration(1000) * time.Millisecond)
			ws.mu.Lock()
			ws.justLoggedWillReconnect = false
			ws.mu.Unlock()
		}()
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

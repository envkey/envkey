package daemon

import (
	"github.com/envkey/envkey/public/sdks/envkey-source/parser"
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
	OnReconnectedNoChange  func()
	OnSuspended            func()
	OnSuspendedNoChange    func()
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

type EnvkeyMeta struct {
	ClientName    string
	ClientVersion string
}

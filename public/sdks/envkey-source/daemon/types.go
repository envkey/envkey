package daemon

import (
	"github.com/envkey/envkey/public/sdks/envkey-source/parser"
)

type ListenChangeProps struct {
	Envkey                 string
	WatchThrottle          uint32
	OnChange               func()
	OnStartRolling         func(batchNum, totalBatches uint16, watchThrottle uint32)
	OnRollingComplete      func()
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
	ShouldCache   bool
	MemCache      bool
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

package daemon

import (
	"log"
	"time"
)

const CHECK_SUSPENDED_INTERVAL = 1000 * 10 // 10 seconds
const SUSPENSION_MIN_DELTA = 100           // 100 ms

var lastSuspendedCheckAt = time.Now().UnixMilli()

func startSuspendedWatcher() {
	for {
		time.Sleep(time.Duration(CHECK_SUSPENDED_INTERVAL) * time.Millisecond)

		now := time.Now().UnixMilli()
		delta := (now - lastSuspendedCheckAt) - CHECK_SUSPENDED_INTERVAL

		if delta > SUSPENSION_MIN_DELTA {
			log.Printf("Process was suspended. delta: %d", delta)

			// run through any ENVKEYs we're actively listening to and
			// check for changes

			mutex.Lock()
			envkeys := make([]string, 0, len(websocketsByEnvkey))
			for k := range websocketsByEnvkey {
				envkeys = append(envkeys, k)
			}
			mutex.Unlock()

			for _, envkey := range envkeys {
				mutex.Lock()
				meta := metaByEnvkey[envkey]
				socket := websocketsByEnvkey[envkey]
				mutex.Unlock()

				if socket.IsConnected() {
					writeTCP(envkey, []byte("suspended"))
					changed, err := fetchCurrent(envkey, meta.ClientName, meta.ClientVersion)

					if err == nil {
						if changed {
							writeTCP(envkey, []byte("env_update"))
						} else {
							writeTCP(envkey, []byte("suspended_no_change"))
						}
					} else {
						log.Println("awake from suspension: fetchCurrent error")
						socket.CloseAndReconnect()
					}
				}

			}
		}

		lastSuspendedCheckAt = time.Now().UnixMilli()
	}
}

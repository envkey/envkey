package daemon

import (
	"bytes"
	"encoding/gob"
	"math/rand"
	"reflect"
	"time"

	"github.com/envkey/envkey/public/sdks/envkey-source/fetch"
	"github.com/envkey/envkey/public/sdks/envkey-source/parser"
)

const JITTER = 500 //ms

var currentEnvsByEnvkey = map[string]parser.EnvMap{}
var previousEnvsByEnvkey = map[string]parser.EnvMap{}
var metaByEnvkey = map[string]EnvkeyMeta{}

func fetchAndConnect(envkey, clientName, clientVersion string) (buf bytes.Buffer, err error) {

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
		_, err = fetchCurrent(envkey, clientName, clientVersion)

		if err != nil {
			return
		}

		go connectEnvkeyWebsocket(envkey, clientName, clientVersion)

	} else if socket == nil || !socket.IsConnected() {
		_, err = fetchCurrent(envkey, clientName, clientVersion)

		if err != nil {
			return
		}
	}

	mutex.Lock()
	previousEnv = previousEnvsByEnvkey[envkey]
	currentEnv = currentEnvsByEnvkey[envkey]
	mutex.Unlock()

	resp := DaemonResponse{make(parser.EnvMap), make(parser.EnvMap)}
	if currentEnv != nil {
		resp.CurrentEnv = currentEnv
	}
	if previousEnv != nil {
		resp.PreviousEnv = previousEnv
	}
	enc := gob.NewEncoder(&buf)

	if err = enc.Encode(resp); err != nil {
		return
	}

	return
}

func fetchCurrent(envkey, clientName, clientVersion string) (changed bool, err error) {
	changed = false

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

	// a little itty bitty bit o' jitter does a server good
	// prevents simultaneous slamming by hundreds of ENVKEYs at the
	// exact same time on a big update
	time.Sleep(time.Duration(rand.Intn(JITTER)) * time.Millisecond)

	fetchRes, err := fetch.FetchMap(envkey, fetchOptions)

	if err != nil {
		return
	}
	mutex.Lock()
	if currentEnvsByEnvkey[envkey] == nil || !reflect.DeepEqual(currentEnvsByEnvkey[envkey], fetchRes) {
		changed = true
		previousEnvsByEnvkey[envkey] = currentEnvsByEnvkey[envkey]
		currentEnvsByEnvkey[envkey] = fetchRes
		metaByEnvkey[envkey] = EnvkeyMeta{clientName, clientVersion}
	}
	mutex.Unlock()

	return
}

package daemon

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/envkey/envkey/public/sdks/envkey-source/utils"
	"github.com/envkey/envkey/public/sdks/envkey-source/version"
	"github.com/gorilla/mux"
)

func startHttpServer() {
	r := mux.NewRouter()

	r.HandleFunc("/alive", aliveHandler).Methods("GET")
	r.HandleFunc("/stop", stopHandler).Methods("GET")
	r.HandleFunc("/fetch/{envkey}/{clientName}/{clientVersion}/{rollingReload}/{rollingPct}/{watchThrottle}", fetchHandler).Methods("GET")

	http.Handle("/", r)
	log.Fatal(http.ListenAndServe(":19409", nil))
}

func aliveHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, version.Version)
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

	log.Printf("fetching env -- %s", utils.IdPart(envkey))

	if envkey == "" {
		w.WriteHeader(http.StatusNotFound)
		fmt.Fprint(w, "Not found")
		return
	}

	rollingReload := vars["rollingReload"] == "true"
	rollingPctConv, err := strconv.ParseUint(vars["rollingPct"], 10, 8)

	var watchThrottleConv uint64
	var watchThrottle uint32
	if err == nil {
		watchThrottleConv, err = strconv.ParseUint(vars["watchThrottle"], 10, 32)
		watchThrottle = uint32(watchThrottleConv)
	}

	if err != nil {
		log.Println("fetch error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintln(w, "Fetch error", err)
		return
	}

	rollingPct := uint8(rollingPctConv)

	buf, err := fetchAndConnect(envkey, vars["clientName"], vars["clientVersion"], rollingReload, rollingPct, watchThrottle)

	if err != nil {
		log.Println("fetch error:", err)

		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintln(w, "Fetch error", err)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write(buf.Bytes())
}

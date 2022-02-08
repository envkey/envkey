package shell

import (
	"errors"
	"os"
	"sort"
	"strings"

	"github.com/envkey/envkey/public/sdks/envkey-source/parser"
)

func Source(env parser.EnvMap, force, pamCompatible, dotEnvCompatible bool) (string, error) {
	if env == nil {
		return "", errors.New("ENVKEY invalid.")
	}

	if len(env) == 0 {
		return "echo 'No vars set'", nil
	}

	var res string
	if pamCompatible || dotEnvCompatible {
		res = ""
	} else {
		res = "export"
	}

	previouslyLoadedByVar := map[string]bool{}
	
	if os.Getenv("__ENVKEY_LOADED") != "" {
		previouslyLoaded := strings.Split(os.Getenv("__ENVKEY_LOADED"), ",")	
		for _,k := range previouslyLoaded {
			previouslyLoadedByVar[k] = true
		}
	}

	var keys []string
	var loaded []string
	for k := range env {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for i, k := range keys {
		v := env[k]
		var key, val string

		if pamCompatible {
			// Remove newlines. Leave quotes alone.
			key = strings.Replace(k, "\n", "", -1)
		} else {
			// Quote quotes.
			key = strings.Replace(k, "'", `'"'"'`, -1)
		}

		if !force && !previouslyLoadedByVar[k] && os.Getenv(k) != "" {
			continue
		} else {
			loaded = append(loaded, k)

			if pamCompatible {
				// Remove newlines. Leave quotes alone.
				val = strings.Replace(v, "\n", "", -1)
			} else {
				// Quote quotes.
				val = strings.Replace(v, "'", `'"'"'`, -1)
			}
		}

		if pamCompatible {
			if i > 0 {
				res = res + "\n"
			}
			// Do not quote keys, but quote values.
			res = res + "export " + key + "='" + val + "'"
		} else if dotEnvCompatible {
			res = res + key + "='" + val + "'" + "\n"
		} else {
			// Quote both keys and values.
			res = res + " '" + key + "'='" + val + "'"
		}
	}

	if len(loaded) == 0 {
		return "", nil
	}

	if !pamCompatible && !dotEnvCompatible {
		sort.Strings(loaded)
		res = res + " '__ENVKEY_LOADED'='" + strings.Join(loaded,",") + "'"
	}	

	return res, nil
}

func Unload( ) string {
	res := ""
	loaded := os.Getenv("__ENVKEY_LOADED")
	if loaded == "" {
		return res
	}

	keys := strings.Split(loaded, ",")
	for _, k := range keys {
		res = res + "unset '" + k + "'; "
	}
	res = res + "unset __ENVKEY_LOADED;"

	return res
}

func ToPairs(
	env parser.EnvMap,
	previousEnv parser.EnvMap,
	includeEnviron,
	force bool,	
) []string {
	pairs := []string{}
	var loaded []string	
	var updated []string

	loadedByVar := map[string]bool{}

	if includeEnviron {
		pairs = os.Environ()
	}

	for k, v := range env {
		if !includeEnviron || force || os.Getenv(k) == "" {
			pairs = append(pairs, k+"="+v)
			loaded = append(loaded, k)
			loadedByVar[k] = true
		}
	}

	sort.Strings(loaded)
	pairs = append(pairs, "__ENVKEY_LOADED="+strings.Join(loaded,","))	

	if previousEnv != nil {
			// updated vars
		for _,k := range loaded {
			val := env[k]
			prev := previousEnv[k]

			if val != prev {
				updated = append(updated, k)
				pairs = append(pairs, "__PREV_" + k + "=" + prev)
			}
		}

		// removed vars
		for k, prev := range previousEnv {
			if !loadedByVar[k] && (!includeEnviron || force || os.Getenv(k) == "") {
				updated = append(updated, k)
				pairs = append(pairs, "__PREV_" + k + "=" + prev)
			}
		}

		sort.Strings(updated)
		pairs = append(pairs, "__ENVKEY_UPDATED="+strings.Join(updated,","))
	}	
	
	sort.Strings(pairs)
	return pairs
}
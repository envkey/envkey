package loader

import (
	"errors"
	"os"

	"github.com/envkey/envkey/public/sdks/envkey-source/env"
	"github.com/envkey/envkey/public/sdks/envkey-source/fetch"
	"github.com/envkey/envkey/public/sdks/envkey-source/parser"
)

func Load(shouldCache bool, firstAttempt bool) {
	var envkey string
	var appConfig env.AppConfig
	var overrides parser.EnvMap
	var err error

	/*
	* ENVKEY lookup order:
	*		1 - ENVKEY environment variable is set
	*		2 - .env file in current directory
	*		3 - .envkey config file in current directory {appId: string, orgId: string}
	*				+ file at ~/.envkey/apps/[appId].env (for local keys mainly)
	*	  4 - .env file at ~/.env
	 */

	envkey, appConfig, overrides = env.GetEnvkey(false, "", true, false)

	if envkey == "" {
		panic(errors.New("missing ENVKEY"))
	}

	resMap, err := fetch.FetchMap(envkey, fetch.FetchOptions{shouldCache, "", "envkeygo", "2.4.3", false, 15.0, 3, 1})

	if err != nil && err.Error() == "ENVKEY invalid" && appConfig.AppId != "" {
		// clear out incorrect ENVKEY and try again
		env.ClearAppEnvkey(appConfig.AppId)
		Load(shouldCache, false)
		return
	} else if err != nil {
		panic(err)
	}

	for k, v := range overrides {
		resMap[k] = v
	}

	for k, v := range resMap {
		if os.Getenv(k) == "" {
			os.Setenv(k, v)
		}
	}
}

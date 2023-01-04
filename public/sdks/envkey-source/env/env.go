package env

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/envkey/envkey/public/sdks/envkey-source/parser"
	"github.com/envkey/envkey/public/sdks/envkey-source/utils"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
)

type AppConfig struct {
	OrgId string `json:"orgId"`
	AppId string `json:"appId"`
}

type ErrorRes struct {
	Error string `json:"error"`
}

type LocalKeyRes struct {
	LocalKey string `json:"localKey"`
}

func GetEnvkey(verboseOutput bool, envFileOverride string, toStderr bool, localDevHost bool) (string, AppConfig, parser.EnvMap) {
	/*
	* ENVKEY lookup order:
	*		1 - ENVKEY environment variable is set
	*		2 - .env file in current directory (or --env-file override)
	*		3 - .envkey config file in current directory {appId: string, orgId: string}
	*				+ file at ~/.envkey/apps/[appId].env (for local keys mainly)
	*	  4 - .env file at ~/.env
	 */

	var envkey string
	var appConfig AppConfig
	var overrides parser.EnvMap

	envkey = os.Getenv("ENVKEY")

	if envkey != "" {
		return envkey, appConfig, overrides
	}

	envFile := ".env"
	if envFileOverride != "" {
		envFile = envFileOverride
	}
	overrides, _ = godotenv.Read(envFile)
	envkey = overrides["ENVKEY"]

	if envkey == "" {
		if verboseOutput {
			fmt.Fprintln(os.Stderr, "loading .envkey")
		}

		jsonBytes, err := os.ReadFile(".envkey")

		if err == nil {
			if verboseOutput {
				fmt.Fprintln(os.Stderr, string(jsonBytes))
			}

			err = json.Unmarshal(jsonBytes, &appConfig)
			utils.CheckError(err, toStderr)

			if verboseOutput {
				fmt.Fprintln(os.Stderr, "loaded app config")
			}

			envkey, overrides, err = EnvkeyFromAppId(appConfig.OrgId, appConfig.AppId, verboseOutput, localDevHost)
			utils.CheckError(err, toStderr)
		}
	}

	if envkey == "" && envFileOverride == "" {
		home, err := os.UserHomeDir()
		if err == nil {
			overrides, _ = godotenv.Read(filepath.Join(home, ".env"))
			envkey = overrides["ENVKEY"]
		}
	}

	return envkey, appConfig, overrides
}

func EnvkeyFromAppId(orgId string, appId string, verboseOutput bool, localDevHost bool) (string, parser.EnvMap, error) {
	_, path, err := appEnvkeyPath(appId)
	if err != nil {
		return "", parser.EnvMap{}, err
	}

	if verboseOutput {
		fmt.Fprintln(os.Stderr, "got app ENVKEY path:", path)
	}

	overrides, _ := godotenv.Read(path)
	envkey := overrides["ENVKEY"]

	if verboseOutput {
		fmt.Fprintln(os.Stderr, "loaded ENVKEY: ", envkey)
	}

	if envkey != "" {
		return envkey, overrides, nil
	}

	envkey, err = genLocalKey(orgId, appId, verboseOutput, localDevHost, 0)

	return envkey, overrides, err
}

func ClearAppEnvkey(appId string) error {
	_, path, err := appEnvkeyPath(appId)
	if err != nil {
		return err
	}
	return os.Remove(path)
}

func genLocalKey(orgId string, appId string, verboseOutput bool, localDevHost bool, numAttempt uint8) (string, error) {
	if verboseOutput {
		fmt.Fprintln(os.Stderr, "will generate local key")
	}

	cliPath, err := exec.LookPath("envkey")

	if err != nil {
		return "", nil
	}

	if verboseOutput {
		fmt.Fprintln(os.Stderr, "EnvKey CLI installed and in PATH")
	}

	name, _ := os.Hostname()

	if name == "" {
		uuidBytes, err := uuid.NewRandom()

		if err != nil {
			return "", err
		}

		name = "Auto-Generated " + uuidBytes.String()[:6]
	}

	cmd := exec.Command(
		cliPath,
		"local-keys",
		"create",
		appId,
		"development",
		name,
		"--json",
		"--auto",
	)

	jsonBytes, err := cmd.CombinedOutput()

	if verboseOutput {
		fmt.Fprintln(os.Stderr, "executed `local-keys create` command:", cmd.String(), "output:", string(jsonBytes), " error: ", err)
	}

	if err != nil {
		if len(jsonBytes) == 0 {
			return "", err
		} else {
			var errorRes ErrorRes
			err = json.Unmarshal(jsonBytes, &errorRes)

			if err != nil {
				return "", err
			}

			if strings.HasPrefix(errorRes.Error, "Authentication required") {
				if numAttempt == 0 {
					authCommand := exec.Command(
						cliPath,
						"sign-in",
						"--org-id",
						orgId,
					)

					authCommand.Stderr = os.Stderr
					authCommand.Stdout = os.Stdout
					authCommand.Stdin = os.Stdin

					authCommand.Start()
					err := authCommand.Wait()

					if err == nil {
						return genLocalKey(orgId, appId, verboseOutput, localDevHost, numAttempt+1)
					} else {
						return "", err
					}
				}

			} else {
				return "", errors.New(errorRes.Error)
			}
		}
	}

	var localKeyRes LocalKeyRes
	err = json.Unmarshal(jsonBytes, &localKeyRes)

	if err != nil {
		return "", err
	}

	envkey := localKeyRes.LocalKey

	if localDevHost {
		envkey = envkey + "-localdev-cloud.envkey.com:2999"
	}

	err = writeLocalKey(appId, envkey)

	if err != nil {
		return "", err
	}

	return envkey, err
}

func appEnvkeyDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	dir := filepath.Join(home, ".envkey", "apps")

	return dir, nil
}

func appEnvkeyPath(appId string) (string, string, error) {
	dir, err := appEnvkeyDir()
	if err != nil {
		return "", "", err
	}

	path := filepath.Join(dir, appId+".env")
	return dir, path, nil
}

func writeLocalKey(appId, envkey string) error {
	dir, path, err := appEnvkeyPath(appId)

	if err != nil {
		return err
	}

	err = os.MkdirAll(dir, 0700)

	if err != nil {
		return err
	}

	body := []byte("ENVKEY=" + envkey)

	return ioutil.WriteFile(path, body, 0600)
}

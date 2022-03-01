package env

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/envkey/envkey/public/sdks/envkey-source/utils"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"github.com/mitchellh/go-homedir"
)

type AppConfig struct {
	AppId string `json:"appId"`
}

type LocalKeyRes struct {
	LocalKey string `json:"localKey"`
}

func GetEnvkey(verboseOutput bool, envFileOverride string, toStderr bool, localDevHost bool) (string, AppConfig) {
	/*
	* ENVKEY lookup order:
	*		1 - ENVKEY environment variable is set
	*		2 - .env file in current directory
	*		3 - .envkey config file in current directory {appId: string, orgId: string}
	*				+ file at ~/.envkey/apps/[appId].env (for local keys mainly)
	*	  4 - .env file at ~/.env
	 */

	var envkey string
	var appConfig AppConfig

	if os.Getenv("ENVKEY") != "" {
		envkey = os.Getenv("ENVKEY")
	} else {
		envFile := ".env"
		if envFileOverride != "" {
			envFile = envFileOverride
		}
		godotenv.Load(envFile)
		envkey = os.Getenv("ENVKEY")
	}

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

			envkey, err = EnvkeyFromAppId(appConfig.AppId, verboseOutput, localDevHost)
			utils.CheckError(err, toStderr)
		}
	}

	if envkey == "" && envFileOverride == "" {
		home, err := homedir.Dir()
		if err != nil {
			godotenv.Load(filepath.Join(home, ".env"))
			envkey = os.Getenv("ENVKEY")
		}
	}

	return envkey, appConfig
}

func EnvkeyFromAppId(appId string, verboseOutput bool, localDevHost bool) (string, error) {
	_, path, err := appEnvkeyPath(appId)
	if err != nil {
		return "", err
	}

	if verboseOutput {
		fmt.Fprintln(os.Stderr, "got app ENVKEY path:", path)
	}

	envMap, err := godotenv.Read(path)

	var envkey string

	if err == nil {
		envkey = envMap["ENVKEY"]
	}

	if verboseOutput {
		fmt.Fprintln(os.Stderr, "loaded ENVKEY: ", envkey)
	}

	if envkey != "" {
		return envkey, nil
	}

	return genLocalKey(appId, verboseOutput, localDevHost)
}

func ClearAppEnvkey(appId string) error {
	_, path, err := appEnvkeyPath(appId)
	if err != nil {
		return err
	}
	return os.Remove(path)
}

func genLocalKey(appId string, verboseOutput bool, localDevHost bool) (string, error) {
	if verboseOutput {
		fmt.Fprintln(os.Stderr, "will generate local key")
	}

	cliPath, err := exec.LookPath("envkey")

	if err != nil {
		return "", errors.New("EnvKey CLI isn't installed or isn't in PATH")
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
		fmt.Fprintln(os.Stderr, "executed `local-keys create` command. output:", string(jsonBytes), " error: ", err)
	}

	if err != nil {
		return "", err
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
	home, err := homedir.Dir()
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

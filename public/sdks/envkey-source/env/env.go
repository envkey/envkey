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

func GetEnvkey(verboseOutput bool, envFilePath string, toStderr bool, localDevHost bool) (string, AppConfig, parser.EnvMap) {
	/*
			* ENVKEY lookup order:
			*		1 - ENVKEY environment variable is set
			*   2 - --env-file override is set
			*		3 - A - .env file in current or parent directory
			*
		  *				-- OR --
			*
			*				B - .envkey config file in current or parent directory {appId: string, orgId: string}
			*						+ file at ~/.envkey/apps/[appId].env (for local keys mainly)
			*
			*				Whichever is closer to current directory wins -- .env file takes precendence if both are
			*		    same depth.
			*	  4 - .env file at ~/.env
	*/

	// If .env file is found in current or parent directory but contains no ENVKEY,
	// overrides will still be applied.
	// Exception 1: environment variables set directly in the shell will still take precedence.
	// Exception 2: if a .envkey file is found, won't look any higher that that in the directory tree for a .env file.

	var envkey string
	var appConfig AppConfig
	var envFileOverrides parser.EnvMap
	var configDirOverrides parser.EnvMap
	var envFileDepth uint8
	var envkeyFileDepth uint8
	var envkeyFileJsonBytes []byte
	var err error

	preloadEnvkey := os.Getenv("ENVKEY")

	if envFilePath == "" {
		envFileOverrides, envFileDepth, _ = ReadEnvFileFromCwdUpwards(verboseOutput)
	} else {
		envFileOverrides, err = godotenv.Read(envFilePath)
		if err != nil {
			utils.CheckError(errors.New("--env-file not found"), toStderr)
		}

		if preloadEnvkey != "" {
			if verboseOutput {
				fmt.Fprintln(os.Stderr, "using ENVKEY environment var")
			}
			return preloadEnvkey, appConfig, envFileOverrides
		}
	}

	overridesEnvkey := envFileOverrides["ENVKEY"]

	envkeyFileJsonBytes, envkeyFileDepth, _ = ReadFileFromCwdUpwards(".envkey", verboseOutput)
	json.Unmarshal(envkeyFileJsonBytes, &appConfig)

	useEnvOverridesForENVKEY := false
	applyEnvOverrides := false

	if envFilePath != "" || (envFileDepth < envkeyFileDepth && overridesEnvkey != "") {
		useEnvOverridesForENVKEY = true
		applyEnvOverrides = true
	} else if envFileDepth > envkeyFileDepth || overridesEnvkey == "" {
		useEnvOverridesForENVKEY = false
		applyEnvOverrides = envFileDepth <= envkeyFileDepth
	} else if envFileDepth == envkeyFileDepth {
		useEnvOverridesForENVKEY = overridesEnvkey != ""
		applyEnvOverrides = true
	}

	if useEnvOverridesForENVKEY {
		if verboseOutput {
			fmt.Fprintln(os.Stderr, "using ENVKEY from", strings.Repeat("../", int(envFileDepth))+".env")
		}

		envkey = overridesEnvkey
	} else if preloadEnvkey != "" {
		if verboseOutput {
			fmt.Fprintln(os.Stderr, "using ENVKEY environment var")
		}
		envkey = preloadEnvkey
	} else if appConfig != (AppConfig{}) {
		if verboseOutput {
			fmt.Fprintln(os.Stderr, "using app config file", strings.Repeat("../", int(envkeyFileDepth))+".envkey")
		}

		envkey, configDirOverrides, err = EnvkeyFromAppId(appConfig.OrgId, appConfig.AppId, verboseOutput, localDevHost)
		utils.CheckError(err, toStderr)
	}

	if envkey == "" && envFilePath == "" {
		home, err := os.UserHomeDir()
		if err == nil {
			if verboseOutput {
				fmt.Fprintln(os.Stderr, "checking for $HOME/.env")
			}
			envFileOverrides, _ = godotenv.Read(filepath.Join(home, ".env"))
			envkey = envFileOverrides["ENVKEY"]
			applyEnvOverrides = true
		}
	}

	// merge overrides
	combinedOverrides := parser.EnvMap{}
	for k, v := range configDirOverrides {
		combinedOverrides[k] = v
	}
	if applyEnvOverrides {
		for k, v := range envFileOverrides {
			combinedOverrides[k] = v
		}
	}

	return envkey, appConfig, combinedOverrides
}

func EnvkeyFromAppId(orgId string, appId string, verboseOutput bool, localDevHost bool) (string, parser.EnvMap, error) {
	_, path, err := appEnvkeyPath(appId)
	if err != nil {
		return "", parser.EnvMap{}, err
	}

	if verboseOutput {
		fmt.Fprintln(os.Stderr, "got app env path:", path)
	}

	overrides, err := godotenv.Read(path)

	if err != nil {
		if verboseOutput {
			fmt.Fprintln(os.Stderr, "failed to load "+path+":", err)
		}
	}

	if verboseOutput {
		fmt.Fprintln(os.Stderr, "loaded "+path)
	}

	envkey := overrides["ENVKEY"]

	if verboseOutput {
		fmt.Fprintln(os.Stderr, "loaded ENVKEY from "+path)
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

				return "", errors.New("Error generating local key")
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

func ReadFileFromCwdUpwards(filename string, verboseOutput bool) ([]byte, uint8, error) {
	cwd, err := os.Getwd()

	if err != nil {
		return nil, 0, err
	}

	var depth uint8 = 0
	for {
		path := filepath.Join(cwd, filename)
		fileInfo, err := os.Stat(path)

		if err != nil && !os.IsNotExist(err) {
			return nil, 0, err
		}

		if err == nil && !fileInfo.IsDir() {
			file, err := os.Open(path)

			if err == nil {
				defer file.Close()

				if verboseOutput {
					fmt.Fprintln(os.Stderr, "found file "+filename+" at "+path)
				}

				res, err := ioutil.ReadAll(file)
				return res, depth, err
			}
		}

		if cwd == "/" {
			return nil, 0, errors.New("File not found")
		}

		depth++
		cwd = filepath.Dir(cwd)
	}
}

func ReadEnvFileFromCwdUpwards(verboseOutput bool) (parser.EnvMap, uint8, error) {
	cwd, err := os.Getwd()

	if err != nil {
		return nil, 0, err
	}

	var depth uint8 = 0
	for {
		path := filepath.Join(cwd, ".env")
		envMap, err := godotenv.Read(path)

		if err == nil {
			if verboseOutput {
				fmt.Fprintln(os.Stderr, "found .env file at "+path)
			}

			return envMap, depth, nil
		}

		if cwd == "/" {
			return nil, 0, errors.New("File not found")
		}

		depth++
		cwd = filepath.Dir(cwd)
	}
}

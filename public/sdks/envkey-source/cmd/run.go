package cmd

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/envkey/envkey/public/sdks/envkey-source/daemon"
	"github.com/envkey/envkey/public/sdks/envkey-source/env"
	"github.com/envkey/envkey/public/sdks/envkey-source/fetch"
	"github.com/envkey/envkey/public/sdks/envkey-source/parser"
	"github.com/envkey/envkey/public/sdks/envkey-source/shell"
	"github.com/envkey/envkey/public/sdks/envkey-source/utils"
	"github.com/envkey/envkey/public/sdks/envkey-source/version"
	"github.com/mitchellh/go-homedir"
	"github.com/spf13/cobra"
	"gopkg.in/natefinch/lumberjack.v2"
)

var ClientLogEnabled = false
var execCmdArg = ""

func run(cmd *cobra.Command, args []string, firstAttempt bool) {
	if printVersion {
		fmt.Println(version.Version)
		return
	}

	if killDaemon {
		daemon.Stop()
		return
	}

	if daemonMode {
		daemon.InlineStart()
		return
	}

	if shellHook != "" {
		shell.Hook(shellHook)
		return
	}

	if unset {
		fmt.Println(shell.Unload())
		return
	}

	initClientLogging()

	if len(args) > 0 && strings.TrimSpace(args[0]) != "" {
		execCmdArg = strings.Join(args, " ")
	}

	if (clientNameArg != "" && clientVersionArg == "") ||
		(clientVersionArg != "" && clientNameArg == "") {
		utils.Fatal("if one of --client-name or --client-version is set, the other must also be set", execCmdArg == "")
	}

	var envkey string
	var appConfig env.AppConfig
	var err error
	/*
	* ENVKEY lookup order:
	* 	1 - Argument passed via command line
	*		2 - ENVKEY environment variable is set
	*		3 - .env file in current directory
	*		4 - .envkey config file in current directory {appId: string, orgId: string}
	*				+ file at ~/.envkey/apps/[appId].env (for local keys mainly)
	*	  5 - .env file at ~/.env
	 */

	envkey, appConfig = env.GetEnvkey(verboseOutput, envFileOverride, execCmdArg == "", localDevHost)

	if envkey == "" {
		if execCmdArg != "" {
			cmd.Help()
			os.Exit(0)
		} else if ignoreMissing {
			os.Exit(0)
		} else {
			utils.Fatal("ENVKEY missing\n", execCmdArg == "")
		}
	}

	if verboseOutput {
		fmt.Fprintln(os.Stderr, "loaded ENVKEY")
	}

	var clientName string
	var clientVersion string

	if clientNameArg != "" && clientVersion != "" {
		clientName = clientNameArg
		clientVersion = clientVersionArg
	} else {
		clientName = "envkey-source"
		clientVersion = version.Version
	}

	var res parser.EnvMap

	fetchOpts := fetch.FetchOptions{shouldCache, cacheDir, clientName, clientVersion, verboseOutput, timeoutSeconds, retries, retryBackoff}

	if memCache || onChangeCmdArg != "" || (execCmdArg != "" && watch) {
		daemon.LaunchDetachedIfNeeded(daemon.DaemonOptions{
			verboseOutput,
		})
		res, _, err = daemon.FetchMap(envkey, clientName, clientVersion)

		if err != nil {

			res, err = fetch.FetchMap(envkey, fetchOpts)
		}
	} else {
		res, err = fetch.FetchMap(envkey, fetchOpts)
	}

	if err != nil && err.Error() == "ENVKEY invalid" && appConfig.AppId != "" && firstAttempt {
		// clear out incorrect ENVKEY and try again
		env.ClearAppEnvkey(appConfig.AppId)
		run(cmd, args, false)
		return
	}

	utils.CheckError(err, execCmdArg == "")

	execWithEnv(envkey, res, clientName, clientVersion)
}

func initClientLogging() {
	home, err := homedir.Dir()
	if err != nil {
		return
	}

	logDir := filepath.Join(home, ".envkey", "logs")
	err = os.MkdirAll(logDir, os.ModePerm)
	if err != nil {
		return
	}

	log.SetOutput(&lumberjack.Logger{
		Filename:   filepath.Join(logDir, "envkey-source-client.log"),
		MaxSize:    25, // megabytes
		MaxBackups: 3,
		MaxAge:     30, //days
		Compress:   false,
	})

	ClientLogEnabled = true
}

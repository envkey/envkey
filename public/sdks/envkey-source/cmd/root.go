// Copyright © 2022 Envkey Inc. <support@envkey.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/envkey/envkey/public/sdks/envkey-source/daemon"
	"github.com/envkey/envkey/public/sdks/envkey-source/env"
	"github.com/envkey/envkey/public/sdks/envkey-source/fetch"
	"github.com/envkey/envkey/public/sdks/envkey-source/parser"	
	"github.com/envkey/envkey/public/sdks/envkey-source/shell"
	"github.com/envkey/envkey/public/sdks/envkey-source/version"

	"github.com/joho/godotenv"
	"github.com/goware/prefixer"
	colors "github.com/logrusorgru/aurora/v3"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v2"
	"github.com/mitchellh/go-homedir"
)

type AppConfig struct {
	AppId string `json:"appId"`
}

var cacheDir string
var envFileOverride string
var shouldCache bool
var force bool
var printVersion bool
var pamCompatible bool
var dotEnvCompatible bool
var verboseOutput bool
var timeoutSeconds float64
var retries uint8
var retryBackoff float64

var localDevHost bool

var daemonMode bool
var killDaemon bool
var execCmd string
var watch bool
var onChangeCmd string
var watchVars []string
var memCache bool

var shellHook string
var ignoreMissing bool
var unset bool

var jsonFormat bool
var yamlFormat bool

// RootCmd represents the base command when called without any subcommands
var RootCmd = &cobra.Command{
	Use:   use,
	Short: "Cross-platform integration tool to load an EnvKey environment in development or on a server.",
	Run:   run,
}

// Execute adds all child commands to the root command and sets flags appropriately.
// This is called by main.main(). It only needs to happen once to the rootCmd.
func Execute() {
	if err := RootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

func fatal(msg string) {
	if execCmd == "" {
		fmt.Fprintf(os.Stderr, msg)
	} else {
		fmt.Println("echo 'error: " + msg + "'; false")
	}
	os.Exit(1)
}

func checkError(err error) {
	if err != nil {
		fatal(err.Error())
	}
}

func run(cmd *cobra.Command, args []string) {
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

	var envkey string
	var err error
	var appConfig AppConfig

	/*
	* ENVKEY lookup order:
	* 	1 - Argument passed via command line
	*		2 - ENVKEY environment variable is set
	*		3 - .env file in current directory
	*		4 - .envkey config file in current directory {appId: string, orgId: string}
	*				+ file at ~/.envkey/apps/[appId].env (for local keys mainly)
	*	  5 - .env file at ~/.env
	*/

	if len(args) > 0 {
		envkey = args[0]
	} else if (os.Getenv("ENVKEY") != ""){
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
			checkError(err)

			if verboseOutput {
				fmt.Fprintln(os.Stderr, "loaded app config")
			}

			envkey, err = env.EnvkeyFromAppId(appConfig.AppId, verboseOutput, localDevHost)
			checkError(err)
		}
	}

	if envkey == "" && envFileOverride == "" {
		home, err := homedir.Dir()
		if err != nil {
			godotenv.Load(filepath.Join(home, ".env"))
			envkey = os.Getenv("ENVKEY")
		}		
	}

	if envkey == "" {
		if execCmd != "" {
			cmd.Help()
			os.Exit(0)
		} else if ignoreMissing {
			os.Exit(0)
		} else {
			fatal("ENVKEY missing")
		}
	}

	if verboseOutput {
		fmt.Fprintln(os.Stderr, "loaded ENVKEY")
	}

	var res parser.EnvMap

	fetchOpts := fetch.FetchOptions{shouldCache, cacheDir, "envkey-source", version.Version, verboseOutput, timeoutSeconds, retries, retryBackoff}


	if memCache || onChangeCmd != "" || (execCmd != "" && watch) {
		daemon.LaunchDetachedIfNeeded(daemon.DaemonOptions{
			verboseOutput,
		})
		res, _, err = daemon.FetchMap(envkey, "envkey-source", version.Version)

		if err != nil {
			res, err = fetch.FetchMap(envkey, fetchOpts)
		}
	} else {		
		res, err = fetch.FetchMap(envkey, fetchOpts)
	}

	if err != nil && err.Error() == "ENVKEY invalid" && appConfig.AppId != "" {
		// clear out incorrect ENVKEY and try again
		env.ClearAppEnvkey(appConfig.AppId)
		run(cmd, args)
		return
	}

	checkError(err)

	execWithEnv(envkey, res)
}

func execute(c string, env []string, copyOrAttach string, includeStdin bool, copyOutputPrefix string) *exec.Cmd {
	command := exec.Command("bash", "-c", c)
	command.Env = env

	if copyOrAttach == "copy" {
		outPipe, err := command.StdoutPipe()
		checkError(err)
		errPipe, err := command.StderrPipe()
		checkError(err)

		var inPipe io.WriteCloser
		if includeStdin {
			inPipe, err = command.StdinPipe()
			checkError(err)
		}

		checkError(err)

		go io.Copy(os.Stdout, prefixer.New(outPipe, copyOutputPrefix))
		go io.Copy(os.Stderr, prefixer.New(errPipe, copyOutputPrefix))

		if includeStdin {
			go io.Copy(inPipe, os.Stdin)
		}
	} else if copyOrAttach == "attach" {
		command.Stdout = os.Stdout
		command.Stderr = os.Stderr

		if includeStdin {
			command.Stdin = os.Stdin
		}
	}

	err := command.Start()
	checkError(err)

	return command
}

var restarting = false

func execWithEnv(envkey string, env parser.EnvMap) {
	if execCmd == "" && onChangeCmd == "" {
		var res string
		var err error

		if jsonFormat {
			res, err = env.ToJson()
		} else if yamlFormat {
			var yamlBytes []byte
			yamlBytes, err = yaml.Marshal(&env)
			res = string(yamlBytes)
		} else {
			res, err = shell.Source(env, force, pamCompatible, dotEnvCompatible)
		}
		
		checkError(err)
		fmt.Println(res)
		
		os.Exit(0)
	}

	var command *exec.Cmd

	execFn := func(latestEnv parser.EnvMap, previousEnv parser.EnvMap, onFinish func()) {
		command = execute(execCmd, shell.ToPairs(latestEnv, previousEnv, true, force), "attach", true, "")
		command.Wait()

		if onFinish != nil {
			onFinish()
		}
	}

	if onChangeCmd != "" || (execCmd != "" && watch) {
		go execFn(
			env,
			nil,
			func() {
				if !restarting {
					var msg string
					if execCmd != "" {
						msg = " | command finished--waiting for changes..."
					} else if (onChangeCmd != ""){
						msg = " | waiting for changes..."
					}
					fmt.Fprintln(os.Stderr, daemon.FormatTerminal(msg, nil))
				}
			},
		)
	} else {
		execFn(env, nil, nil)
		return
	}

	var onChange func(parser.EnvMap, parser.EnvMap)

	onChange = func(updatedEnv parser.EnvMap, previousEnv parser.EnvMap) {
		if (watchVars != nil && len(watchVars) > 0){
			watchVarChanged := false
			for _, k := range watchVars {
				trimmed := strings.TrimSpace(k)
        if (updatedEnv[trimmed] != previousEnv[trimmed]){
					watchVarChanged = true
					break
				}
			}
			if !watchVarChanged {
				return
			}
		}

		if onChangeCmd != "" {
			go func() {
				fmt.Fprintln(os.Stderr, daemon.FormatTerminal(" | executing on-change...", colors.Cyan))
				command = execute(
					onChangeCmd,
					shell.ToPairs(updatedEnv, previousEnv, true, force),
					"copy",
					false,
					daemon.FormatTerminal(" | on-change > ", colors.Cyan),
				)
				command.Wait()
				fmt.Fprintln(os.Stderr, daemon.FormatTerminal(" | on-change finished--waiting for changes...", colors.Cyan))
			}()
		}

		if execCmd != "" && watch {
			go func() {
				fmt.Fprintln(os.Stderr, daemon.FormatTerminal(" | restarting after update...", nil))

				// ignore error since process may already have finished
				restarting = true
				command.Process.Kill()
				restarting = false

				execFn(
					updatedEnv,
					previousEnv,
					func() {
						if !restarting {
							fmt.Fprintln(os.Stderr, daemon.FormatTerminal(" | command finished--waiting for changes...", nil))
						}
					},
				)
			}()
		}
	}

	daemon.ListenChange(envkey, "envkey-source", version.Version, onChange)
}

func init() {
	RootCmd.Flags().StringVarP(&execCmd, "exec", "e", "","command to execute with EnvKey environment (default is none)")
	RootCmd.Flags().BoolVarP(&watch, "watch", "w", false, "re-run --exec command whenever environment is updated (default is false)")
	RootCmd.Flags().StringVarP(&onChangeCmd, "on-reload", "r", "", "command to execute when environment is updated (default is none)")
	RootCmd.Flags().StringSliceVar(&watchVars, "only", nil, "when using -w or -r, reload only when specific vars change (comma-delimited list)")
	RootCmd.Flags().BoolVarP(&force, "force", "f", false, "overwrite existing environment variables and/or other entries in .env file")		
	RootCmd.Flags().StringVar(&envFileOverride, "env-file", "", "Explicitly set path to ENVKEY-containing .env file (optional)")

	RootCmd.Flags().StringVar(&shellHook, "hook", "", "hook for shell config to automatically sync when entering directory")
	RootCmd.Flags().BoolVar(&killDaemon, "kill", false, "kills watcher daemon process if it's running")
	RootCmd.Flags().BoolVar(&unset, "unset", false, "unset all EnvKey vars in the current shell (example: eval $(envkey-source --unset))")
	RootCmd.Flags().BoolVar(&ignoreMissing, "ignore-missing", false, "don't output an error if an ENVKEY or .envkey file is missing")

	RootCmd.Flags().BoolVar(&shouldCache, "cache", false, "cache encrypted config on disk as a local backup for offline work (default is false)")
	RootCmd.Flags().StringVar(&cacheDir, "cache-dir", "", "cache directory (default is $HOME/.envkey/cache)")
	RootCmd.Flags().BoolVar(&memCache, "mem-cache", false, "keep in-memory cache up-to-date in realtime for zero latency (default is false)")	
	
	RootCmd.Flags().BoolVar(&verboseOutput, "verbose", false, "print verbose output (default is false)")
	RootCmd.Flags().Float64Var(&timeoutSeconds, "timeout", 20.0, "timeout in seconds for http requests")
	RootCmd.Flags().Uint8Var(&retries, "retries", 3, "number of times to retry requests on failure")
	RootCmd.Flags().Float64Var(&retryBackoff, "retry-backoff", 1, "retry backoff factor: {retry-backoff} * (2 ^ {retries - 1})")

	// differences between bash syntax and the /etc/environment format, as parsed by PAM
	// (https://github.com/linux-pam/linux-pam/blob/master/modules/pam_env/pam_env.c#L194)
	// - one variable per line
	// - "export " prefix is allowed, and has no effect
	// - cannot quote the variable name
	// - can quote the variable value
	//   (but this has no effect - there are no special sequences that need to be escaped)
	// - embedded quotes in values are treated as any other character (so should not be escaped)
	// - embedded newlines in values will disappear
	//   (a single backslash "escapes" the newline for parsing purposes, but in the actual
	//   environment the newline will not appear)
	RootCmd.Flags().BoolVar(&pamCompatible, "pam-compatible", false, "change output format to be compatible with /etc/environment on Linux")
	RootCmd.Flags().BoolVar(&dotEnvCompatible, "dot-env-compatible", false, "change output to .env format")


	RootCmd.Flags().BoolVar(&daemonMode, "daemon", false, "")
	RootCmd.Flags().MarkHidden(("daemon"))

	RootCmd.Flags().BoolVar(&localDevHost, "dev", false, "")
	RootCmd.Flags().MarkHidden(("dev"))	

	RootCmd.Flags().BoolVar(&jsonFormat, "json", false, "change output to json format")
	RootCmd.Flags().BoolVar(&yamlFormat, "yaml", false, "change output to yaml format")

	RootCmd.Flags().BoolVarP(&printVersion, "version", "v", false, "prints the version")
}

var use = `
If you haven't yet, first check out the Integration Quickstart: https://docs-v2.envkey.com/docs/integration-quickstart

To execute a command directly with your EnvKey environment set:

envkey-source -e 'command' [flags]

To automatically re-run the command when the environment changes, use:

envkey-source -e 'command' -w

You can run a different command when the environment changes instead:

envkey-source -e 'command' -r 'reload-command'

Or run a command *only* when the environment changes:

envkey-source -r 'reload-command'

With either -w or -r, you can reload only when specific variables change:

envkey-source -e 'command' -w --only SOME_VAR,ANOTHER_VAR

Your EnvKey variables are available to use in both -e and -r. Just be sure to use **single quotes** instead of double quotes (with double quotes, variables will resolve *before* envkey-source loads your config).

Will work:

envkey-source -e 'echo $SOME_VAR' -w

Won't work:

envkey-source -e "echo $SOME_VAR" -w

When using the -w or -r flags, you can see the **previous** value of an EnvKey environment variable after a reload by prefixing it with __PREV_:

envkey-source -e 'echo "initial value: $SOME_VAR"' -r 'echo "previous value: $__PREV_SOME_VAR | new value: $SOME_VAR"'

You can set your EnvKey environment in the current shell:
	
eval "$(envkey-source [flags])"

Or output your environment variables to a file:

envkey-source --dot-env-compatible > .env
envkey-source --pam-compatible > /etc/environment

You can pass an ENVKEY directly (not recommended for real workflows):

envkey-source ENVKEY -e 'command' [flags]
eval "$(envkey-source ENVKEY [flags])"

You can automatically set your EnvKey environment whenever you enter an EnvKey-enabled directory. Add the following to your shell config for each shell type.

bash (~/.bashrc or ~/.bash_profile):
eval "$(envkey-source --hook bash)"

zsh (~/.zshrc):
eval "$(envkey-source --hook zsh)"
`

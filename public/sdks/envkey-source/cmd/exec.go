package cmd

import (
	"io"
	"log"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/envkey/envkey/public/sdks/envkey-source/daemon"
	"github.com/envkey/envkey/public/sdks/envkey-source/parser"
	"github.com/envkey/envkey/public/sdks/envkey-source/shell"
	"github.com/envkey/envkey/public/sdks/envkey-source/utils"
	"github.com/goware/prefixer"
	colors "github.com/logrusorgru/aurora/v3"
	"gopkg.in/yaml.v2"
)

var stdoutLogger = log.New(os.Stdout, "", 0)
var stderrLogger = log.New(os.Stderr, "", 0)

var killingWatch = false
var throttlingChanges = false

var changeQueued []parser.EnvMap

var watchCommand *exec.Cmd

var mutex sync.Mutex

func execWithEnv(envkey string, env parser.EnvMap, clientName string, clientVersion string) {
	if execCmdArg == "" && onChangeCmdArg == "" {
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

		utils.CheckError(err, execCmdArg == "")
		stdoutLogger.Println(res)

		os.Exit(0)
	}

	execFn := func(latestEnv parser.EnvMap, previousEnv parser.EnvMap, onFinish func(), runSync bool) {
		fn := func() {
			watchCommand = execute(execCmdArg, shell.ToPairs(latestEnv, previousEnv, true, force), "attach", true, "")
			watchCommand.Wait()
		}

		if runSync {
			fn()
		} else {
			go fn()
		}

		if onFinish != nil {
			onFinish()
		}
	}

	if onChangeCmdArg != "" || (execCmdArg != "" && watch) {
		execFn(
			env,
			nil,
			func() {
				if !isKillingWatch() {
					var msg string
					if execCmdArg != "" {
						msg = " | executing command and waiting for changes..."
					} else {
						msg = " | waiting for changes..."
					}

					stderrLogger.Println(utils.FormatTerminal(msg, nil))
				}
			},
			false,
		)
	} else {
		execFn(env, nil, nil, true)
		return
	}

	var onChange func(updatedEnv parser.EnvMap, previousEnv parser.EnvMap)
	onChange = func(updatedEnv parser.EnvMap, previousEnv parser.EnvMap) {
		if isThrottlingChanges() {
			setChangeQueued([]parser.EnvMap{updatedEnv, previousEnv})
			return
		}

		setIsThrottlingChanges(true)
		go func() {
			time.Sleep(time.Duration(watchThrottle) * time.Millisecond)
			queued := getChangeQueued()
			setChangeQueued(nil)
			setIsThrottlingChanges(false)
			if queued != nil {
				onChange(queued[0], queued[1])
			}
		}()

		if watchVars != nil && len(watchVars) > 0 {
			watchVarChanged := false
			for _, k := range watchVars {
				trimmed := strings.TrimSpace(k)
				if updatedEnv[trimmed] != previousEnv[trimmed] {
					watchVarChanged = true
					break
				}
			}
			if !watchVarChanged {
				return
			}
		}

		if onChangeCmdArg != "" {
			go func() {
				stderrLogger.Println(utils.FormatTerminal(" | executing on-reload...", colors.Cyan))

				execute(
					onChangeCmdArg,
					shell.ToPairs(updatedEnv, previousEnv, true, force),
					"copy",
					false,
					utils.FormatTerminal(" | on-reload > ", colors.Cyan),
				).Wait()

				stderrLogger.Println(utils.FormatTerminal(" | executed on-reload--waiting for changes...", colors.Cyan))
			}()
		}

		if execCmdArg != "" && watch {
			go func() {
				stderrLogger.Println(utils.FormatTerminal(" | restarting after update...", nil))

				// ignore error since process may already have finished
				setIsKillingWatch(true)
				c := getWatchCommand()
				c.Process.Kill()
				c.Process.Wait()
				setIsKillingWatch(false)

				execFn(
					updatedEnv,
					previousEnv,
					func() {
						if !isKillingWatch() {
							stderrLogger.Println(utils.FormatTerminal(" | executing command and waiting for changes...", nil))
						}
					},
					false,
				)
			}()
		}
	}

	daemon.ListenChangeWithEnv(envkey, clientName, clientVersion, onChange)
}

func execute(c string, env []string, copyOrAttach string, includeStdin bool, copyOutputPrefix string) *exec.Cmd {
	// if we're in an environment where a shell (`sh`) is defined, use that
	// so we get shell expansion/other shell features.
	// otherwise just pass the command directly to the system.
	var command *exec.Cmd
	if utils.CommandExists("sh") {
		command = exec.Command("sh", "-c", c)
	} else {
		command = exec.Command(c)
	}

	command.Env = env

	if copyOrAttach == "copy" {
		outPipe, err := command.StdoutPipe()
		utils.CheckError(err, execCmdArg == "")
		errPipe, err := command.StderrPipe()
		utils.CheckError(err, execCmdArg == "")

		var inPipe io.WriteCloser
		if includeStdin {
			inPipe, err = command.StdinPipe()
			utils.CheckError(err, execCmdArg == "")
		}

		utils.CheckError(err, execCmdArg == "")

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
	utils.CheckError(err, execCmdArg == "")

	return command
}

func isKillingWatch() bool {
	var res bool
	mutex.Lock()
	res = killingWatch
	mutex.Unlock()
	return res
}

func setIsKillingWatch(val bool) {
	mutex.Lock()
	killingWatch = val
	mutex.Unlock()
}

func isThrottlingChanges() bool {
	var res bool
	mutex.Lock()
	res = throttlingChanges
	mutex.Unlock()
	return res
}

func setIsThrottlingChanges(val bool) {
	mutex.Lock()
	throttlingChanges = val
	mutex.Unlock()
}

func getChangeQueued() []parser.EnvMap {
	var res []parser.EnvMap
	mutex.Lock()
	res = changeQueued
	mutex.Unlock()
	return res
}

func setChangeQueued(val []parser.EnvMap) {
	mutex.Lock()
	changeQueued = val
	mutex.Unlock()
}

func getWatchCommand() *exec.Cmd {
	return watchCommand
}

package cmd

import (
	"io"
	"log"
	"os"
	"os/exec"
	"runtime"
	"strings"

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
var restarting = false

func execWithEnv(envkey string, env parser.EnvMap, clientName string, clientVersion string) {
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

		utils.CheckError(err, execCmd == "")
		stdoutLogger.Println(res)

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
		execFn(
			env,
			nil,
			func() {
				if !restarting {
					var msg string
					if execCmd != "" {
						msg = " | command finished--waiting for changes..."
					} else if onChangeCmd != "" {
						msg = " | waiting for changes..."
					}
					stderrLogger.Println(utils.FormatTerminal(msg, nil))
				}
			},
		)
	} else {
		execFn(env, nil, nil)
		return
	}

	var onChange func(parser.EnvMap, parser.EnvMap)

	onChange = func(updatedEnv parser.EnvMap, previousEnv parser.EnvMap) {
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

		if onChangeCmd != "" {
			go func() {
				stderrLogger.Println(utils.FormatTerminal(" | executing on-change...", colors.Cyan))
				command = execute(
					onChangeCmd,
					shell.ToPairs(updatedEnv, previousEnv, true, force),
					"copy",
					false,
					utils.FormatTerminal(" | on-change > ", colors.Cyan),
				)
				command.Wait()
				stderrLogger.Println(utils.FormatTerminal(" | on-change finished--waiting for changes...", colors.Cyan))
			}()
		}

		if execCmd != "" && watch {
			go func() {
				stderrLogger.Println(utils.FormatTerminal(" | restarting after update...", nil))

				// ignore error since process may already have finished
				restarting = true
				command.Process.Kill()
				command.Process.Wait()
				restarting = false

				execFn(
					updatedEnv,
					previousEnv,
					func() {
						if !restarting {
							stderrLogger.Println(utils.FormatTerminal(" | command finished--waiting for changes...", nil))
						}
					},
				)
			}()
		}
	}

	daemon.ListenChangeWithEnv(envkey, clientName, clientVersion, onChange)
}

func execute(c string, env []string, copyOrAttach string, includeStdin bool, copyOutputPrefix string) *exec.Cmd {
	command := exec.Command("sh", "-c", c)
	if runtime.GOOS == "windows" {
		command = exec.Command(c)
	}

	command.Env = env

	if copyOrAttach == "copy" {
		outPipe, err := command.StdoutPipe()
		utils.CheckError(err, execCmd == "")
		errPipe, err := command.StderrPipe()
		utils.CheckError(err, execCmd == "")

		var inPipe io.WriteCloser
		if includeStdin {
			inPipe, err = command.StdinPipe()
			utils.CheckError(err, execCmd == "")
		}

		utils.CheckError(err, execCmd == "")

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
	utils.CheckError(err, execCmd == "")

	return command
}

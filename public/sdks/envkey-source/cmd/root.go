package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

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
var execCmdArg string
var watch bool
var onChangeCmdArg string
var watchVars []string
var memCache bool
var watchThrottle float64

var shellHook string
var ignoreMissing bool
var unset bool

var jsonFormat bool
var yamlFormat bool

var clientNameArg string
var clientVersionArg string

// RootCmd represents the base command when called without any subcommands
var RootCmd = &cobra.Command{
	Use:   use,
	Short: "Cross-platform integration tool to load an EnvKey environment in development or on a server.",
	Run: func(cmd *cobra.Command, args []string) {
		run(cmd, args, true)
	},
}

// Execute adds all child commands to the root command and sets flags appropriately.
// This is called by main.main(). It only needs to happen once to the rootCmd.
func Execute() {
	if err := RootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

func init() {
	RootCmd.Flags().StringVarP(&execCmdArg, "exec", "e", "", "command to execute with EnvKey environment (default is none)")
	RootCmd.Flags().BoolVarP(&watch, "watch", "w", false, "re-run --exec command whenever environment is updated (default is false)")
	RootCmd.Flags().StringVarP(&onChangeCmdArg, "on-reload", "r", "", "command to execute when environment is updated (default is none)")
	RootCmd.Flags().StringSliceVar(&watchVars, "only", nil, "when using -w or -r, reload only when specific vars change (comma-delimited list)")
	RootCmd.Flags().Float64Var(&watchThrottle, "watch-throttle-ms", 10000, "min delay between restarts or reloads when using --watch/-w or --on-reload/-r")

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
	RootCmd.Flags().BoolVar(&pamCompatible, "pam", false, "change output format to be compatible with /etc/environment on Linux")
	RootCmd.Flags().BoolVar(&dotEnvCompatible, "dot-env", false, "change output to .env format")

	RootCmd.Flags().BoolVar(&daemonMode, "daemon", false, "")
	RootCmd.Flags().MarkHidden(("daemon"))

	RootCmd.Flags().BoolVar(&localDevHost, "dev", false, "")
	RootCmd.Flags().MarkHidden(("dev"))

	RootCmd.Flags().BoolVar(&jsonFormat, "json", false, "change output to json format")
	RootCmd.Flags().BoolVar(&yamlFormat, "yaml", false, "change output to yaml format")

	RootCmd.Flags().StringVar(&clientNameArg, "client-name", "", "Client name for logging when wrapped by another SDK")
	RootCmd.Flags().StringVar(&clientVersionArg, "client-version", "", "Client version for logging when wrapped by another SDK")

	RootCmd.Flags().BoolVarP(&printVersion, "version", "v", false, "prints the version")
}

var use = `
If you haven't yet, first check out the Integration Quickstart: https://docs-v2.envkey.com/docs/integration-quickstart

To execute a command directly with your EnvKey environment set:

envkey-source -e 'command' [flags]

To type less, use the ` + "`es`" + ` alias:

es -e 'command'

To automatically re-run the command when the environment changes, use:

es -e 'command' -w

You can run a different command when the environment changes instead:

es -e 'command' -r 'reload-command'

Or run a command *only* when the environment changes:

es -r 'reload-command'

With either -w or -r, you can reload only when specific variables change:

es -e 'command' -w --only SOME_VAR,ANOTHER_VAR

Your EnvKey variables are available to use in both -e and -r. Just be sure to use **single quotes** instead of double quotes (with double quotes, variables will resolve *before* envkey-source loads your config).

Will work:

es -e 'echo $SOME_VAR' -w

Won't work:

es -e "echo $SOME_VAR" -w

When using the -w or -r flags, you can see the **previous** value of an EnvKey environment variable after a reload by prefixing it with __PREV_:

es -e 'echo "initial value: $SOME_VAR"' -r 'echo "previous value: $__PREV_SOME_VAR | new value: $SOME_VAR"'

You can set your EnvKey environment in the current shell:
	
eval "$(es [flags])"

Or output your environment variables to a file:

es --dot-env > .env
es --pam > /etc/environment
es --json > .env.json
es --yaml > .env.yaml

You can pass an ENVKEY directly (not recommended for real workflows):

es ENVKEY -e 'command' [flags]
eval "$(es ENVKEY [flags])"

You can automatically set your EnvKey environment whenever you enter an EnvKey-enabled directory. Add the following to your shell config for each shell type.

bash (~/.bashrc or ~/.bash_profile):
eval "$(es --hook bash)"

zsh (~/.zshrc):
eval "$(es --hook zsh)"
`

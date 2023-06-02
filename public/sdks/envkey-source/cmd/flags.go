package cmd

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
var watch bool
var onChangeCmdArg string
var watchVars []string
var memCache bool
var watchThrottle uint32
var rollingReload bool
var rollingPct uint8

var resolveEnvkey bool

var shellHook string
var ignoreMissing bool
var unset bool

var jsonFormat bool
var yamlFormat bool

var clientNameArg string
var clientVersionArg string

func init() {
	RootCmd.PersistentFlags().BoolP("help", "h", false, "help for envkey-source")

	RootCmd.Flags().BoolVarP(&watch, "watch", "w", false, "re-run command whenever environment is updated (default is false)")
	RootCmd.Flags().StringVarP(&onChangeCmdArg, "on-reload", "r", "", "command to execute when environment is updated (default is none)")
	RootCmd.Flags().StringSliceVar(&watchVars, "only", nil, "with -w or -r, reload only when specific vars change (comma-delimited list)")
	RootCmd.Flags().Uint32Var(&watchThrottle, "throttle", 5000, "min delay between reloads with -w, -r, or --rolling")

	RootCmd.Flags().BoolVar(&rollingReload, "rolling", false, "no-downtime rolling reloads across all connected processes with -w or -r")
	RootCmd.Flags().Uint8Var(&rollingPct, "rolling-pct", 25, "min % of connected processes to reload in each batch with --rolling")

	RootCmd.Flags().BoolVarP(&force, "force", "f", false, "overwrite existing environment variables and/or other entries in .env file")
	RootCmd.Flags().StringVar(&envFileOverride, "env-file", "", "Explicitly set path to ENVKEY-containing .env file (optional)")

	RootCmd.Flags().StringVar(&shellHook, "hook", "", "hook for shell config to automatically sync when entering directory")
	RootCmd.Flags().BoolVar(&killDaemon, "kill", false, "kills watcher daemon process if it's running")
	RootCmd.Flags().BoolVar(&unset, "unset", false, "unset all EnvKey vars in the current shell (example: eval $(envkey-source --unset))")
	RootCmd.Flags().BoolVar(&ignoreMissing, "ignore-missing", false, "don't output an error if an ENVKEY or .envkey file is missing")

	RootCmd.Flags().BoolVarP(&shouldCache, "cache", "c", false, "cache encrypted config on disk as a local backup for offline work (default is false)")
	RootCmd.Flags().StringVar(&cacheDir, "cache-dir", "", "cache directory (default is $HOME/.envkey/cache)")
	RootCmd.Flags().BoolVarP(&memCache, "mem-cache", "m", false, "keep in-memory cache up-to-date for zero latency (default is false)")

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

	RootCmd.Flags().BoolVar(&resolveEnvkey, "resolve-envkey", false, "resolve envkey to its value")
	RootCmd.Flags().MarkHidden(("resolve-envkey"))

	RootCmd.Flags().BoolVarP(&printVersion, "version", "v", false, "prints the version")
}

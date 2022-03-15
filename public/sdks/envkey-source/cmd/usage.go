package cmd

var use = `
If you haven't yet, first check out the Integration Quickstart: https://docs-v2.envkey.com/docs/integration-quickstart

To execute a shell command directly with your EnvKey environment set:

envkey-source -- any-shell-command

To type less, use the ` + "`es`" + ` alias:

es -- any-shell-command

You can reference EnvKey variables in your shell command by wrapping them in single quotes:

es -- ping '$DATABASE_URL'

To automatically re-run the command when the environment changes, use:

es -w -- ./start-server

You can run a different command when the environment changes instead:

es -r ./reload-env -- ./start-server

Or run a command *only* when the environment changes:

es -r ./on-reload

With either -w or -r, you can reload only when specific variables change:

es -w --only DATABASE_USER,DATABASE_PW -- echo '$DATABASE_USER:$DATABASE_PW' 

Your EnvKey variables are available to use in shell commands. Just be sure to wrap the variables (or the whole command) in **single quotes**, otherwise variables will resolve *before* envkey-source loads your config.

Will work:

es -- echo '$SOME_VAR'
es -- echo '$SOME_VAR' '$ANOTHER_VAR'
es -- echo 'SOME_VAR=$SOME_VAR, ANOTHER_VAR=$ANOTHER_VAR'
es 'echo $SOME_VAR'

Won't work:

es -- echo $SOME_VAR
es "echo $SOME_VAR"

When using the -w or -r flags, you can see the **previous** value of an EnvKey environment variable after a reload by prefixing it with __PREV_:

es -r 'echo "previous value: $__PREV_SOME_VAR | new value: $SOME_VAR"' -- echo 'initial value: $SOME_VAR'

You can set your EnvKey environment in the current shell:
	
eval "$(es)"

Or output your environment variables to a file:

es --dot-env > .env
es --pam > /etc/environment
es --json > .env.json
es --yaml > .env.yaml

You can automatically set your EnvKey environment whenever you enter an EnvKey-enabled directory. Add the following to your shell config for each shell type.

bash (~/.bashrc or ~/.bash_profile):
eval "$(es --hook bash)"

zsh (~/.zshrc):
eval "$(es --hook zsh)"

Use the --cache/-c flag to maintain an encrypted file-system cache for offline work:

es -c -- any-shell-command

Use the --mem-cache/-m flag to cache the latest values in memory and keep them automatically updated on changes. This avoid the latency of a request to the EnvKey host on each load, but offers less strong consistency guarantees:

es -m -- any-shell-command
`

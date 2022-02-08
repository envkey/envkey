// based on hooks from direnv: https://github.com/direnv/direnv

package shell

import ( 
	"fmt"
	"os"
)

func Hook (t string)  {
	if ( t == "bash"){
		fmt.Println(bashHook)
	} else if ( t == "zsh"){
		fmt.Println(zshHook)
	} else {
		fmt.Println("echo 'error: shell type not supported'; false")
		os.Exit(1)
	}	
}

const bashHook = `
_envkey_source_hook() {
  local previous_exit_status=$?;
  trap -- '' SIGINT;
  eval "$(envkey-source --unset)";
  eval "$(envkey-source --mem-cache --ignore-missing)";
  trap - SIGINT;
  return $previous_exit_status;
};
if ! [[ "${PROMPT_COMMAND:-}" =~ _envkey_source_hook ]]; then
  PROMPT_COMMAND="_envkey_source_hook${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
fi`

const zshHook = `
_envkey_source_hook() {
  trap -- '' SIGINT;
  eval "$(envkey-source --unset)";
  eval "$(envkey-source --mem-cache --ignore-missing)";
  trap - SIGINT;
}
typeset -ag precmd_functions;
if [[ -z "${precmd_functions[(r)_envkey_source_hook]+1}" ]]; then
  precmd_functions=( _envkey_source_hook ${precmd_functions[@]} )
fi
typeset -ag chpwd_functions;
if [[ -z "${chpwd_functions[(r)_envkey_source_hook]+1}" ]]; then
  chpwd_functions=( _envkey_source_hook ${chpwd_functions[@]} )
fi
`
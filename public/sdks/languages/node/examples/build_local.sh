# refreshes envkey npm package in js/ts testers from module in local filesystem

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

rm -rf $SCRIPT_DIR/js/node_modules $SCRIPT_DIR/ts/node_modules
(cd $SCRIPT_DIR/js && npm i && npm prune)
(cd $SCRIPT_DIR/ts && npm i && npm prune)
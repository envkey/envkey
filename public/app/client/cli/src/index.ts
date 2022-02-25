process.title = "envkey";

if (process.env.NODE_ENV == "development") {
  require("dotenv").config();
}

// yargs.version() is buggy
const requestingVersion = process.argv.find((arg) =>
  ["--version", "-v", "version"].includes(arg)
);
if (requestingVersion) {
  console.log(
    process.env.ENVKEY_CLI_BUILD_VERSION || require("../package.json").version
  );
  process.exit();
}
const requestingBuildInfo = process.argv.find((arg) => arg === "--build-info");
if (requestingBuildInfo) {
  console.log(
    new Date(
      parseInt(process.env.ENVKEY_CLI_BUILD_TIME || "0", 10) as number
    ).toISOString()
  );
  process.exit();
}

// configure marked for rendering markdown in terminal

// workaround for mismatched marked module typings
import { marked as markedImport } from "marked";
const marked = require("marked") as typeof markedImport;

const TerminalRenderer = require("marked-terminal");
marked.setOptions({
  renderer: new TerminalRenderer(),
});

import "./commands"; // ensure all commands get loaded
import * as cmd from "./cmd";

cmd.init();

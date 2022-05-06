import "source-map-support/register";
// @ts-nocheck
import yargsParser from "yargs-parser";
import { stopCore } from "./lib/core";
import { start } from "@core_proc/server";
import { log } from "@core/lib/utils/logger";

const parsed = yargsParser(process.argv.slice(2));
const port = parsed.port || "19047";
const wsport = parsed.wsport || "19048";

// This file is the entrypoint for the core process, which starts the server.
// It is its own webpack JS bundle, separate from the CLI - but it is delivered
// as a javascript file inside the CLI.

console.log("running cli_core_proc");

(async () => {
  try {
    await stopCore();
  } catch (err) {
    log("Did not stop existing core process", { err, port, wsport });
  }
  try {
    await start(port, wsport);
    log("Started core process", { port, wsport });
  } catch (err) {
    log("Did not start core process", { err, port, wsport });
  }
})();

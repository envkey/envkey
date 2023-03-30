import "source-map-support/register";
// @ts-nocheck
import yargsParser from "yargs-parser";
import { stopCore } from "./lib/core";
import { start } from "@core_proc/server";
import { log } from "@core/lib/utils/logger";
import { version as cliVersion } from "../package.json";
import cluster from "cluster";

const parsed = yargsParser(process.argv.slice(2));
const port = parsed.port || "19047";
const wsport = parsed.wsport || "19048";
const statusPort = parsed.statusPort || "19049";

// This file is the entrypoint for the core process, which starts the server.
// It is its own webpack JS bundle, separate from the CLI - but it is delivered
// as a javascript file inside the CLI.

console.log("running cli_core_proc");

(async () => {
  if (cluster.isMaster) {
    try {
      await stopCore();
    } catch (err) {
      log("Did not stop existing core process", {
        err,
        port,
        wsport,
        statusPort,
        isMaster: cluster.isMaster,
        isWorker: cluster.isWorker,
      });
    }
  }
  try {
    await start(port, wsport);
    log("Started core process", {
      port,
      wsport,
      statusPort,
      cliVersion,
      isMaster: cluster.isMaster,
      isWorker: cluster.isWorker,
    });
  } catch (err) {
    log("Did not start core process", {
      err,
      port,
      wsport,
      statusPort,
      isMaster: cluster.isMaster,
      isWorker: cluster.isWorker,
    });
  }
})();

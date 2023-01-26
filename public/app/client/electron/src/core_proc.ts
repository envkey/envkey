import { getCliBinPath, getCliCurrentVersion } from "./cli_tools";
import { log } from "@core/lib/utils/logger";
import { start } from "@core_proc/server";
import { isAlive, stop } from "@core/lib/core_proc";
import { version as cliVersion } from "../../cli/package.json";
import * as semver from "semver";
import { exec } from "child_process";

const KEEP_ALIVE_POLL_INTERVAL = 1000;

let keepAliveTimeout: ReturnType<typeof setTimeout> | undefined;

let gracefulShutdown: (onShutdown?: () => void) => void;

export const startCore = async (
  keepAlive = true,
  inlineOnly = false
): Promise<boolean> => {
  log("startCore", { keepAlive, inlineOnly });
  try {
    let alive = await isAlive();
    log("Core process status", { alive });
    if (alive) {
      if (semver.valid(alive) && semver.gt(cliVersion, alive)) {
        log(
          "Core process is running an outdated version. Stopping and retrying..."
        );
        const res = await stop();
        if (res) {
          return startCore(keepAlive);
        } else {
          throw new Error(
            "Couldn't stop EnvKey core process that is running an outdated version."
          );
        }
      } else {
        log("Core process is already running");
        return false;
      }
    }

    const [cliBinPath, cliCurrent] = await Promise.all([
      getCliBinPath(),
      getCliCurrentVersion(),
    ]);
    let error = false;

    log("", { cliBinPath, cliCurrent, cliVersion });

    let startedCore = false;

    if (
      cliBinPath &&
      cliCurrent != false &&
      semver.gte(cliCurrent, cliVersion) &&
      !inlineOnly
    ) {
      log("Starting core process daemon via CLI");

      await new Promise<void>((resolve, reject) => {
        const child = exec(
          `"${cliBinPath}" core start`,
          {
            env: {
              LOG_REQUESTS: "1",
            },
          },
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
        child.unref();
        startedCore = true;
      }).catch((err) => {
        log("Error starting core process daemon from CLI");
        error = true;
      });
    } else if (!cliBinPath) {
      log("Couldn't find CLI");
    } else {
      log("CLI is outdated for this version of UI");
    }

    if (!startedCore) {
      log("Starting core process inline");
      process.env.LOG_REQUESTS = "1";
      ({ gracefulShutdown } = await start(19047, 19048));
    }

    while (true) {
      alive = await isAlive(200);
      if (alive) {
        break;
      }
    }

    log("Successfully started core process");
    return true;
  } finally {
    if (keepAlive) {
      setTimeout(keepAliveLoop, 10000);
    }
  }
};

export const stopInlineCoreProcess = (
  onShutdown?: (stopped: boolean) => void
) => {
  if (keepAliveTimeout) {
    clearTimeout(keepAliveTimeout);
    keepAliveTimeout = undefined;
  }

  if (gracefulShutdown) {
    gracefulShutdown(() => onShutdown?.(true));
  } else if (onShutdown) {
    onShutdown(false);
  }
};

const keepAliveLoop = async () => {
  let alive = await isAlive(10000);

  // if core process died, restart
  // if core process is running an outdated version, stop it and restart
  if (!alive) {
    log("Core process died while EnvKey UI is running. Restarting now...");
    await startCore(false);
  } else if (
    typeof alive == "string" &&
    semver.valid(alive) &&
    semver.gt(cliVersion, alive)
  ) {
    log("Core process is outdated. Restarting now...");
    const res = await stop();
    if (res) {
      await startCore(false);
    } else {
      throw new Error(
        "Couldn't stop EnvKey core process that is running an outdated version."
      );
    }
  }

  keepAliveTimeout = setTimeout(keepAliveLoop, KEEP_ALIVE_POLL_INTERVAL);
};

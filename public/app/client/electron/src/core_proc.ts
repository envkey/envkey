import { log } from "@core/lib/utils/logger";
import { start } from "@core_proc/server";
import { isAlive, stop } from "@core/lib/core_proc";
import { version as cliVersion } from "../../cli/package.json";
import * as semver from "semver";

const KEEP_ALIVE_POLL_INTERVAL = 1000;

let keepAliveTimeout: ReturnType<typeof setTimeout> | undefined;

let gracefulShutdown: (onShutdown?: () => void) => void;

export const startCoreFromElectron = async (
  keepAlive = true
): Promise<boolean> => {
  try {
    let alive = await isAlive();
    log("Core process status", { alive });
    if (alive) {
      log("Core process is already running");
      return false;
    }
    log("Starting core_process inline");
    process.env.LOG_REQUESTS = "1";
    ({ gracefulShutdown } = await start(19047, 19048));

    while (true) {
      alive = await isAlive();
      if (alive) {
        break;
      }
    }

    log("Successfully started core process");
    return true;
  } finally {
    if (keepAlive) {
      keepAliveLoop();
    }
  }
};

export const stopCoreProcess = (onShutdown?: () => void) => {
  if (keepAliveTimeout) {
    clearTimeout(keepAliveTimeout);
    keepAliveTimeout = undefined;
  }

  if (gracefulShutdown) {
    gracefulShutdown(onShutdown);
  } else if (onShutdown) {
    onShutdown();
  }
};

const keepAliveLoop = async () => {
  let alive = await isAlive();

  // if core process died, restart inline
  // if core process is running an outdated version, stop it and restart inline
  if (!alive) {
    log("Core process died while EnvKey UI is running. Restarting now...");
    await startCoreFromElectron(false);
  } else if (
    typeof alive == "string" &&
    semver.valid(alive) &&
    semver.gt(alive, cliVersion)
  ) {
    log("Core process is outdated. Restarting inline now...");
    const res = await stop();
    if (res) {
      await startCoreFromElectron(false);
    } else {
      throw new Error(
        "Couldn't stop EnvKey core process that is running an outdated version."
      );
    }
  }

  keepAliveTimeout = setTimeout(keepAliveLoop, KEEP_ALIVE_POLL_INTERVAL);
};

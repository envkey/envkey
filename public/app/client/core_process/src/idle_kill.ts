import { Client } from "@core/types";
import { log } from "@core/lib/utils/logger";
import { wait } from "@core/lib/utils/wait";

const IDLE_KILL_INTERVAL = 1000 * 60 * 1; // 1 minute
const IDLE_KILL_LIMIT = 1000 * 60 * 55; // 55 minutes
const IDLE_KILL_DELAY = 1000 * 60 * 5; // 5 minutes

let killIdleTimeout: NodeJS.Timeout | undefined;

export const killIfIdleLoop = async (
  store: Client.ReduxStore,
  execKillIfIdle = false
) => {
  let procState = store.getState();
  if (procState.locked) {
    return;
  }

  if (execKillIfIdle) {
    try {
      await killIfIdle(store);
    } catch (err) {
      log("Error killing after idle limit:", { err });
    }
  }

  killIdleTimeout = setTimeout(
    () => killIfIdleLoop(store, true),
    IDLE_KILL_INTERVAL
  );
};

export const clearKillIfIdleTimeout = () => {
  if (killIdleTimeout) {
    clearTimeout(killIdleTimeout);
  }
};

const killIfIdle = async (store: Client.ReduxStore, afterDelay = false) => {
  let procState = store.getState();

  if (!procState.lastActiveAt) {
    return;
  }

  if (afterDelay) {
    const idleTime = Date.now() - procState.lastActiveAt;

    if (idleTime > IDLE_KILL_LIMIT) {
      log("Killing core process after idle limit", {
        idleTime,
        IDLE_KILL_LIMIT,
      });

      process.kill(process.pid, "SIGTERM");
    }
  } else {
    await wait(IDLE_KILL_DELAY);
    await killIfIdle(store, true);
  }
};

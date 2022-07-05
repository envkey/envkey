import { Client } from "@core/types";
import { log } from "@core/lib/utils/logger";

const IDLE_KILL_INTERVAL = 1000 * 60 * 1; // 1 minute
const IDLE_KILL_LIMIT = 1000 * 60 * 30; // 30 minutes

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

const killIfIdle = async (store: Client.ReduxStore) => {
  let procState = store.getState();

  if (!procState.lastActiveAt) {
    return;
  }

  const idleTime = Date.now() - procState.lastActiveAt;

  if (idleTime > IDLE_KILL_LIMIT) {
    process.kill(process.pid, "SIGTERM");
  }
};

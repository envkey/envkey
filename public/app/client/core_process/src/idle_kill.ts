import { log } from "@core/lib/utils/logger";
import { wait } from "@core/lib/utils/wait";

const IDLE_KILL_INTERVAL = 1000 * 60 * 1; // 1 minute
const IDLE_KILL_LIMIT = 1000 * 60 * 55; // 55 minutes
const IDLE_KILL_DELAY = 1000 * 60 * 5; // 5 minutes

let killIdleTimeout: NodeJS.Timeout | undefined;

let activeAt: number = Date.now();

export const updateLastActiveAt = () => {
  activeAt = Date.now();
  // log("Updated last active at", { activeAt });
};

export const killIfIdleLoop = async (execKillIfIdle = false) => {
  if (execKillIfIdle) {
    try {
      await killIfIdle();
    } catch (err) {
      log("Error killing after idle limit:", { err });
    }
  }

  killIdleTimeout = setTimeout(() => killIfIdleLoop(true), IDLE_KILL_INTERVAL);
};

export const clearKillIfIdleTimeout = () => {
  if (killIdleTimeout) {
    clearTimeout(killIdleTimeout);
  }
};

const killIfIdle = async (afterDelay = false) => {
  const idleTime = Date.now() - activeAt;

  // log("Checking if core process is idle", { idleTime, IDLE_KILL_LIMIT });

  if (idleTime > IDLE_KILL_LIMIT) {
    if (afterDelay) {
      log("Killing core process after idle limit", {
        idleTime,
        IDLE_KILL_LIMIT,
      });

      process.kill(process.pid, "SIGTERM");
    } else {
      log(
        `Core process idle limit reached, will kill after ${IDLE_KILL_DELAY}ms if still idle`
      );

      await wait(IDLE_KILL_DELAY);
      await killIfIdle(true);
    }
  }
};

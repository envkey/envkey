// Not currently used--handled by socket heartbeat logic insteads

import { log } from "@core/lib/utils/logger";
import { sendWorkerToMainMessage } from "./proc_status_worker";

/*
  This handles keeping signed in sessions up to date when the process is suspended for whatever reason (like os going to sleep), preventing sockets from receiving updates.
*/

const CHECK_SUSPENDED_INTERVAL = 1000 * 60; // 60 seconds
const SUSPENSION_MIN_DELTA = 5000;

let lastSuspendedCheckAt: number | undefined;
let checkSuspendedTimeout: NodeJS.Timeout | undefined;

export const checkSuspendedLoop = async () => {
  const now = Date.now();
  if (typeof lastSuspendedCheckAt == "number") {
    const delta = now - lastSuspendedCheckAt;
    const max = CHECK_SUSPENDED_INTERVAL + SUSPENSION_MIN_DELTA;
    if (delta > max) {
      log(
        `Process was suspended for ${delta}ms. Refreshing signed in sessions...`
      );
      sendWorkerToMainMessage({ type: "refreshSession" });
    }
  }

  lastSuspendedCheckAt = now;

  checkSuspendedTimeout = setTimeout(
    checkSuspendedLoop,
    CHECK_SUSPENDED_INTERVAL
  );
};

export const clearCheckSuspendedLoop = () => {
  if (checkSuspendedTimeout) {
    clearTimeout(checkSuspendedTimeout);
  }
};

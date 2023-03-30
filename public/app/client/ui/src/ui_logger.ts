import { ElectronWindow } from "@core/types/electron";

// send UI logs to desktop log file
declare var window: ElectronWindow;
const _log = console.log;

const logBatch: { msg: string; obj?: any[] }[] = [];
const batchInterval = 1000; // Send log batch every 1 second at most
let batchTimer: NodeJS.Timeout | null = null;

console.log = function (msg, ...opts) {
  _log.apply(console, [msg, ...opts]);
  // Add the log message to the batch
  logBatch.push({ msg, obj: opts });

  // Check if there's an existing timer; if not, create one
  if (!batchTimer) {
    batchTimer = setTimeout(() => {
      // Send the batched logs to the uiLogger
      window.electron.uiLogger(logBatch);

      // Clear the log batch and timer
      logBatch.length = 0;
      batchTimer = null;
    }, batchInterval);
  }
};

window.onerror = function (msg, url, lineNo, columnNo, error) {
  console.log("Uncaught UI Error", {
    msg,
    url,
    lineNo,
    columnNo,
    error: error?.message,
    stack: error?.stack,
  });
  throw error;
};

import { showErrorReportDialogSync } from "./report_error";
import { isIso8601 } from "./../../../core/src/lib/utils/date";
import { ipcMain } from "electron";
import { log } from "@core/lib/utils/logger";

let lastUncaughtUIErrorAt: number | undefined;
export const handleUILogger = () => {
  ipcMain.on("ui-logger", (event, logBatch: { msg: string; obj?: any[] }[]) => {
    for (let logData of logBatch) {
      let msg = logData.msg;
      if (isIso8601(msg) && logData.obj && logData.obj.length > 0) {
        logData.msg = logData.obj.shift();
        logData.obj = [
          {
            data: logData.obj.length == 1 ? logData.obj[0] : logData.obj,
            "ui-ts": msg,
          },
        ];
      }

      log(
        "[ui-console] " + logData.msg,
        (logData.obj &&
          (logData.obj.length == 1 &&
          typeof logData.obj[0] == "object" &&
          !Array.isArray(logData.obj[0])
            ? logData.obj[0]
            : {
                data: logData.obj.length == 1 ? logData.obj[0] : logData.obj,
              })) ||
          undefined
      );

      if (logData.msg == "Uncaught UI Error") {
        // show error report dialog if we get an uncaught UI error and haven't prompted for error report in the last 10 minutes
        if (
          !lastUncaughtUIErrorAt ||
          Date.now() - lastUncaughtUIErrorAt > 10 * 60 * 1000
        ) {
          lastUncaughtUIErrorAt = Date.now();
          showErrorReportDialogSync(
            `There was an uncaught error in the EnvKey UI${
              logData.obj?.[0]?.error ? `:\n\n${logData.obj?.[0]?.error}` : "."
            }`,
            undefined,
            1000
          );
        }
      }
    }
  });
};

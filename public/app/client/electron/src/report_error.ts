import { spawn } from "child_process";
import { dialog, MessageBoxSyncOptions } from "electron";
import { getWin } from "./main";
import { getCliBinPath } from "./cli_tools";
import { log } from "@core/lib/utils/logger";
import { wait } from "@core/lib/utils/wait";

export const execErrorReport = async (params: {
  cliBinPath?: string;
  reportCallDelay?: number;
  msg?: string;
  userId?: string;
  email?: string;
}) => {
  const {
    cliBinPath: cliBinPathArg,
    reportCallDelay,
    msg,
    userId,
    email,
  } = params;

  const cliBinPath = cliBinPathArg ?? (await getCliBinPath());
  if (!cliBinPath) {
    const err = "Couldn't find CLI";
    log(err);
    throw new Error(err);
  }

  log("Sending error report...");

  if (reportCallDelay) {
    await wait(reportCallDelay);
  }
  spawn(
    cliBinPath,
    [
      "core",
      "report-error",
      ...(msg ? ["--message", msg] : []),
      ...(userId ? ["--user", userId] : []),
      ...(email ? ["--email", email] : []),
    ].filter(Boolean) as string[],
    {
      detached: true,
      stdio: "ignore",
    }
  ).unref();
};

export const showErrorReportDialogSync = async (
  msgArg: string,
  cliBinPath?: string,
  reportCallDelay?: number
) => {
  const msg = `${msgArg}
        
        Sending an error report will alert EnvKey support to the problem and upload recent logs from $HOME/.envkey/logs. No sensitive data is included in these logs.

        You can also email support@envkey.com for help.
       `;

  const win = getWin();

  const ops: MessageBoxSyncOptions = {
    message: msg,
    type: "error",
    defaultId: 0,
    buttons: ["Send Error Report", "Don't Send"],
  };

  let res = 0;
  if (win) {
    res = dialog.showMessageBoxSync(win, ops);
  } else {
    res = dialog.showMessageBoxSync(ops);
  }

  if (res === 0) {
    execErrorReport({ cliBinPath, reportCallDelay });
  }
};

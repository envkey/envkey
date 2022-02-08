import { disconnect } from "./core";
import { alwaysWriteError, autoModeOut, autoModeHasWritten } from "./console_io";

export function exit(): any;
export function exit(code: 0): any;
export function exit(code: 1, exitMessage?: string): any;

export function exit(code = 0, exitMessage?: string): any {
  if (typeof exitMessage !== "undefined") {
    alwaysWriteError(exitMessage);
  } else if (code == 0 && !autoModeHasWritten()) {
    autoModeOut({});
  }
  return (
    disconnect()
      .then(() => process.exit(code))
      // If core isn't running, disconnect can cause the CLI to hang.
      .catch(() => process.exit(code))
  );
}

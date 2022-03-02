import { disconnect } from "./core";
import {
  alwaysWriteError,
  autoModeOut,
  autoModeHasWritten,
} from "./console_io";

export function exit(): any;
export function exit(code: 0): any;
export function exit(code: 1, ...exitMessages: string[]): any;

export function exit(code = 0, ...exitMessages: string[]): any {
  if (exitMessages.length > 0) {
    alwaysWriteError(...exitMessages);
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

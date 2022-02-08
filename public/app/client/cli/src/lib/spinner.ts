import ora, { Ora } from "ora";
import { isAutoMode } from "./console_io";

let s: Ora | null;

export const spinnerWithText = (text: string) => {
    if (isAutoMode()) {
      return;
    }
    s = ora({ text, spinner: "line", color: "green" });
    s.start();
  },
  spinner = () => {
    if (isAutoMode()) {
      return;
    }
    s = ora({ spinner: "line", color: "green" });
    s.start();
  },
  stopSpinner = () => {
    if (s) s.stop();
    s = null;
  };

import { ElectronWindow } from "@core/types/electron";

declare var window: ElectronWindow;

export const logAndAlertError = (msg: string, err?: any) => {
  console.error(msg, err);
  const authError = err?.error?.code == 401;

  const networkError =
    [502, 503, 504, "ENOTFOUND", "ETIMEDOUT", "TimeoutError"].includes(
      err?.error?.code
    ) ||
    err?.error?.message?.includes("ENOTFOUND") ||
    err?.error?.message?.includes("ETIMEDOUT") ||
    err?.error?.message?.includes("TimeoutError");

  if (authError) {
    alert("Your session has expired. Please sign in and try again.");
  } else if (networkError) {
    alert(
      "There was a problem reaching the server. Please check your connection and try again."
    );
  } else {
    console.log("reporting error to electron");

    window.electron.reportErrorDialog(msg);
  }
};

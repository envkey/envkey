import { log } from "@core/lib/utils/logger";
import { inspect } from "util";
import { app, dialog } from "electron";
import { getCoreProcAuthToken } from "@core/lib/client_store/key_store";
import { startCore } from "./core_proc";
import { installMissingOrOutdatedCliTools } from "./cli_tools";

export const startup = async (params: {
  onInit: (authTokenRes: string) => void;
}) => {
  installMissingOrOutdatedCliTools().catch((err) => {
    log("Problem installing missing our outdated CLI tools", { err });
  });

  startCore()
    .then(() => {
      log("core is running", {
        currentAppVersion: app.getVersion(),
      });
      return getCoreProcAuthToken();
    })
    .then(async (authTokenRes) => {
      params.onInit(authTokenRes);
    })
    .catch((err) => {
      log("app ready start from core fail", { err });
      // Without this, it is very hard to get information about a failed desktop app startup.
      dialog.showErrorBox(
        "EnvKey encountered an error on startup",
        inspect(err)
      );
    });
};

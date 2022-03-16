import { log } from "@core/lib/utils/logger";
import { inspect } from "util";
import { app, dialog } from "electron";
import { getCoreProcAuthToken } from "@core/lib/client_store/key_store";
import { startCoreFromElectron } from "./core_proc";
import {
  downloadAndInstallCliTools,
  isLatestCliInstalled,
  isLatestEnvkeysourceInstalled,
  installCliAutocomplete,
} from "./cli_tools";

export const startup = async (onInit: (authTokenRes: string) => void) => {
  startCoreFromElectron()
    .then(() => {
      log("core is running", {
        currentAppVersion: app.getVersion(),
      });
      return getCoreProcAuthToken();
    })
    .then(async (authTokenRes) => {
      onInit(authTokenRes);

      const [cliLatestInstalledRes, envkeySourceLatestInstalledRes] =
        await Promise.all([
          isLatestCliInstalled().catch((err) => <const>true),
          isLatestEnvkeysourceInstalled().catch((err) => <const>true),
        ]);

      // Installs the CLI and envkey-source on app start if
      // either is missing from the system
      // (or if only envkey-source v1 is there)
      // Otherwise will be handled by upgrades
      if (
        (cliLatestInstalledRes !== true && cliLatestInstalledRes[1] == false) ||
        (envkeySourceLatestInstalledRes !== true &&
          (envkeySourceLatestInstalledRes[1] == false ||
            envkeySourceLatestInstalledRes[1].startsWith("1.")))
      ) {
        log(
          "CLI or envkey-source not installed. Installation will be attempted in background now."
        );

        downloadAndInstallCliTools(
          {
            cli:
              cliLatestInstalledRes == true
                ? undefined
                : {
                    nextVersion: cliLatestInstalledRes[0],
                    currentVersion: cliLatestInstalledRes[1],
                  },
            envkeysource:
              envkeySourceLatestInstalledRes == true
                ? undefined
                : {
                    nextVersion: envkeySourceLatestInstalledRes[0],
                    currentVersion: envkeySourceLatestInstalledRes[1],
                  },
          },
          "install"
        )
          .then(() => {
            log("CLI tools were installed on startup");
            if (cliLatestInstalledRes !== true) {
              installCliAutocomplete()
                .then((shells) => {
                  log("CLI shell autocompletion was installed", {
                    shells: shells.filter(Boolean),
                  });
                })
                .catch((err) =>
                  log("CLI failed to install shell autocompletion", { err })
                );
            }
          })
          .catch((err) => {
            log("CLI tools failed to install on startup", { err });
          });
      }
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

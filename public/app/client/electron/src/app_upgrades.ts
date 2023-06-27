import { getWin } from "./main";
import { autoUpdater } from "electron-updater";
import { log } from "@core/lib/utils/logger";
import { app, dialog } from "electron";
import {
  listVersionsGT,
  readReleaseNotesFromS3,
} from "@infra/artifact-helpers";
import {
  ENVKEY_RELEASES_BUCKET,
  envkeyReleasesS3Creds,
} from "@infra/stack-constants";
import {
  AvailableClientUpgrade,
  ClientUpgradeProgress,
} from "@core/types/electron";
import * as R from "ramda";
import {
  isLatestCliInstalled,
  isLatestEnvkeysourceInstalled,
} from "./cli_tools";
import mkdirp from "mkdirp";
import os from "os";
import { promises as fsp } from "fs";
import path from "path";

const CHECK_INTERVAL = 10 * 60 * 1000;
const CHECK_UPGRADE_TIMEOUT = 5000;
const CHECK_UPGRADE_RETRIES = 3;
// allow looping only once
let loopInitialized = false;

let desktopVersionDownloaded: string | undefined;
let cliVersionDownloaded: string | undefined;
let envkeysourceVersionDownloaded: string | undefined;

let upgradeAvailable: AvailableClientUpgrade | undefined;

autoUpdater.logger = {
  debug: (...args) => log("autoUpdater:debug", { data: args }),
  info: (...args) => log("autoUpdater:info", { data: args }),
  warn: (...args) => log("autoUpdater:warn", { data: args }),
  error: (...args) => log("autoUpdater:error  ", { data: args }),
};
// forces releaseNotes to string[]
autoUpdater.fullChangelog = true;
autoUpdater.autoDownload = false;

app.on("ready", () => {
  autoUpdater.on("download-progress", ({ transferred, total }) => {
    const progress: ClientUpgradeProgress = {
      downloadedBytes: transferred,
      totalBytes: total,
    };

    getWin()!.webContents.send("upgrade-progress", progress);
  });
});

let checkUpgradesInterval: number | undefined;

export const runCheckUpgradesLoop = () => {
  log("init updates loop");

  if (loopInitialized) {
    log("app update loop already initialized; refusing to start again.");
    return;
  }

  // not returned
  checkUpgrade().catch((err) => {
    log("checkUpdate failed", { err });
  });

  checkUpgradesInterval = setInterval(checkUpgrade, CHECK_INTERVAL);
  loopInitialized = true;
  log("app update loop initialized");
};

export const stopCheckUpgradesLoop = () => {
  if (checkUpgradesInterval) {
    clearInterval(checkUpgradesInterval);
    checkUpgradesInterval = undefined;
  }
};

const resetUpgradesLoop = () => {
  if (checkUpgradesInterval) {
    clearInterval(checkUpgradesInterval);
  }

  checkUpgradesInterval = setInterval(checkUpgrade, CHECK_INTERVAL);
};

let checkDesktopUpgradeTimeout: NodeJS.Timeout | undefined;
export const checkUpgrade = async (
  fromContextMenu = false,
  noDispatch = false,
  numRetry = 0
): Promise<any> => {
  const currentDesktopVersion = app.getVersion();

  let checkDesktopError = false;

  const [desktopRes, cliLatestInstalledRes, envkeysourceLatestInstalledRes] =
    await Promise.all([
      autoUpdater.netSession
        .closeAllConnections()
        .then(() => {
          checkDesktopUpgradeTimeout = setTimeout(() => {
            autoUpdater.netSession.closeAllConnections();
          }, CHECK_UPGRADE_TIMEOUT);

          return autoUpdater.checkForUpdates().then((res) => {
            if (checkDesktopUpgradeTimeout) {
              clearTimeout(checkDesktopUpgradeTimeout);
            }
            return res;
          });
        })
        .catch((err) => {
          if (checkDesktopUpgradeTimeout) {
            clearTimeout(checkDesktopUpgradeTimeout);
          }

          // error gets logged thanks to logger init at top
          checkDesktopError = true;
        }),
      isLatestCliInstalled(),
      isLatestEnvkeysourceInstalled(),
    ]);

  // the autoUpdater.on("error") handler will handle re-checking
  if (checkDesktopError) {
    if (numRetry < CHECK_UPGRADE_RETRIES) {
      return checkUpgrade(fromContextMenu, noDispatch, numRetry + 1);
    } else {
      return;
    }
  }

  const nextCliVersion =
    (cliLatestInstalledRes !== true && cliLatestInstalledRes.nextVersion) ||
    undefined;

  const currentCliVersion =
    (cliLatestInstalledRes !== true && cliLatestInstalledRes.currentVersion) ||
    undefined;

  const nextEnvkeysourceVersion =
    (envkeysourceLatestInstalledRes !== true &&
      envkeysourceLatestInstalledRes.nextVersion) ||
    undefined;

  const currentEnvkeysourceVersion =
    (envkeysourceLatestInstalledRes !== true &&
      envkeysourceLatestInstalledRes.currentVersion) ||
    undefined;

  const hasDesktopUpgrade =
    desktopRes?.updateInfo?.version &&
    desktopRes.updateInfo.version !== currentDesktopVersion;

  const nextDesktopVersion =
    hasDesktopUpgrade && desktopRes ? desktopRes.updateInfo.version : undefined;

  const hasCliUpgrade =
    hasDesktopUpgrade &&
    currentCliVersion &&
    nextCliVersion &&
    currentCliVersion != nextCliVersion;

  const hasEnvkeysourceUpgrade =
    hasDesktopUpgrade &&
    currentEnvkeysourceVersion &&
    nextEnvkeysourceVersion &&
    currentEnvkeysourceVersion != nextEnvkeysourceVersion;

  const hasAnyUpgrade =
    hasDesktopUpgrade || hasCliUpgrade || hasEnvkeysourceUpgrade;

  log("finished checking updates", {
    hasDesktopUpgrade,
    hasCliUpgrade,
    hasEnvkeysourceUpgrade,
  });

  if (!hasAnyUpgrade) {
    if (fromContextMenu) {
      return dialog.showMessageBox({
        title: "EnvKey",
        message: `EnvKey is up to date.`,
      });
    }
    return;
  }

  const [desktopNotes, cliNotes, envkeysourceNotes] = await Promise.all(
    (
      [
        [hasDesktopUpgrade, "desktop", currentDesktopVersion],
        [hasCliUpgrade, "cli", currentCliVersion],
        [hasEnvkeysourceUpgrade, "envkeysource", currentEnvkeysourceVersion],
      ] as [boolean, "desktop" | "cli" | "envkeysource", string | undefined][]
    ).map(([hasUpgrade, project, current]) =>
      hasUpgrade && current
        ? listVersionsGT({
            bucket: ENVKEY_RELEASES_BUCKET,
            creds: envkeyReleasesS3Creds,
            currentVersionNumber: current,
            tagPrefix: project,
          }).then((missedVersions) =>
            Promise.all(
              missedVersions.map((version) =>
                readReleaseNotesFromS3({
                  bucket: ENVKEY_RELEASES_BUCKET,
                  creds: envkeyReleasesS3Creds,
                  project,
                  version,
                }).then((note) => [version, note] as [string, string])
              )
            )
          )
        : undefined
    )
  );

  upgradeAvailable = {
    desktop:
      hasDesktopUpgrade && nextDesktopVersion && desktopNotes
        ? {
            nextVersion: nextDesktopVersion,
            currentVersion: currentDesktopVersion,
            notes: R.fromPairs(desktopNotes),
          }
        : undefined,

    cli:
      // we no longer allow independent CLI upgrades as CLI is now bundled with UI,
      // so CLI upgrade is only available if desktop upgrade is also available
      hasDesktopUpgrade &&
      hasCliUpgrade &&
      currentCliVersion &&
      nextCliVersion &&
      cliNotes
        ? {
            nextVersion: nextCliVersion,
            currentVersion: currentCliVersion,
            notes: R.fromPairs(cliNotes),
          }
        : undefined,

    envkeysource:
      // we no longer allow independent envkey-source upgrades as envkey-source is now bundled with UI,
      // so envkey-source upgrade is only available if desktop upgrade is also available
      hasDesktopUpgrade &&
      hasEnvkeysourceUpgrade &&
      currentEnvkeysourceVersion &&
      nextEnvkeysourceVersion &&
      envkeysourceNotes
        ? {
            nextVersion: nextEnvkeysourceVersion,
            currentVersion: currentEnvkeysourceVersion,
            notes: R.fromPairs(envkeysourceNotes),
          }
        : undefined,
  };

  log("client upgrade available", upgradeAvailable);

  if (!noDispatch) {
    getWin()!.webContents.send("upgrade-available", upgradeAvailable);
  }
};

export const downloadAndInstallUpgrade = async () => {
  if (!upgradeAvailable) {
    throw new Error("No client upgrade is available");
  }

  const hasAnyUpgrade = Object.values(upgradeAvailable).some(
    (upgrade) => upgrade != null
  );

  if (!hasAnyUpgrade) {
    throw new Error("No client upgrade is available");
  }

  stopCheckUpgradesLoop();

  let error = false;
  try {
    await autoUpdater.downloadUpdate();

    log("autoUpdater downloaded ok");
    if (upgradeAvailable!.desktop) {
      desktopVersionDownloaded = upgradeAvailable!.desktop.nextVersion;
    }
    if (upgradeAvailable!.cli) {
      cliVersionDownloaded = upgradeAvailable!.cli.nextVersion;
    }

    if (upgradeAvailable!.envkeysource) {
      envkeysourceVersionDownloaded =
        upgradeAvailable!.envkeysource.nextVersion;

      // write file to mark enveysource upgrade required
      const dir = path.join(os.homedir(), ".envkey");
      mkdirp.sync(dir);

      await fsp.writeFile(
        path.join(dir, "envkeysource-upgrade-required"),
        envkeysourceVersionDownloaded
      );
    }
  } catch (err) {
    error = true;
    log("autoUpdater download failed", { err });
  }

  log("autoUpdater download", { error });

  if (error) {
    log("Sending upgrade-error to webContents", { win: !!getWin() });
    getWin()!.webContents.send("upgrade-error");
    checkUpgrade().catch((err) => {
      log("checkUpdate failed", { err });
    });
    resetUpgradesLoop();
    return;
  }

  log("Sending upgrade-complete to webContents", { win: !!getWin() });
  getWin()!.webContents.send("upgrade-complete");
};

export const restartWithLatestVersion = () => {
  log("Restarting with new version", {
    versionDownloaded: desktopVersionDownloaded,
  });

  // quits the app and relaunches with latest version
  try {
    autoUpdater.quitAndInstall(true, true);
  } catch (err) {
    log("autoUpdater failed to quit and install", { err });
  }
};

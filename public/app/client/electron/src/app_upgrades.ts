import { enableAppWillAutoExitFlag, getWin } from "./main";
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
import { AvailableClientUpgrade, UpgradeProgress } from "@core/types/electron";
import * as R from "ramda";
import {
  downloadAndInstallCliTools,
  isLatestCliInstalled,
  isLatestEnvkeysourceInstalled,
} from "./cli_upgrades";

const CHECK_INTERVAL = 10 * 60 * 1000;
// allow looping only once
let loopInitialized = false;

let desktopVersionDownloaded: string | undefined;
let upgradeAvailable: AvailableClientUpgrade | undefined;

let desktopDownloadComplete = false;
let cliToolsInstallComplete = false;

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
    const progress: UpgradeProgress = {
      clientProject: "desktop",
      downloadedBytes: transferred,
      totalBytes: total,
    };

    getWin()!.webContents.send("upgrade-progress", progress);
  });
});

export const runCheckUpdatesLoop = () => {
  log("init updates loop");

  if (loopInitialized) {
    log("app update loop already initialized; refusing to start again.");
    return;
  }

  // not returned
  checkUpdate().catch((err) => {
    log("checkUpdate failed", { err });
  });

  setInterval(checkUpdate, CHECK_INTERVAL);
  loopInitialized = true;
  log("app update loop initialized");
};

export const checkUpdate = async (fromContextMenu = false) => {
  const currentDesktopVersion = app.getVersion();

  const [desktopRes, cliLatestInstalledRes, envkeysourceLatestInstalledRes] =
    await Promise.all([
      autoUpdater.checkForUpdates().catch((err) => {
        // error gets logged thanks to logger init at top
      }),
      isLatestCliInstalled(),
      isLatestEnvkeysourceInstalled(),
    ]);

  const nextCliVersion =
    (cliLatestInstalledRes !== true && cliLatestInstalledRes[0]) || undefined;

  const currentCliVersion =
    (cliLatestInstalledRes !== true && cliLatestInstalledRes[1]) || undefined;

  const nextEnvkeysourceVersion =
    (envkeysourceLatestInstalledRes !== true &&
      envkeysourceLatestInstalledRes[0]) ||
    undefined;

  const currentEnvkeysourceVersion =
    (envkeysourceLatestInstalledRes !== true &&
      envkeysourceLatestInstalledRes[1]) ||
    undefined;

  const hasCliUpgrade =
    currentCliVersion && nextCliVersion && currentCliVersion != nextCliVersion;
  const hasEnvkeysourceUpgrade =
    currentEnvkeysourceVersion &&
    nextEnvkeysourceVersion &&
    currentEnvkeysourceVersion != nextEnvkeysourceVersion;
  const hasDesktopUpgrade =
    desktopRes?.updateInfo?.version &&
    desktopRes.updateInfo.version !== currentDesktopVersion;

  const nextDesktopVersion =
    hasDesktopUpgrade && desktopRes ? desktopRes.updateInfo.version : undefined;

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
      hasCliUpgrade && currentCliVersion && nextCliVersion && cliNotes
        ? {
            nextVersion: nextCliVersion,
            currentVersion: currentCliVersion,
            notes: R.fromPairs(cliNotes),
          }
        : undefined,

    envkeysource:
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

  getWin()!.webContents.send("upgrade-available", upgradeAvailable);
};

export const downloadAndInstallUpgrade = async () => {
  if (!upgradeAvailable) {
    throw new Error("No client upgrade is available");
  }

  let error = false;

  await Promise.all([
    upgradeAvailable.cli || upgradeAvailable.envkeysource
      ? downloadAndInstallCliTools(upgradeAvailable, (progress) =>
          getWin()!.webContents.send("upgrade-progress", progress)
        )
          .then(() => {
            log("CLI tools upgraded ok");
            cliToolsInstallComplete = true;
          })
          .catch((err) => {
            error = true;
            log("CLI tools upgrade failed", { err });
          })
      : undefined,

    upgradeAvailable.desktop
      ? autoUpdater
          .downloadUpdate()
          .then(() => {
            log("autoUpdater downloaded ok");
            if (upgradeAvailable!.desktop) {
              desktopVersionDownloaded = upgradeAvailable!.desktop.nextVersion;
            }
          })
          .catch((err) => {
            error = true;
            log("autoUpdater download failed", { err });
          })
      : undefined,
  ]);

  log("finished CLI tools install and/or autoUpdater download", { error });

  if (error) {
    log("Sending upgrade-error to webContents");
    getWin()!.webContents.send("upgrade-error");
  } else if (!upgradeAvailable.desktop) {
    log("Sending upgrade-complete to webContents");
    getWin()!.webContents.send("upgrade-complete");
    upgradeAvailable = undefined;
    cliToolsInstallComplete = false;
  } else if (
    upgradeAvailable.desktop &&
    desktopDownloadComplete &&
    (upgradeAvailable.cli || upgradeAvailable.envkeysource)
  ) {
    log("CLI tools upgrade finished after autoUpdater, now restarting");
    restartWithLatestVersion();
  }
};

const restartWithLatestVersion = () => {
  log("Restarting with new version", {
    versionDownloaded: desktopVersionDownloaded,
  });

  enableAppWillAutoExitFlag();

  // quits the app and relaunches with latest version
  try {
    autoUpdater.quitAndInstall(true, true);
  } catch (err) {
    log("autoUpdater failed to quit and install", { err });
  }
};
autoUpdater.on("update-downloaded", () => {
  log("autoUpdater:update-downloaded");

  desktopDownloadComplete = true;

  if (
    upgradeAvailable &&
    (!(upgradeAvailable.cli || upgradeAvailable.envkeysource) ||
      cliToolsInstallComplete)
  ) {
    restartWithLatestVersion();
  } else {
    log("Waiting for CLI tools download to finish before restarting");
  }
});

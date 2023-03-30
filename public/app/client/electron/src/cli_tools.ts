import { getWin } from "./main";
import * as os from "os";
import * as path from "path";
import { exec } from "child_process";
import { promises as fsp } from "fs";
import mkdirp from "mkdirp";
import which from "which";
import { getLatestReleaseVersion } from "@infra/artifact-helpers";
import { ENVKEY_RELEASES_BUCKET } from "@infra/stack-constants";
import { log } from "@core/lib/utils/logger";
import { dialog } from "electron";
import * as sudoPrompt from "@vscode/sudo-prompt";
import * as R from "ramda";
import { version as cliVersion } from "../../cli/package.json";
import * as semver from "semver";

const arch = os.arch() == "arm64" ? "arm64" : "amd64";
const platform = os.platform() as "win32" | "darwin" | "linux";
const ext = platform == "win32" ? ".exe" : "";

let platformIdentifier: string = platform;
if (platform === "win32") {
  platformIdentifier = "windows";
}

export const ELECTRON_BIN_DIR = path.join(
  ...[
    ...(process.env.BIN_PATH_FROM_ELECTRON_RESOURCES
      ? [process.resourcesPath, process.env.BIN_PATH_FROM_ELECTRON_RESOURCES]
      : [process.env.BIN_PATH!]),
    ...({
      win32: ["windows"],
      darwin: ["mac", arch],
      linux: ["linux"],
    }[platform] ?? []),
  ]
);

export const installMissingOrOutdatedCliTools = async () => {
  const [
    bundledCliInstalled,
    cliLatestInstalledRes,
    envkeySourceLatestInstalledRes,
  ] = await Promise.all([
    isBundledCliInstalled(),
    isLatestCliInstalled(),
    isLatestEnvkeysourceInstalled(),
  ]);

  // Installs the CLI and envkey-source on app start if
  // either is missing from the system or is outdated
  // (or if only envkey-source v1 is there)
  // Otherwise will be handled by upgrades

  let isUpgradingCli = false;

  if (
    cliLatestInstalledRes !== true &&
    cliVersion != cliLatestInstalledRes.currentVersion
  ) {
    isUpgradingCli = true;
  }

  const shouldInstallCli = !bundledCliInstalled;

  const envkeySourceUpgradeRequiredPath = path.join(
    os.homedir(),
    ".envkey",
    "envkey-source-upgrade-required"
  );
  const envkeySourceUpgradeRequiredVersion = await fsp
    .readFile(envkeySourceUpgradeRequiredPath)
    .catch(() => undefined)
    .then((v) => v?.toString().trim());

  const shouldInstallEnvkeysource =
    envkeySourceLatestInstalledRes !== true &&
    (envkeySourceLatestInstalledRes.currentVersion == false ||
      envkeySourceLatestInstalledRes.currentVersion.startsWith("1.") ||
      Boolean(
        envkeySourceUpgradeRequiredVersion &&
          semver.gt(
            envkeySourceUpgradeRequiredVersion,
            envkeySourceLatestInstalledRes.currentVersion
          )
      ));

  log("installMissingOrOutdatedCliTools", {
    bundledCliInstalled,
    cliLatestInstalledRes,
    cliVersion,
    isUpgradingCli,
    shouldInstallCli,
    envkeySourceLatestInstalledRes,
    shouldInstallEnvkeysource,
  });

  if (shouldInstallCli || shouldInstallEnvkeysource) {
    log("Sending started-cli-tools-install", { win: !!getWin() });

    getWin()!.webContents.send("started-cli-tools-install");

    log(
      "CLI or envkey-source not installed. Installation will be attempted in background now."
    );

    await installCliTools(
      {
        cli: cliLatestInstalledRes == true ? undefined : cliLatestInstalledRes,
        envkeysource:
          envkeySourceLatestInstalledRes == true
            ? undefined
            : envkeySourceLatestInstalledRes,
      },
      "install",
      shouldInstallCli,
      shouldInstallEnvkeysource
    )
      .then(() => {
        log("CLI tools were installed on startup");
        log("Sending finished-cli-tools-install", { win: !!getWin() });
        getWin()!.webContents.send("finished-cli-tools-install");
        if (cliLatestInstalledRes !== true && !isUpgradingCli) {
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

        if (envkeySourceUpgradeRequiredVersion) {
          fsp
            .unlink(envkeySourceUpgradeRequiredPath)
            .then(() => {
              log("Removed envkey-source-upgrade-required file");
            })
            .catch((err) => {
              log("Failed to remove envkey-source-upgrade-required file", {
                err,
              });
            });
        }
      })
      .catch((err) => {
        log("CLI tools failed to install on startup", { err });
      });
  } else {
    log("CLI tools already installed");
  }
};

export const installCliTools = async (
  params: {
    cli?: {
      nextVersion: string;
      currentVersion: string | false;
    };
    envkeysource?: {
      nextVersion: string;
      currentVersion: string | false;
    };
  },
  installType: "install" | "upgrade",
  shouldInstallCli: boolean,
  shouldInstallEnvkeysource: boolean
) => {
  try {
    await install(
      params,
      ELECTRON_BIN_DIR,
      installType,
      shouldInstallCli,
      shouldInstallEnvkeysource
    );
  } catch (err) {
    log("Error installing CLI tools", { err });
    throw err;
  }
};

export const isBundledCliInstalled = async () => {
  const currentVersionRes = await getCurrentVersion("cli");
  return currentVersionRes === cliVersion;
};

export const isLatestCliInstalled = () => isLatestInstalled("cli");

export const isLatestEnvkeysourceInstalled = () =>
  isLatestInstalled("envkeysource");

let cliBinPath: string | false | undefined;
export const getCliBinPath = async () => {
  if (typeof cliBinPath !== "undefined") return cliBinPath;
  cliBinPath = await getBinPath("cli");
  return cliBinPath;
};

export const getCliCurrentVersion = () => getCurrentVersion("cli");

export const sudoNeededDialog = async () => {
  let button: number | undefined;
  try {
    button = (
      await dialog.showMessageBox(getWin()!, {
        title: "EnvKey CLI",
        message: `To install the latest EnvKey CLI tools, you will be prompted for administrator access.`,
        buttons: ["OK", "Skip"],
      })
    )?.response;
  } catch (ignored) {}
  if (button !== 0) {
    throw new Error(
      `administrator access for installation of EnvKey CLI tools was declined.`
    );
  }
};

export const installCliAutocomplete = async () => {
  const cliPath =
    platformIdentifier === "windows"
      ? path.resolve(getWindowsBin(), "envkey.exe")
      : "/usr/local/bin/envkey";

  // attempt to install shell tab completion for all supported shells
  return Promise.all(
    ["bash", "zsh", "fish"].map(
      (shell) =>
        new Promise((resolve, reject) => {
          log("attempting to install CLI autocomplete...", { shell });

          exec(`"${cliPath}" completion install --shell ${shell}`, (err) => {
            if (err) {
              // errors are ok, just resolve with empty string so they can be filtered out
              log("CLI autocomplete installation error", { shell, err });
              return resolve("");
            }
            return resolve(shell);
          });
        })
    )
  );
};

export const fileExists = async (filepath: string): Promise<boolean> => {
  try {
    await fsp.stat(filepath);
    return true;
  } catch (ignored) {
    return false;
  }
};

const isLatestInstalled = async (
  project: "cli" | "envkeysource"
): Promise<true | { nextVersion: string; currentVersion: string | false }> => {
  const [currentVersion, nextVersion] = await Promise.all([
    getCurrentVersion(project),
    getLatestVersion(project),
  ]);

  if (project == "cli") {
    log("", { currentVersion, nextVersion });
  }

  if (!currentVersion || currentVersion != nextVersion) {
    return { nextVersion, currentVersion };
  }

  return true;
};

const hasV1Envkeysource = async () => {
  const expectedBin =
    platformIdentifier === "windows"
      ? path.resolve(getWindowsBin(), `envkey-source.exe`)
      : `/usr/local/bin/envkey-source`;

  const exists = await fileExists(expectedBin);

  if (!exists) {
    return false;
  }

  const version = await new Promise<string | false>((resolve, reject) => {
    exec(`"${expectedBin}" --version`, (err, res) => {
      if (err) {
        reject(err);
      } else {
        resolve(res?.trim() || false);
      }
    });
  });

  return version && version.startsWith("1.");
};

const getLatestVersion = async (project: "cli" | "envkeysource") =>
  getLatestReleaseVersion({
    project: project,
    bucket: ENVKEY_RELEASES_BUCKET,
  });

const getBinPath = async (
  project: "cli" | "envkeysource"
): Promise<false | string> => {
  const execName = { cli: "envkey", envkeysource: "envkey-source" }[project];

  /*
   * for envkeysource, first check for envkey-source-v2, which is
   * what envkey-source will be installed as if envkey-source v1
   * is already installed on the system
   */
  const maybeExecSuffix = project == "envkeysource" ? "-v2" : "";

  let expectedBin =
    platformIdentifier === "windows"
      ? path.resolve(getWindowsBin(), `${execName}${maybeExecSuffix}.exe`)
      : `/usr/local/bin/${execName}${maybeExecSuffix}`;

  let exists = await fileExists(expectedBin);

  if (!exists && maybeExecSuffix) {
    expectedBin =
      platformIdentifier === "windows"
        ? path.resolve(getWindowsBin(), `${execName}.exe`)
        : `/usr/local/bin/${execName}`;

    exists = await fileExists(expectedBin);
  }

  if (!exists) {
    return false;
  }

  return expectedBin;
};

const getCurrentVersion = async (
  project: "cli" | "envkeysource"
): Promise<false | string> => {
  const expectedBin = await getBinPath(project);

  if (!expectedBin) {
    return false;
  }

  return new Promise((resolve, reject) => {
    exec(`"${expectedBin}" --version`, (err, res) => {
      if (err) {
        reject(err);
      } else {
        resolve(res?.trim() || false);
      }
    });
  });
};

// resolves to version number installed
const install = async (
  params: {
    cli?: {
      nextVersion: string;
      currentVersion: string | false;
    };
    envkeysource?: {
      nextVersion: string;
      currentVersion: string | false;
    };
  },
  sourceDir: string,
  installType: "install" | "upgrade",
  shouldInstallCli: boolean,
  shouldInstallEnvkeysource: boolean
): Promise<void> => {
  // installs envkey-source as envkey-source-v2 if envkey-source v1 is already installed to avoid overwriting it and breaking things
  if (shouldInstallEnvkeysource && (await hasV1Envkeysource())) {
    const envkeysourcePath = path.resolve(sourceDir, `envkey-source${ext}`);
    if (await fileExists(envkeysourcePath)) {
      await fsp.rename(
        envkeysourcePath,
        path.resolve(sourceDir, `envkey-source-v2${ext}`)
      );
    }
  }

  let binDir: string;
  switch (platform) {
    case "darwin":
    case "linux":
      binDir = "/usr/local/bin";
      break;
    case "win32":
      binDir = getWindowsBin();
      break;
    default:
      throw new Error(
        `Cannot install CLI tools to unsupported platform ${platform}`
      );
  }

  await copyExecFiles(
    sourceDir,
    binDir,
    shouldInstallCli,
    shouldInstallEnvkeysource
  );

  if (installType == "install") {
    // add `es` alias for envkey-source unless an `es` is already in PATH
    let hasExistingEsCommand = false;

    try {
      hasExistingEsCommand = await new Promise((resolve) => {
        which("es", (err, path) => {
          if (err) {
            log("which('es') error:", { err });
          }
          resolve(Boolean(path));
        });
      });
    } catch (err) {
      log("caught error determining `hasExistingEsCommand`", { err });
    }

    log("", { hasExistingEsCommand });

    const symlinkExists = await fileExists(path.join(binDir, "es"));

    log("", { symlinkExists });

    if (!hasExistingEsCommand && !symlinkExists) {
      // windows requires admin privileges to create a symlink
      if (platform == "win32") {
        log("attempting to create `es` symlink on Windows");

        try {
          await sudoNeededDialog();
        } catch (err) {
          log("error warning user of administrator privileges request", {
            err,
          });
        }

        await new Promise<void>((resolve, reject) => {
          try {
            log("attempting symlink with sudo-prompt on Windows");
            sudoPrompt.exec(
              `mklink "${path.join(binDir, "es")}" "${path.join(
                binDir,
                "envkey-source.exe"
              )}"`,
              {
                name: `EnvKey CLI Tools Installer`,
              },
              (err: Error | undefined) => {
                if (err) {
                  log(`Windows sudo-prompt create symlink error`, { err });
                  return reject(err);
                }
                log("Windows: created symlink with administrator privileges");
                resolve();
              }
            );
          } catch (err) {
            log(`Windows sudo-prompt create symlink error`, { err });
            reject(err);
          }
        });
      } else {
        await fsp
          .symlink(path.join(binDir, "envkey-source"), path.join(binDir, "es"))
          .catch(async (err) => {
            log("create symlink err", { err });
          });
      }
    }
  }

  log(`CLI tools upgrade: completed successfully`, {
    cli: params.cli?.nextVersion,
    envkeysource: params.envkeysource?.nextVersion,
  });
};

const getWindowsBin = () => path.resolve(os.homedir(), "bin");

// cross-platform copy a file and overwrite if it exists.
const copyExecFiles = async (
  sourceDir: string,
  destinationFolder: string,
  shouldInstallCli: boolean,
  shouldInstallEnvkeysource: boolean,
  withSudoPrompt?: boolean,
  argFiles?: [string, string][]
): Promise<void> => {
  const files =
    argFiles ??
    ((await Promise.all(
      (
        [
          [shouldInstallEnvkeysource, sourceDir, `envkey-source${ext}`],
          [shouldInstallEnvkeysource, sourceDir, `envkey-source-v2${ext}`],
          [shouldInstallCli, sourceDir, `envkey${ext}`],
          [shouldInstallCli, sourceDir, "envkey-keytar.node"],
        ] as [boolean, string, string][]
      ).map(([shouldInstall, folder, file]) => {
        if (!shouldInstall) {
          return undefined;
        }
        const tmpPath = path.resolve(folder, file);
        return fileExists(tmpPath).then((exists) =>
          exists ? [folder, file] : undefined
        );
      })
    ).then(R.filter(Boolean))) as [string, string][]);

  if (withSudoPrompt) {
    const cmd = `mkdir -p "${destinationFolder}" && chown ${
      process.env.USER
    } "${destinationFolder}" && ${files
      .map(
        ([folder, file]) =>
          `cp -f "${path.resolve(folder, file)}" "${destinationFolder}"`
      )
      .join(" && ")}`;

    log("copy exec files with sudo prompt", { cmd });

    await sudoNeededDialog();

    return new Promise((resolve, reject) => {
      try {
        sudoPrompt.exec(
          cmd,
          {
            name: `EnvKey CLI Tools Installer`,
          },
          (err: Error | undefined) => {
            if (err) {
              log(`sudo CLI tools installer - handler error`, { err });
              return reject(err);
            }
            log("copy exec files with sudo prompt success");
            resolve();
          }
        );
      } catch (err) {
        log(`sudo CLI tool installer error - exec error`, { err });
        reject(err);
      }
    });
  }

  try {
    await mkdirp(destinationFolder);

    await Promise.all(
      files.map(([folder, file]) => {
        const tmpPath = path.resolve(folder, file);
        const destinationPath = path.resolve(destinationFolder, file);

        log(`copying exec files - copy ${tmpPath} to ${destinationPath}...`);

        return fsp
          .rm(destinationPath)
          .catch(async (err) => {})
          .then(() => {
            return fsp
              .copyFile(tmpPath, destinationPath)
              .then(() =>
                log(`copied exec files - copy ${tmpPath} to ${destinationPath}`)
              );
          });
      })
    );
  } catch (err) {
    if (err.message?.includes("permission denied")) {
      log("copy exec files - permission denied error - retrying with sudo", {
        err,
      });
      return copyExecFiles(
        sourceDir,
        destinationFolder,
        shouldInstallCli,
        shouldInstallEnvkeysource,
        true,
        files
      );
    } else {
      if (
        platform == "win32" &&
        err.code == "EBUSY" &&
        shouldInstallEnvkeysource
      ) {
        await dialog.showMessageBox({
          title: "EnvKey CLI",
          message: `In order to upgrade, any running envkey-source.exe processes will be closed`,
          buttons: ["Continue"],
        });

        await new Promise<void>((resolve, reject) => {
          exec(`taskkill /F /IM envkey-source.exe /T`, (err) =>
            err ? reject(err) : resolve()
          );
        });

        return copyExecFiles(
          sourceDir,
          destinationFolder,
          shouldInstallCli,
          shouldInstallEnvkeysource,
          withSudoPrompt,
          files
        );
      } else {
        log("copy exec files error", { err });
        throw err;
      }
    }
  }
};

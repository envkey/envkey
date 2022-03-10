import { getWin } from "./main";
import * as os from "os";
import * as path from "path";
import { exec } from "child_process";
import { promises as fsp } from "fs";
import * as fs from "fs";
import gunzip from "gunzip-maybe";
import * as tar from "tar-fs";
import mkdirp from "mkdirp";
import which from "which";
import {
  getReleaseAsset,
  getLatestReleaseVersion,
} from "@infra/artifact-helpers";
import { ENVKEY_RELEASES_BUCKET } from "@infra/stack-constants";
import { log } from "@core/lib/utils/logger";
import { dialog } from "electron";
import tempDir from "temp-dir";
import * as sudoPrompt from "@vscode/sudo-prompt";
import { UpgradeProgress } from "@core/types/electron";
import * as R from "ramda";

const MINISIGN_PUBKEY =
  "RWQ5lgVbbidOxaoIEsqZjbI6hHdS5Ri/SrDk9rNFFgiQZ4COuk6Li2HK";

const arch = os.arch() == "arm64" ? "arm64" : "amd64";
const platform = os.platform() as "win32" | "darwin" | "linux";
const ext = platform == "win32" ? ".exe" : "";

let platformIdentifier: string = platform;
if (platform === "win32") {
  platformIdentifier = "windows";
}

const PROGRESS_INTERVAL = 100;
const throttlingProgress: Record<"cli" | "envkeysource", boolean> = {
  cli: false,
  envkeysource: false,
};

export const downloadAndInstallCliTools = async (
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
  onProgress?: (p: UpgradeProgress) => void
) => {
  let cliFolder: string | undefined;
  let envkeysourceFolder: string | undefined;

  try {
    [cliFolder, envkeysourceFolder] = await Promise.all([
      params.cli
        ? download("cli", params.cli.nextVersion, onProgress)
        : undefined,
      params.envkeysource
        ? download("envkeysource", params.envkeysource.nextVersion, onProgress)
        : undefined,
    ]);
  } catch (err) {
    log("Error downloading CLI tools upgrade", { err });
    throw err;
  }

  try {
    await install(params, cliFolder, envkeysourceFolder, installType);
  } catch (err) {
    log("Error installing CLI tools upgrade", { err });
    throw err;
  }
};

export const isLatestCliInstalled = () => isLatestInstalled("cli");

export const isLatestEnvkeysourceInstalled = () =>
  isLatestInstalled("envkeysource");

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

          exec(`${cliPath} completion install --shell ${shell}`, (err) => {
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

const isLatestInstalled = async (
  project: "cli" | "envkeysource"
): Promise<true | [string, string | false]> => {
  const [currentVersion, nextVersion] = await Promise.all([
    getCurrentVersion(project),
    getLatestVersion(project),
  ]);

  if (!currentVersion || currentVersion != nextVersion) {
    return [nextVersion, currentVersion];
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
    exec(`${expectedBin} --version`, (err, res) => {
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

const getCurrentVersion = async (
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

  return new Promise((resolve, reject) => {
    exec(`${expectedBin} --version`, (err, res) => {
      if (err) {
        reject(err);
      } else {
        resolve(res?.trim() || false);
      }
    });
  });
};

const download = async (
  projectType: "cli" | "envkeysource",
  nextVersion: string,
  onProgress?: (p: UpgradeProgress) => void
) => {
  const execName = projectType == "cli" ? "envkey" : "envkey-source";
  const assetPrefix = projectType == "cli" ? "envkey-cli" : "envkey-source";
  const friendlyName = projectType == "cli" ? "EnvKey CLI" : "envkey-source";

  log(`${projectType} upgrade: init`);

  const assetName = `${assetPrefix}_${nextVersion}_${platformIdentifier}_${arch}.tar.gz`;
  const releaseTag = `${projectType}-v${nextVersion}`;

  const [fileBuf, sigBuf] = await Promise.all([
    getReleaseAsset({
      bucket: ENVKEY_RELEASES_BUCKET,
      releaseTag,
      assetName,
      progress: (totalBytes: number, downloadedBytes: number) => {
        const throttling = throttlingProgress[projectType];

        if (onProgress && (!throttling || totalBytes == downloadedBytes)) {
          onProgress({
            clientProject: projectType,
            downloadedBytes,
            totalBytes,
          });

          throttlingProgress[projectType] = true;
          setTimeout(() => {
            throttlingProgress[projectType] = false;
          }, PROGRESS_INTERVAL);
        }
      },
    }),
    getReleaseAsset({
      bucket: ENVKEY_RELEASES_BUCKET,
      releaseTag,
      assetName: assetName + ".minisig",
    }),
  ]);
  log(`${friendlyName} upgrade: fetched latest archive`, {
    sizeBytes: Buffer.byteLength(fileBuf),
    assetName,
  });

  const folder = await unpackToFolder(fileBuf, sigBuf, execName);
  log(`${friendlyName} upgrade: unpacked to folder`, { folder });

  return folder;
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
  cliFolder: string | undefined,
  envkeysourceFolder: string | undefined,
  installType: "install" | "upgrade"
): Promise<void> => {
  // installs envkey-source as envkey-source-v2 if envkey-source v1 is already installed to avoid overwriting it and breaking things
  if (envkeysourceFolder && (await hasV1Envkeysource())) {
    const envkeysourcePath = path.resolve(
      envkeysourceFolder,
      `envkey-source${ext}`
    );
    if (await fileExists(envkeysourcePath)) {
      await fsp.rename(
        envkeysourcePath,
        path.resolve(envkeysourceFolder, `envkey-source-v2${ext}`)
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

  await copyExecFiles(cliFolder, envkeysourceFolder, binDir);

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
              `mklink ${path.join(binDir, "es")} ${path.join(
                binDir,
                "envkey-source.exe"
              )}`,
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

// resolves to the folder where it unrolled the archive
const unpackToFolder = async (
  archiveBuf: Buffer,
  sigBuf: Buffer,
  execName: string
): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    const tempFileBase = `${execName}_${+new Date() / 1000}`;
    const tempFilePath = path.resolve(tempDir, `${tempFileBase}.tar.gz`);
    const tempSigPath = path.resolve(tempDir, `${tempFileBase}.tar.gz.minisig`);
    const tempFileTarPath = path.resolve(tempDir, `${tempFileBase}.tar`);
    const tempOutputDir = path.resolve(tempDir, tempFileBase);

    await Promise.all([
      fsp.writeFile(tempFilePath, archiveBuf),
      fsp.writeFile(tempSigPath, sigBuf),
    ]);

    // verify binary with vendored minisign
    const minisignPath = path.join.apply(this, [
      ...(process.env.MINISIGN_PATH_FROM_ELECTRON_RESOURCES
        ? [
            process.resourcesPath,
            process.env.MINISIGN_PATH_FROM_ELECTRON_RESOURCES,
          ]
        : [process.env.MINISIGN_PATH!]),
      ...({
        win32: ["windows", "minisign.exe"],
        darwin: ["mac", arch, "minisign"],
        linux: ["linux", "minisign"],
      }[platform] ?? []),
    ]);

    log(`Verifying ${execName} with minisign`, {
      platform,
      arch,
      minisignPath,
    });

    await new Promise((resolve, reject) => {
      exec(
        `"${minisignPath}" -Vm ${tempFilePath} -P ${MINISIGN_PUBKEY}`,
        (error, stdout, stderr) => {
          if (stderr) {
            log(`Error verifying signature with minisig`, { stderr });

            dialog.showMessageBox({
              title: "EnvKey CLI Tools",
              message: `There was a problem verifying the signature of the \`${execName}\` CLI tool executable. This might indicate a security issue. Please contact support@envkey.com so we can investigate.`,
              buttons: ["OK"],
            });

            return reject(new Error(stderr));
          }
          if (error) {
            log(`Error executing minisign`, { error });
            return reject(error);
          }
          log(`Verified signature with minisig`, { stdout });
          resolve(true);
        }
      );
    });

    const tarredGzipped = fs.createReadStream(tempFilePath);
    const tarredOnlyWrite = fs.createWriteStream(tempFileTarPath);

    tarredGzipped.on("error", reject);
    tarredOnlyWrite.on("error", reject);
    tarredOnlyWrite.on("close", () => {
      const tarredOnlyRead = fs.createReadStream(tempFileTarPath);
      tarredOnlyRead.on("error", reject);
      tarredOnlyRead.on("close", () => {
        resolve(tempOutputDir);
      });
      tarredOnlyRead.pipe(tar.extract(tempOutputDir));
    });

    tarredGzipped.pipe(gunzip()).pipe(tarredOnlyWrite);
  });
};

// cross-platform copy a file and overwrite if it exists.
const copyExecFiles = async (
  cliFolder: string | undefined,
  envkeysourceFolder: string | undefined,
  destinationFolder: string,
  withSudoPrompt?: boolean,
  argFiles?: [string, string][]
): Promise<void> => {
  const files =
    argFiles ??
    ((await Promise.all(
      (
        [
          [envkeysourceFolder, `envkey-source${ext}`],
          [envkeysourceFolder, `envkey-source-v2${ext}`],
          [cliFolder, `envkey${ext}`],
          [cliFolder, "envkey-keytar.node"],
        ] as [string | undefined, string][]
      ).map(([folder, file]) => {
        if (!folder) {
          return undefined;
        }
        const tmpPath = path.resolve(folder, file);
        return fileExists(tmpPath).then((exists) =>
          exists ? [folder, file] : undefined
        );
      })
    ).then(R.filter(Boolean))) as [string, string][]);

  if (withSudoPrompt) {
    const cmd = `mkdir -p ${destinationFolder} && chown ${
      process.env.USER
    } ${destinationFolder} && ${files
      .map(
        ([folder, file]) =>
          `cp -f ${path.resolve(folder, file)} ${destinationFolder}`
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
        cliFolder,
        envkeysourceFolder,
        destinationFolder,
        true,
        files
      );
    } else {
      if (platform == "win32" && err.code == "EBUSY") {
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
          cliFolder,
          envkeysourceFolder,
          destinationFolder,
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

const fileExists = async (filepath: string): Promise<boolean> => {
  try {
    await fsp.stat(filepath);
    return true;
  } catch (ignored) {
    return false;
  }
};

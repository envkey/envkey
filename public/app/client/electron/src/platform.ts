import * as path from "path";
import * as os from "os";

export const arch = os.arch() == "arm64" ? "arm64" : "amd64";
export const platform = os.platform() as "win32" | "darwin" | "linux";
export const ext = platform == "win32" ? ".exe" : "";

export const platformIdentifier = platform === "win32" ? "windows" : platform;

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
export const BUNDLED_CLI_PATH = path.resolve(ELECTRON_BIN_DIR, "envkey" + ext);

export const BUNDLED_ENVKEYSOURCE_PATH = path.resolve(
  ELECTRON_BIN_DIR,
  "envkey-source" + ext
);

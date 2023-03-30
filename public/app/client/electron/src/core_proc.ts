import { wait } from "@core/lib/utils/wait";
import { ELECTRON_BIN_DIR } from "./cli_tools";
import { log } from "@core/lib/utils/logger";
import { isAlive, stop } from "@core/lib/core_proc";
import { version as cliVersion } from "../../cli/package.json";
import * as semver from "semver";
import { spawn } from "child_process";
import { app } from "electron";
import { showErrorReportDialogSync } from "./report_error";
import * as path from "path";
import * as os from "os";

const platform = os.platform();
const isWindows = platform === "win32";

const BUNDLED_CLI_PATH = path.resolve(
  ELECTRON_BIN_DIR,
  "envkey" + (isWindows ? ".exe" : "")
);
const CORE_START_TIMEOUT = 30000;
const CHECK_ALIVE_INTERVAL = 2000;

export const startCore = async (): Promise<boolean> => {
  log("startCore");
  let alive = await isAlive();
  log("Core process status", { alive });
  if (alive) {
    if (semver.valid(alive) && semver.gt(cliVersion, alive)) {
      log(
        "Core process is running an outdated version. Stopping and retrying..."
      );
      const res = await stop();
      if (res) {
        return startCore();
      } else {
        throw new Error(
          "Couldn't stop EnvKey core process that is running an outdated version."
        );
      }
    } else {
      log("Core process is already running");
      log("Starting core process alive check loop...");
      checkAliveLoop();
      return false;
    }
  }

  log("Starting core process daemon via CLI");

  await new Promise<void>((resolve, reject) => {
    const child = spawn(BUNDLED_CLI_PATH, ["core", "start"], {
      env: {
        LOG_REQUESTS: "1",
      },
      stdio: "ignore",
      windowsHide: true,
      detached: true,
    });

    child.on("error", (err) => {
      const msg = "Error starting core process daemon from CLI: " + err.message;
      log(msg);
      reject(new Error(msg));
    });

    child.on("exit", (code) => {
      if (code === 0) {
        log("Executed core start command");
        resolve();
      } else {
        const msg = `Error starting core process daemon from CLI: Process exited with code ${code}`;
        log(msg);
        reject(new Error(msg));
      }
    });

    child.unref();
  });
  log("Waiting for core proc alive...");
  let start = Date.now();
  let timeElapsed = 0;
  while (true) {
    await wait(200);
    alive = await isAlive(200);

    if (alive === false) {
      timeElapsed = Date.now() - start;
      if (timeElapsed > CORE_START_TIMEOUT) {
        throw new Error("Starting core process timed out");
      }
    } else if (alive) {
      break;
    }
  }
  log("Successfully started core process");

  log("Starting core process alive check loop...");
  checkAliveLoop();

  return true;
};

const checkAliveLoop = async () => {
  const alive = await isAlive();
  if (alive) {
    setTimeout(checkAliveLoop, CHECK_ALIVE_INTERVAL);
  } else if (process.env.NODE_ENV === "production") {
    log("Core process died while UI is running. Closing EnvKey UI...");
    await showErrorReportDialogSync(
      "The EnvKey core process exited unexpectedly.",
      BUNDLED_CLI_PATH
    );

    app.quit();
  }
};

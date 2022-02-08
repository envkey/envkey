import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { startCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { getCoreProcAuthToken } from "@core/lib/client_store/key_store";
import { fetchState } from "@core/lib/core_proc";
import { detectApp } from "../../app_detection";
import { Model } from "@core/types";
import chalk from "chalk";
import { autoModeOut } from "../../lib/console_io";

export const command = ["current"];
export const desc =
  "Show the app detected from an ENVKEY, .env file, or .envkey config file.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.option("short", { type: "boolean" });
export const handler = async (
  argv: BaseArgs & { short?: boolean }
): Promise<void> => {
  try {
    await startCore();

    const encryptedAuthToken = await getCoreProcAuthToken();
    let state = await fetchState(undefined, encryptedAuthToken);
    const detected = await detectApp(state, argv, process.cwd());
    if (!detected) {
      if (!argv["short"]) {
        console.log(
          "No valid ENVKEY, .env file, or .envkey config file was found"
        );
      }
      return exit();
    }

    if (argv["short"]) {
      console.log(detected.orgName, "-", detected.appName);
    } else {
      let s =
        "The current app is " +
        chalk.bold(chalk.green(detected.appName)) +
        " in organization " +
        chalk.bold(chalk.cyan(detected.orgName)) +
        ".\n\n";

      if (detected.dotenvkeyFile) {
        s += `Detected from .envkey file at ${detected.dotenvkeyFile}`;
      } else {
        s +=
          "Detected from ENVKEY found" +
          (detected.envkeyFromEnvironment
            ? "in environment variable."
            : `in .env file at ${chalk.bold(detected.dotenvFile)}`);
      }

      console.log(s);
    }

    autoModeOut(detected);
  } catch (err) {
    if (argv["verbose"]) {
      console.error(err);
    }
  }

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { Client } from "@core/types";
import { BaseArgs } from "../../types";
import { printDeviceSettings } from "../../lib/auth";
import chalk from "chalk";
import { getPrompt } from "../../lib/console_io";

export const command = "set-default-device-name [name]";
export const desc =
  "Set the default name of this device when creating or joining an organization.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("name", {
    type: "string",
    describe: "default device name",
  });
export const handler = async (
  argv: BaseArgs & { name: string | undefined }
): Promise<void> => {
  const prompt = getPrompt();
  await initCore(argv, false);

  const name =
    argv.name ??
    (
      await prompt<{ name: string }>({
        type: "input",
        name: "name",
        message: "Default device name:",
      })
    ).name;

  const res = await dispatch({
    type: Client.ActionType.SET_DEFAULT_DEVICE_NAME,
    payload: { name },
  });

  if (res.success) {
    console.log(chalk.bold("Default device name set."));
  } else {
    return exit(
      1,
      chalk.bold("Oops, there was a problem setting your default device name.")
    );
  }

  printDeviceSettings(res.state);

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

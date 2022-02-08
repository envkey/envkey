import { promptPassphrase } from "../../lib/crypto";
import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { Client } from "@core/types";
import { BaseArgs } from "../../types";
import chalk from "chalk";

export const command = "lock";
export const desc = "Lock all EnvKey accounts on this device.";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  const { state } = await initCore(argv, false, undefined, true);

  if (!state.requiresPassphrase) {
    const passphrase = await promptPassphrase(
      "Set a passphrase. Min 10 characters:",
      true,
      true
    );
    const res = await dispatch({
      type: Client.ActionType.SET_DEVICE_PASSPHRASE,
      payload: { passphrase },
    });

    if (!res.success) {
      return exit(1, chalk.bold("Error setting passphrase."));
    }
  }

  const res = await dispatch({
    type: Client.ActionType.LOCK_DEVICE,
  });

  if (res.success) {
    console.log(chalk.bold("EnvKey is locked on this device."));
  } else {
    return exit(1, chalk.red.bold("There was a problem locking EnvKey."));
  }

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

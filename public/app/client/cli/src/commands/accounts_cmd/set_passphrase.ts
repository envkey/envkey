import { promptPassphrase } from "../../lib/crypto";
import { printDeviceSettings } from "../../lib/auth";
import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { Client } from "@core/types";
import { BaseArgs } from "../../types";
import chalk from "chalk";
import * as R from "ramda";

export const command = "set-passphrase";
export const desc = "Set a new passphrase for this device.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.option("remove", {
    type: "boolean",
    describe: "remove passphrase",
  });
export const handler = async (
  argv: BaseArgs & { remove: boolean | undefined }
): Promise<void> => {
  const { state } = await initCore(argv, false);

  if (argv.remove) {
    if (state.requiresPassphrase) {
      const accountsRequiringPassphrase = (
        Object.values(state.orgUserAccounts) as Client.ClientUserAuth[]
      ).filter(R.prop("requiresPassphrase"));

      if (accountsRequiringPassphrase.length > 0) {
        if (accountsRequiringPassphrase.length == 1) {
          console.log(
            chalk.bold(
              `You can't remove your passphrase because ${chalk.cyan(
                accountsRequiringPassphrase[0].orgName
              )} requires one.`
            )
          );
          return exit();
        } else {
          chalk.bold(
            `You can't remove your passphrase because these orgs require one: ${chalk.cyan(
              accountsRequiringPassphrase.map(R.prop("orgName")).join(", ")
            )}`
          );
          return exit();
        }
      }

      let res = await dispatch({
        type: Client.ActionType.CLEAR_DEVICE_PASSPHRASE,
      });

      if (state.lockoutMs) {
        res = await dispatch({
          type: Client.ActionType.CLEAR_DEVICE_LOCKOUT,
        });
      }

      console.log(
        chalk.bold(
          `Your device passphrase ${
            state.lockoutMs ? "and lockout have" : "has"
          } been removed.`
        )
      );
      printDeviceSettings(res.state);
    } else {
      console.log(chalk.bold("You don't have a passphrase set."));
    }
  } else {
    const passphrase = await promptPassphrase(
      "Set a passphrase for this device. Min 10 characters:",
      true,
      true
    );
    const res = await dispatch({
      type: Client.ActionType.SET_DEVICE_PASSPHRASE,
      payload: { passphrase },
    });

    if (res.success) {
      console.log(chalk.bold("Passphrase set."));

      console.log("");
      printDeviceSettings(res.state);
    } else {
      return exit(
        1,
        chalk.bold("Oops, there was a problem setting your passphrase.")
      );
    }
  }

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

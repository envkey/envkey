import { promptPassphrase } from "../../lib/crypto";
import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { Client } from "@core/types";
import { BaseArgs } from "../../types";
import { printDeviceSettings } from "../../lib/auth";
import chalk from "chalk";
import * as R from "ramda";
import { getPrompt } from "../../lib/console_io";

export const command = "set-lockout [minutes]";
export const desc =
  "Set minutes of inactivity before EnvKey locks on this device.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("minutes", {
      type: "number",
      describe: "time inactive (in minutes) before lockout",
    })
    .option("remove", {
      type: "boolean",
      describe: "remove lockout requirement",
      conflicts: ["minutes"],
    });
export const handler = async (
  argv: BaseArgs & { minutes: number | undefined; remove: boolean | undefined }
): Promise<void> => {
  const prompt = getPrompt();
  const { state } = await initCore(argv, false),
    accountsRequiringLockout = (
      Object.values(state.orgUserAccounts) as Client.ClientUserAuth[]
    ).filter(R.prop("requiresLockout"));

  if (argv.remove) {
    if (typeof state.lockoutMs == "undefined") {
      console.log(chalk.bold("You don't have a lockout set."));
      return exit();
    }

    if (accountsRequiringLockout.length == 1) {
      return exit(
        1,
        chalk.bold(
          `You can't remove the lockout because ${chalk.cyan(
            accountsRequiringLockout[0].orgName
          )} requires one.`
        )
      );
    }
    if (accountsRequiringLockout.length > 1) {
      return exit(
        1,
        chalk.bold(
          `You can't remove the lockout because these orgs require one: ${chalk.cyan(
            accountsRequiringLockout.map(R.prop("orgName")).join(", ")
          )}`
        )
      );
    }

    const res = await dispatch({
      type: Client.ActionType.CLEAR_DEVICE_LOCKOUT,
    });
    console.log(chalk.bold("Lockout removed."));
    printDeviceSettings(res.state);
    return exit();
  }

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

  const lowestMaxLockoutMs =
      accountsRequiringLockout.length > 0
        ? R.apply(
            Math.min,
            accountsRequiringLockout
              .filter(R.prop("lockoutMs"))
              .map((acct) => acct.lockoutMs)
          )
        : undefined,
    lowestMaxLockoutMinutes =
      typeof lowestMaxLockoutMs == "number"
        ? lowestMaxLockoutMs / 1000 / 60
        : undefined,
    accountsWithMin =
      typeof lowestMaxLockoutMs == "number"
        ? (
            Object.values(state.orgUserAccounts) as Client.ClientUserAuth[]
          ).filter(
            (acct) => acct.lockoutMs && acct.lockoutMs == lowestMaxLockoutMs
          )
        : [];

  const minutes =
      argv.minutes ??
      (
        await prompt<{ minutes: number }>({
          type: "numeral",
          name: "minutes",
          initial: Math.min(lowestMaxLockoutMinutes ?? 120, 120),
          min: lowestMaxLockoutMinutes ? lowestMaxLockoutMinutes : 1,
          float: false,
          required: true,
          message: "Minutes of inactivity before lockout:",
        })
      ).minutes,
    lockoutMs = minutes * 60 * 1000;

  if (typeof lowestMaxLockoutMs == "number" && lockoutMs > lowestMaxLockoutMs) {
    if (accountsWithMin.length == 1) {
      console.log(
        chalk.bold(
          `You can't set a lockout of ${minutes} minutes because ${chalk.cyan(
            accountsWithMin[0].orgName
          )} requires a lockout of less than ${lowestMaxLockoutMinutes} minutes.`
        )
      );
      return exit();
    } else {
      console.log(
        chalk.bold(
          `You can't  set a lockout of ${minutes} minutes because these orgs require a lockout of less than ${lowestMaxLockoutMinutes} minutes: ${chalk.cyan(
            accountsWithMin.map(R.prop("orgName")).join(", ")
          )}`
        )
      );
      return exit();
    }
  }

  const res = await dispatch({
    type: Client.ActionType.SET_DEVICE_LOCKOUT,
    payload: { lockoutMs },
  });

  if (res.success) {
    console.log(chalk.bold("Lockout set."));
    printDeviceSettings(res.state);
  } else {
    return exit(1, chalk.bold("There was a problem setting the lockout."));
  }

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

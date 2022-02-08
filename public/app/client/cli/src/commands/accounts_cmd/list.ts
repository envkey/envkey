import { exit } from "../../lib/process";
import { initCore } from "../../lib/core";
import {
  listAccounts,
  printNoAccountsHelp,
  printDeviceSettings,
} from "../../lib/auth";
import { BaseArgs } from "../../types";
import chalk from "chalk";
import { Argv } from "yargs";
import { autoModeOut } from "../../lib/console_io";
import * as R from "ramda";

export const command = ["list", "$0"];
export const desc = "List the EnvKey accounts stored on this device.";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  const { state } = await initCore(argv, false);

  const numAccounts =
    Object.keys(state.orgUserAccounts).length +
    state.pendingSelfHostedDeployments.length;

  printDeviceSettings(state);
  console.log("");

  if (numAccounts == 0) {
    printNoAccountsHelp();
    return exit();
  }

  listAccounts(state);
  autoModeOut({
    accounts: Object.keys(state.orgUserAccounts).map((id) =>
      R.pick(
        ["userId", "orgId", "orgName", "hostUrl"],
        state.orgUserAccounts[id]
      )
    ),
  });

  if (numAccounts > 1) {
    console.log(
      "\nUse",
      chalk.bold("envkey accounts set-default"),
      `to change the default account.\n`
    );
  } else {
    console.log("");
  }

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

import { unlock } from "../../lib/crypto";
import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import chalk from "chalk";

export const command = "unlock";
export const desc = "Unlock EnvKey.";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  let { state } = await initCore(argv, false, undefined, true);

  if (!state.locked) {
    console.log(chalk.bold("EnvKey is already unlocked."));
    return exit();
  }

  state = await unlock();

  if (state.locked) {
    return exit(1, chalk.bold("There was a problem unlocking EnvKey."));
  }
  console.log(chalk.bold("EnvKey is now unlocked."));

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { BaseArgs } from "../../types";
import { stopCore } from "../../lib/core";

export const command = "stop";
export const desc = "Stop the EnvKey local server process.";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  const res = await stopCore();
  if (!res) {
    console.log("EnvKey core process isn't running.");
  }

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

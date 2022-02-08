import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { BaseArgs } from "../../types";
import { restartCore } from "../../lib/core";

export const command = "restart";
export const desc = "Restart the EnvKey core process.";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  const res = await restartCore();
  console.error(
    res
      ? "Restarted EnvKey core process."
      : "EnvKey core process isn't running."
  );

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

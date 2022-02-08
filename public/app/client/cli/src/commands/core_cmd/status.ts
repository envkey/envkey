import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { BaseArgs } from "../../types";
import { isAlive } from "@core/lib/core_proc";

export const command = ["status", "$0"];
export const desc = "Get EnvKey core process status.";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  const alive = await isAlive();

  console.log(
    alive
      ? "EnvKey core process is running."
      : "EnvKey core process is not running."
  );

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

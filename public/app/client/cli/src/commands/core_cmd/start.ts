import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { BaseArgs } from "../../types";
import { startCore } from "../../lib/core";

export const command = "start";
export const desc = "Start the EnvKey core process.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.option("inline", {
    type: "boolean",
    describe: "start EnvKey core process within the current process",
  });
export const handler = async (
  argv: BaseArgs & { inline?: boolean }
): Promise<void> => {
  const res = await startCore(argv.inline);

  console.log(
    res
      ? "Started EnvKey core process."
      : "EnvKey core process is already running."
  );

  if (!argv.inline) {
    // need to manually exit process since yargs doesn't properly wait for async handlers
    return exit();
  }
};

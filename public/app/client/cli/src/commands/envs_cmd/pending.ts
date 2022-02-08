import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { fetchEnvsIfNeeded, getPending } from "../../lib/envs";
import chalk from "chalk";
import { graphTypes } from "@core/lib/graph";
import * as R from "ramda";
import { autoModeOut } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = "pending";
export const desc = "List pending environment changes.";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  let { auth, state } = await initCore(argv, true);

  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  const envParentIds = R.uniq(
    state.pendingEnvUpdates.map(({ meta: { envParentId } }) => envParentId)
  );
  state = await fetchEnvsIfNeeded(state, envParentIds);

  const [summary, pending, diffsByEnvironmentId] = getPending(state);

  if (pending) {
    console.log(summary, "\n");
    console.log(pending);

    console.log(
      "\nUse",
      chalk.bold("envkey commit"),
      "or",
      chalk.bold("envkey reset"),
      "to selectively commit or cancel your changes.\n"
    );
  } else {
    console.log(chalk.bold("\nNo changes pending.\n"));
  }

  autoModeOut({
    pending: Object.keys(diffsByEnvironmentId).length
      ? diffsByEnvironmentId
      : null,
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

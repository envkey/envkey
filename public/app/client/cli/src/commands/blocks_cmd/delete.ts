import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz, graphTypes } from "@core/lib/graph";

import { Api } from "@core/types";
import chalk from "chalk";
import * as R from "ramda";
import { logAndExitIfActionFailed } from "../../lib/args";
import { getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = "delete [name]";
export const desc = "Delete a block and all its config from apps.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("name", { type: "string", describe: "block name" });
export const handler = async (
  argv: BaseArgs & { name?: string }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);

  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  const blockChoices = R.sortBy(
    R.prop("message"),
    authz.getDeletableBlocks(state.graph, auth.userId).map((block) => ({
      name: block.id,
      message: chalk.bold(block.name),
    }))
  );
  if (!blockChoices.length) {
    return exit(
      1,
      chalk.red("There are no blocks for which you have permission to delete.")
    );
  }
  const name =
    argv.name ??
    (
      await prompt<{ name: string }>({
        type: "autocomplete",
        name: "name",
        required: true,
        message: "Block to delete:",
        choices: blockChoices,
      })
    ).name;

  // allow deleting by name or id
  const block = graphTypes(state.graph).blocks.find(
    (b) => b.name === name || b.id === name
  );
  if (!block) {
    return exit(1, chalk.red.bold(`Block not found.`));
  }
  if (!authz.canDeleteBlock(state.graph, auth.userId, block.id)) {
    return exit(1, chalk.red("You don't have permission to delete the block."));
  }

  const res = await dispatch({
    type: Api.ActionType.DELETE_BLOCK,
    payload: {
      id: block.id,
    },
  });

  await logAndExitIfActionFailed(res, "Deleting the block failed.");

  console.log(chalk.bold(`Block ${block.name} (${block.id}) was deleted!`));

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

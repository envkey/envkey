import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz, getAppRoleForUserOrInvitee, graphTypes } from "@core/lib/graph";

import { Api } from "@core/types";
import chalk from "chalk";
import * as R from "ramda";
import Table from "cli-table3";
import { getEnvironmentTree } from "../../lib/envs";
import { logAndExitIfActionFailed } from "../../lib/args";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = "create [name]";
export const desc =
  "Create a reusable config block that can be connected to any number of apps.";
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

  if (!authz.canCreateBlock(state.graph, auth.userId)) {
    return exit(1, chalk.red("You don't have permission to create blocks."));
  }

  const name =
    argv.name ??
    (
      await prompt<{ name: string }>({
        type: "input",
        name: "name",
        message: "Block name:",
      })
    ).name;

  const res = await dispatch({
    type: Api.ActionType.CREATE_BLOCK,
    payload: {
      name,
      settings: {
        autoCaps: undefined,
      },
    },
  });

  await logAndExitIfActionFailed(
    res,
    `Creating the block ${chalk.bold(name)} failed.`
  );

  state = res.state;

  const newBlock = graphTypes(state.graph).blocks.find(
    R.propEq("createdAt", state.graphUpdatedAt)
  );
  if (!newBlock) {
    return exit(
      1,
      chalk.red.bold("Failed to fetch block after successful creation.")
    );
  }

  console.log(chalk.bold("Block created.\n"));

  const table = new Table({
    colWidths: [15, 40],
  });

  table.push(
    ["Block Name", chalk.bold(newBlock.name)],
    ["Environments", chalk.bold(getEnvironmentTree(state.graph, newBlock.id))]
  );

  console.log(table.toString());
  console.log("");
  autoModeOut({ name: newBlock.name, id: newBlock.id });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

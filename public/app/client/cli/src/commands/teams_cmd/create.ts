import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz, graphTypes } from "@core/lib/graph";
import { Api, Client } from "@core/types";
import chalk from "chalk";
import * as R from "ramda";
import Table from "cli-table3";
import { logAndExitIfActionFailed } from "../../lib/args";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = "create [name]";
export const desc = "Create a team.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("name", { type: "string", describe: "team name" });
export const handler = async (
  argv: BaseArgs & { name?: string }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);

  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  if (!authz.canManageUserGroups(state.graph, auth.userId)) {
    return exit(1, chalk.red("You don't have permission to create teams."));
  }

  const name =
    argv.name ??
    (
      await prompt<{ name: string }>({
        type: "input",
        name: "name",
        message: "Team name:",
      })
    ).name;

  const res = await dispatch({
    type: Api.ActionType.CREATE_GROUP,
    payload: {
      objectType: "orgUser",
      name,
    },
  });

  await logAndExitIfActionFailed(
    res,
    `Creating the team ${chalk.bold(name)} failed.`
  );

  state = res.state;

  const newGroup = R.last(
    R.sortBy(
      R.prop("createdAt"),
      graphTypes(state.graph).groups.filter((g) => g.objectType === "orgUser")
    )
  )!;

  console.log(chalk.bold("Team created.\n"));

  autoModeOut({ name: newGroup.name, id: newGroup.id });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

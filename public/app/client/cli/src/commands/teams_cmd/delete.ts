import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import * as g from "@core/lib/graph";
import { Rbac, Client, Model } from "@core/types";
import chalk from "chalk";
import * as R from "ramda";
import { logAndExitIfActionFailed } from "../../lib/args";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = "delete [team]";
export const desc = "Add a member to a team.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("team", { type: "string", describe: "team name or id" });
export const handler = async (
  argv: BaseArgs & { team?: string }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);

  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  if (!g.authz.canManageUserGroups(state.graph, auth.userId)) {
    return exit(1, chalk.red("You don't have permission to manage teams."));
  }

  // choose a team
  const teamChoices = R.sortBy(
    R.prop("name"),
    g
      .graphTypes(state.graph)
      .groups.filter((g) => g.objectType === "orgUser")
      .map((g) => ({
        name: g.name,
        message: chalk.bold(g.name),
      }))
  );

  if (!teamChoices.length) {
    return exit(1, chalk.red.bold("There are no teams you can delete."));
  }

  const teamNameOrId =
    argv.team ??
    ((
      await prompt<{ team: string }>({
        type: "autocomplete",
        name: "team",
        message: "Team:",
        choices: teamChoices,
      })
    ).team as string);

  const { groups } = g.graphTypes(state.graph);
  const team = groups.find(
    (g) =>
      g.objectType == "orgUser" &&
      (g.name === teamNameOrId || g.id === teamNameOrId)
  );

  if (!team) {
    return exit(1, chalk.red.bold("Team not found"));
  }

  if (!isAutoMode()) {
    const { confirm } = await prompt<{ confirm: boolean }>({
      type: "confirm",
      name: "confirm",
      message: chalk.bold(
        `Delete ${team.name}? This action cannot be reversed.`
      ),
    });

    if (!confirm) {
      console.log(chalk.bold("Team deletion aborted."));
      return exit();
    }
  }

  const res = await dispatch({
    type: Api.ActionType.DELETE_GROUP,
    payload: {
      id: team.id,
    },
  });

  await logAndExitIfActionFailed(res, "Deleting the group failed.");

  console.log(chalk.bold(`Team ${team.name} (${team.id}) was deleted.`));

  autoModeOut({});

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

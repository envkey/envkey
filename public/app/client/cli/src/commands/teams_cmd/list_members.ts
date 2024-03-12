import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz, graphTypes } from "@core/lib/graph";
import { Api, Model } from "@core/types";
import chalk from "chalk";
import * as R from "ramda";
import Table from "cli-table3";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = "members [team]";
export const desc = "List team members.";
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

  if (!authz.canManageUserGroups(state.graph, auth.userId)) {
    return exit(1, chalk.red("You don't have permission to manage teams."));
  }

  // choose a team
  const teamChoices = R.sortBy(
    R.prop("name"),
    graphTypes(state.graph)
      .groups.filter((g) => g.objectType === "orgUser")
      .map((g) => ({
        name: g.name,
        message: chalk.bold(g.name),
      }))
  );

  if (!teamChoices.length) {
    return exit(
      1,
      chalk.red.bold("There are no teams you can list members for.")
    );
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

  const { groups, groupMemberships } = graphTypes(state.graph);
  const team = groups.find(
    (g) =>
      g.objectType == "orgUser" &&
      (g.name === teamNameOrId || g.id === teamNameOrId)
  );
  if (!team) {
    return exit(1, chalk.red.bold("Team not found"));
  }

  const memberships = groupMemberships.filter((gm) => gm.groupId === team.id);

  const table = new Table({
    head: ["Name", "Email"],
    style: {
      head: [], //disable colors in header cells
    },
  });

  for (let membership of memberships) {
    const user = state.graph[membership.objectId] as Model.OrgUser;
    table.push([user.firstName + " " + user.lastName, user.email]);
  }

  console.log(table.toString());

  autoModeOut({
    members: memberships.map((membership) => {
      const user = state.graph[membership.objectId] as Model.OrgUser;
      return {
        name: user.firstName + " " + user.lastName,
        email: user.email,
      };
    }),
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

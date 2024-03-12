import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz, graphTypes } from "@core/lib/graph";
import { Api, Model } from "@core/types";
import chalk from "chalk";
import * as R from "ramda";
import { logAndExitIfActionFailed } from "../../lib/args";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = "remove-member [team] [person]";
export const desc = "Remove a member from a team.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("team", { type: "string", describe: "team name or id" })
    .positional("person", { type: "string", describe: "email address or id" });
export const handler = async (
  argv: BaseArgs & { team?: string; person?: string }
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
      chalk.red.bold("There are no teams you can remove members for.")
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

  const { groups, orgUsers } = graphTypes(state.graph);
  const team = groups.find(
    (g) =>
      g.objectType == "orgUser" &&
      (g.name === teamNameOrId || g.id === teamNameOrId)
  );

  if (!team) {
    return exit(1, chalk.red.bold("Team not found"));
  }

  let membership: Model.GroupMembership | undefined;

  if (argv.person) {
    membership = graphTypes(state.graph).groupMemberships.find((m) => {
      const user = state.graph[m.objectId] as Model.OrgUser;

      (m.groupId === team.id && user.email === argv.person) ||
        user.id === argv.person;
    });
  }

  if (!membership) {
    const userChoices: { name: string; message: string }[] = [];
    for (const membership of graphTypes(state.graph).groupMemberships) {
      if (membership.groupId == team.id) {
        const user = state.graph[membership.objectId] as Model.OrgUser;

        userChoices.push({
          name: membership.id,
          message: user.email,
        });
      }
    }

    if (!userChoices.length) {
      return exit(1, chalk.red.bold("No users found"));
    }

    const membershipId = (
      await prompt<{ id: string }>({
        type: "autocomplete",
        name: "id",
        message: "Person:",
        choices: userChoices,
      })
    ).id as string;
    membership = state.graph[membershipId] as Model.GroupMembership;
  }

  if (!membership) {
    return exit(1, chalk.red.bold("User not found"));
  }

  const res = await dispatch({
    type: Api.ActionType.DELETE_GROUP_MEMBERSHIP,
    payload: { id: membership.id },
  });

  await logAndExitIfActionFailed(
    res,
    `Removing the user from the team ${chalk.bold(team.name)} failed.`
  );

  console.log(
    chalk.bold((state.graph[membership.objectId] as Model.OrgUser).email) +
      " removed from " +
      chalk.bold(team.name)
  );

  autoModeOut({ team: team.name, user: membership.objectId });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

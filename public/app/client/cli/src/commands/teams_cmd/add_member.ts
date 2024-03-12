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

export const command = "add-member [team] [person]";
export const desc = "Add a member to a team.";
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
    return exit(
      1,
      chalk.red.bold("There are no teams you can add members to.")
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

  const { groups, orgUsers } = g.graphTypes(state.graph);
  const team = groups.find(
    (g) =>
      g.objectType == "orgUser" &&
      (g.name === teamNameOrId || g.id === teamNameOrId)
  );

  if (!team) {
    return exit(1, chalk.red.bold("Team not found"));
  }

  const memberIds = new Set(
    (g.getGroupMembershipsByGroupId(state.graph)[team.id] ?? []).map(
      R.prop("objectId")
    )
  );

  // choose a person
  const grantableUsers = orgUsers.filter(({ id, orgRoleId, deactivatedAt }) => {
    if (deactivatedAt) {
      return false;
    }

    if (memberIds.has(id)) {
      return false;
    }
    const orgRole = state.graph[orgRoleId] as Rbac.OrgRole;
    return !orgRole.autoAppRoleId;
  });

  const personChoices = R.sortBy(
    R.prop("message"),
    grantableUsers.map((u) => ({
      name: u.id,
      message: chalk.bold(u.email),
    }))
  );

  if (!personChoices.length) {
    return exit(
      1,
      chalk.red.bold("There are no users for which you may grant access.")
    );
  }

  let user: Model.OrgUser | undefined;

  if (argv.person) {
    user = orgUsers.find((u) => u.email === argv.person);
  }

  if (!user) {
    const userId = (
      await prompt<{ person: string }>({
        type: "autocomplete",
        name: "person",
        message: "Person:",
        choices: personChoices,
      })
    ).person as string;
    user = orgUsers.find((u) => u.id === userId);
  }

  if (!user) {
    return exit(1, chalk.red.bold("User not found"));
  }

  const res = await dispatch({
    type: Client.ActionType.CREATE_GROUP_MEMBERSHIPS,
    payload: [{ groupId: team.id, objectId: user.id }],
  });

  await logAndExitIfActionFailed(
    res,
    `Adding ${chalk.bold(user.email)} to the team ${chalk.bold(
      team.name
    )} failed.`
  );

  console.log(chalk.bold(user.email) + " added to " + chalk.bold(team.name));

  autoModeOut({ team: team.name, user: user.email });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import chalk from "chalk";
import { Client, Rbac } from "@core/types";
import {
  findUser,
  logAndExitIfActionFailed,
  sortByPredefinedOrder,
} from "../../lib/args";
import { authz, graphTypes } from "@core/lib/graph";
import * as R from "ramda";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["update-org-role [person] [org_role]"];
export const desc = "Change a person's org role.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("person", {
      type: "string",
      describe: "email address",
    })
    .positional("org_role", {
      type: "string",
      describe: "org role",
    });
export const handler = async (
  argv: BaseArgs & { person?: string; org_role?: string }
): Promise<void> => {
  const prompt = getPrompt();
  const { state, auth } = await initCore(argv, true);
  // override account from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  let orgRoleId: string | undefined;
  const orgRoles = graphTypes(state.graph).orgRoles;
  const orgRoleNameOrId = argv["org_role"];
  const orgRolesById = R.indexBy(R.prop("id"), orgRoles);
  if (orgRoleNameOrId && orgRolesById[orgRoleNameOrId]) {
    orgRoleId = orgRolesById[orgRoleNameOrId].id;
  } else if (orgRoleNameOrId) {
    const orgRolesByName = R.indexBy(
      R.pipe(R.prop("name"), R.toLower),
      orgRoles
    );
    const orgRole = orgRolesByName[orgRoleNameOrId.toLowerCase()];
    if (orgRole) {
      orgRoleId = orgRole.id;
    }
  }

  const userChoices = R.sortBy(
    R.prop("message"),
    authz.getRoleUpdateableUsers(state.graph, auth.userId).map((u) => ({
      name: u.id,
      message: `${u.email} - ${u.firstName} ${u.lastName} - ${
        (state.graph[u.orgRoleId] as Rbac.OrgRole).name
      }`,
    }))
  );
  if (!userChoices.length) {
    return exit(
      1,
      chalk.red(
        "There are no users for which you have permission to modify the organization role."
      )
    );
  }

  const userName =
    argv.person ??
    (
      await prompt<{ userId: string }>({
        type: "autocomplete",
        name: "userId",
        message: "Select a user:",
        initial: 0,
        required: true,
        choices: userChoices,
      })
    ).userId;

  const user = findUser(state.graph, userName);
  if (!user) {
    return exit(1, chalk.red.bold("User not found"));
  }
  if (user.type === "cliUser") {
    return exit(
      1,
      chalk.red.bold("Cannot modify CLI key role with this command")
    );
  }

  const currentRole = state.graph[user.orgRoleId] as Rbac.OrgRole;

  console.log(
    `\n${chalk.bold(user.email)} has current role: ${chalk.bold(
      currentRole.name
    )}\n`
  );

  const newRoleChoices = sortByPredefinedOrder(
    ["Basic User", "Org Admin", "Org Owner"],
    authz.getOrgRolesAssignableToUser(state.graph, auth.userId, user.id),
    "defaultName"
  ).map((or) => ({
    name: or.id,
    message: `${chalk.bold(or.name)} - ${or.description}`,
  }));
  if (!newRoleChoices) {
    return exit(
      1,
      chalk.red("You are not allowed to assign any other roles to this user.")
    );
  }

  const newRoleId =
    orgRoleId ??
    (
      await prompt<{ newRoleId: string }>({
        type: "select",
        name: "newRoleId",
        message: "Select a new role:",
        required: true,
        choices: newRoleChoices,
      })
    ).newRoleId;
  if (newRoleId === currentRole.id) {
    console.log(`${chalk.bold("The role is the same.")}`);
    return exit();
  }
  if (!authz.canUpdateUserRole(state.graph, auth.userId, user.id, newRoleId)) {
    return exit(
      1,
      chalk.red("You are not allowed to assign that role to the user.")
    );
  }

  const res = await dispatch({
    type: Client.ActionType.UPDATE_USER_ROLES,
    payload: [
      {
        id: user.id,
        orgRoleId: newRoleId,
      },
    ],
  });

  await logAndExitIfActionFailed(
    res,
    "Changing the user organization role failed."
  );

  console.log(chalk.bold("The role for the user was updated."));
  autoModeOut({ id: user.id, type: user.type, orgRoleId: newRoleId });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore, dispatch } from "../../lib/core";
import { BaseArgs } from "../../types";
import { Client, Model, Rbac } from "@core/types";
import {
  authz,
  graphTypes,
  getAppUserGroupsByComposite,
} from "@core/lib/graph";
import chalk from "chalk";
import {
  findApp,
  findUser,
  getAppRoleInviteChoices,
  logAndExitIfActionFailed,
  requireUserAppRoleAndGrant,
} from "../../lib/args";
import * as R from "ramda";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["update-access [app] [person-or-team] [app-role]"];
export const desc = "Update app access level.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("app", { type: "string", describe: "app name or id" })
    .positional("person-or-team", {
      type: "string",
      describe: "email address or team name or id",
    })
    .positional("app-role", { type: "string", describe: "app role" });
export const handler = async (
  argv: BaseArgs & {
    app?: string;
    "person-or-team"?: string;
    "app-role"?: string;
  }
): Promise<void> => {
  const prompt = getPrompt();
  const { state, auth } = await initCore(argv, true);
  let app: Model.App | undefined;
  let emailOrTeamNameOrId: string | undefined = argv["person-or-team"];
  let appRoleId: string | undefined;
  const appRoles = graphTypes(state.graph).appRoles;
  const appRoleNameOrId = argv["app-role"];
  const appRolesById = R.indexBy(R.prop("id"), appRoles);
  if (appRoleNameOrId && appRolesById[appRoleNameOrId]) {
    appRoleId = appRolesById[appRoleNameOrId].id;
  } else if (appRoleNameOrId) {
    const appRolesByName = R.indexBy(
      R.pipe(R.prop("name"), R.toLower),
      appRoles
    );
    const appRole = appRolesByName[appRoleNameOrId.toLowerCase()];
    if (appRole) {
      appRoleId = appRole.id;
    }
  }

  const teamsByName = R.indexBy(
    R.prop("name"),
    graphTypes(state.graph).groups.filter((g) => g.objectType === "orgUser")
  );

  if (argv["app"]) {
    app = findApp(state.graph, argv["app"]);
  }

  // detection from ENVKEY
  if (!app) {
    if (tryApplyDetectedAppOverride(auth.userId, argv)) {
      return handler(argv);
    }
    const appId = argv["detectedApp"]?.appId?.toLowerCase();
    if (appId) {
      const emailOrTeamNameOrIdIsFirst =
        argv["app"]?.includes("@") ||
        state.graph[argv["app"] ?? ""]?.type === "orgUser" ||
        state.graph[argv["app"] ?? ""]?.type === "cliUser" ||
        state.graph[argv["app"] ?? ""]?.type === "group" ||
        teamsByName[argv["app"] ?? ""];
      const otherArgsValid = !argv["app"] || emailOrTeamNameOrIdIsFirst;
      if (otherArgsValid) {
        app = state.graph[appId] as Model.App | undefined;
        if (app) {
          console.log("Detected app", chalk.bold(app.name), "\n");
          // shuffle left
          if (emailOrTeamNameOrIdIsFirst) {
            emailOrTeamNameOrId = argv["app"];
            if (argv["person-or-team"]) {
              appRoleId = argv["person-or-team"];
            }
          }
        }
      }
    }
  }

  // choose an app
  if (!app) {
    const appChoices = R.sortBy(
      R.prop("name"),
      authz.getAccessRemoveableApps(state.graph, auth.userId).map((a) => ({
        name: a.name,
        message: chalk.bold(a.name),
      }))
    );
    if (!appChoices.length) {
      return exit(
        1,
        chalk.red.bold("Create an app before adding user access.")
      );
    }

    const appName = (argv.app ??
      (
        await prompt<{ app: string }>({
          type: "autocomplete",
          name: "app",
          message: "App:",
          choices: appChoices,
        })
      ).app) as string;
    app = findApp(state.graph, appName);
  }

  if (!app) {
    return exit(1, chalk.red.bold("App not found"));
  }

  const updateableUsers = R.sortBy(
    R.prop("message"),
    authz
      .getAccessRemoveableUsersForApp(state.graph, auth.userId, app.id)
      .map((u) => ({
        name: u.id,
        message:
          u.type === "cliUser"
            ? `CLI - ${u.name}`
            : `${u.email} - ${u.firstName} ${u.lastName}`,
      }))
  );

  const updateableTeams = R.sortBy(
    R.prop("message"),
    authz
      .getAccessRemoveableUserGroupsForApp(state.graph, auth.userId, app.id)
      .map((g) => ({
        name: g.id,
        message: `Team - ${g.name}`,
      }))
  );

  if (updateableUsers.length + updateableTeams.length === 0) {
    return exit(
      1,
      chalk.red.bold(
        "You can't update any person, CLI key, or team's access level for this app."
      )
    );
  }

  emailOrTeamNameOrId = (emailOrTeamNameOrId ??
    (
      await prompt<{ person: string }>({
        type: "autocomplete",
        name: "person-or-team",
        message: "User or team:",
        choices: updateableTeams.concat(updateableUsers),
      })
    ).person) as string;
  const user = findUser(state.graph, emailOrTeamNameOrId);
  let team: Model.Group | undefined;
  if (!user) {
    team =
      teamsByName[emailOrTeamNameOrId] ??
      (state.graph[emailOrTeamNameOrId] as Model.Group);

    if (!team) {
      return exit(1, chalk.red.bold("User or team not found"));
    }

    if (!authz.canManageUserGroups(state.graph, auth.userId)) {
      return exit(1, chalk.red("You don't have permission to manage teams."));
    }
  }

  if (user) {
    requireUserAppRoleAndGrant(state.graph, app.id, user.id);
  } else if (team) {
    const appUserGroup = getAppUserGroupsByComposite(state.graph)[
      [app.id, team.id].join("|")
    ];

    if (!appUserGroup) {
      return exit(1, chalk.red.bold("Team does not have access to this app."));
    }
  }

  if (!appRoleId) {
    appRoleId = (
      await prompt<{ appRoleId: string }>({
        type: "select",
        name: "appRoleId",
        message: "App Role:",
        choices: getAppRoleInviteChoices(
          state.graph,
          app.id,
          auth.userId,
          user?.id ?? team!.id
        ),
      })
    ).appRoleId as string;
  }
  const appRole = state.graph[appRoleId] as Rbac.AppRole;
  if (!appRole) {
    return exit(1, chalk.red.bold("App role not found"));
  }

  const res = await dispatch({
    type: Client.ActionType.GRANT_APPS_ACCESS,
    payload: [
      user
        ? {
            appId: app.id,
            appRoleId: appRole.id,
            userId: user.id,
          }
        : {
            appId: app.id,
            appRoleId: appRole.id,
            userGroupId: team!.id,
          },
    ],
  });

  await logAndExitIfActionFailed(
    res,
    `Failed changing the ${user ? "user" : "team"} access to the app role.`
  );

  console.log(chalk.bold("App access was updated."));
  autoModeOut({
    id: (res.resultAction as any)?.id,
    appId: app.id,
    appRoleId: appRole.id,
    appRoleName: appRole.name,
    ...(user
      ? {
          userId: user.id,
        }
      : {
          userGroupId: team!.id,
        }),
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

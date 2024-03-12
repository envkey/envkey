import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { BaseArgs } from "../../types";
import { initCore, dispatch } from "../../lib/core";
import {
  authz,
  graphTypes,
  getAppUserGroupsByComposite,
} from "@core/lib/graph";

import { Api, Model } from "@core/types";
import chalk from "chalk";
import {
  findApp,
  findUser,
  logAndExitIfActionFailed,
  requireUserAppRoleAndGrant,
} from "../../lib/args";
import * as R from "ramda";
import { getPrompt, autoModeOut } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["revoke-access [app] [person-or-team]"];
export const desc = "Revoke app access.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("app", { type: "string", describe: "app name or id" })
    .positional("person-or-team", {
      type: "string",
      describe: "email address or team name or id",
    });
export const handler = async (
  argv: BaseArgs & { app?: string; "person-or-team"?: string }
): Promise<void> => {
  const prompt = getPrompt();
  const { state, auth } = await initCore(argv, true);
  let app: Model.App | undefined;
  let emailOrTeamNameOrId: string | undefined = argv["person-or-team"];

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
      console.log(
        chalk.bold("There are no apps for which you may revoke user access.")
      );
      return exit();
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

  if (!emailOrTeamNameOrId) {
    const revokableUsers = R.sortBy(
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

    const revokableTeams = R.sortBy(
      R.prop("message"),
      authz
        .getAccessRemoveableUserGroupsForApp(state.graph, auth.userId, app.id)
        .map((g) => ({
          name: g.id,
          message: `Team - ${g.name}`,
        }))
    );

    if (revokableUsers.length + revokableTeams.length == 0) {
      return exit(
        1,
        chalk.red.bold(
          "No users, CLI keys, or teams are available to remove access for."
        )
      );
    }
    emailOrTeamNameOrId = (
      await prompt<{ personOrTeam: string }>({
        type: "autocomplete",
        name: "personOrTeam",
        message: "User, CLI key, or team:",
        choices: revokableTeams.concat(revokableUsers),
      })
    ).personOrTeam as string;
  }

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
    const appUserGrant = requireUserAppRoleAndGrant(
      state.graph,
      app.id,
      user.id
    );
    const res = await dispatch({
      type: Api.ActionType.REMOVE_APP_ACCESS,
      payload: {
        id: appUserGrant.id,
      },
    });

    await logAndExitIfActionFailed(res, "Failed removing user's app access.");
  } else if (team) {
    const appUserGroup = getAppUserGroupsByComposite(state.graph)[
      [app.id, team.id].join("|")
    ];

    if (!appUserGroup) {
      return exit(1, chalk.red.bold("Team does not have access to this app."));
    }

    const res = await dispatch({
      type: Api.ActionType.DELETE_APP_USER_GROUP,
      payload: {
        id: appUserGroup.id,
      },
    });

    await logAndExitIfActionFailed(res, "Failed removing team's app access.");
  }

  console.log(chalk.bold("Access was removed."));

  autoModeOut({});

  return exit();
};

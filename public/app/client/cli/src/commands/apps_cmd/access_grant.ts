import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore, dispatch } from "../../lib/core";
import { BaseArgs } from "../../types";
import { Client, Model, Rbac } from "@core/types";
import chalk from "chalk";
import {
  findApp,
  findUser,
  getAppRoleInviteChoices,
  logAndExitIfActionFailed,
} from "../../lib/args";
import { authz, getAppRoleForUserOrInvitee } from "@core/lib/graph";
import * as R from "ramda";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["grant-access [app] [person] [app_role_id]"];
export const desc = "Grant access to an app.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("app", { type: "string", describe: "app name" })
    .positional("person", { type: "string", describe: "email address" })
    .positional("app_role_id", { type: "string", describe: "app role id" });
export const handler = async (
  argv: BaseArgs & { app?: string; person?: string; app_role_id?: string }
): Promise<void> => {
  const prompt = getPrompt();
  const { state, auth } = await initCore(argv, true);
  let app: Model.App | undefined;
  let userEmail: string | undefined = argv["person"];
  let appRoleId: string | undefined = argv["app_role_id"];

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
      const userEmailIsFirst = argv["app"]?.includes("@");
      const otherArgsValid = !argv["app"] || userEmailIsFirst;
      if (otherArgsValid) {
        app = state.graph[appId] as Model.App | undefined;
        if (app) {
          console.log("Detected app", chalk.bold(app.name), "\n");
          // shuffle left
          if (userEmailIsFirst) {
            userEmail = argv["app"];
            if (argv["person"]) {
              appRoleId = argv["person"];
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
      authz.getAccessGrantableApps(state.graph, auth.userId).map((a) => ({
        name: a.name,
        message: chalk.bold(a.name),
      }))
    );
    if (!appChoices.length) {
      console.log(
        chalk.bold("There are no apps for which you may grant access.")
      );
      return exit();
    }

    const appName = (
      await prompt<{ app: string }>({
        type: "autocomplete",
        name: "app",
        message: "App:",
        choices: appChoices,
      })
    ).app as string;
    app = findApp(state.graph, appName);
  }

  if (!app) {
    return exit(1, chalk.red.bold("App not found"));
  }

  const invitableUsers = R.sortBy(
    R.prop("message"),
    authz
      .getAccessGrantableUsersForApp(state.graph, auth.userId, app.id)
      .map((u) => ({
        name: u.id,
        message:
          u.type === "cliUser"
            ? `CLI - ${u.name}`
            : `${u.email} - ${u.firstName} ${u.lastName}`,
      }))
  );
  if (!invitableUsers.length) {
    return exit(1, chalk.red.bold("No users are available to invite."));
  }
  const userName = (userEmail ??
    (
      await prompt<{ person: string }>({
        type: "autocomplete",
        name: "person",
        message: "User:",
        choices: invitableUsers,
      })
    ).person) as string;
  const user = findUser(state.graph, userName);
  if (!user) {
    return exit(1, chalk.red.bold("User not found"));
  }
  const existingAppRole = getAppRoleForUserOrInvitee(
    state.graph,
    app.id,
    user.id
  );
  if (existingAppRole) {
    return exit(
      1,
      `User already has access to this app with the app role ${chalk.red.bold(
        existingAppRole.name
      )}`
    );
  }

  if (!appRoleId) {
    appRoleId = (
      await prompt<{ app_role_id: string }>({
        type: "select",
        name: "app_role_id",
        message: "App Role:",
        choices: getAppRoleInviteChoices(
          state.graph,
          app.id,
          auth.userId,
          user.id
        ),
      })
    ).app_role_id as string;
  }
  const appRole = state.graph[appRoleId] as Rbac.AppRole;
  if (!appRole) {
    return exit(1, chalk.red.bold("App role not found"));
  }

  const res = await dispatch({
    type: Client.ActionType.GRANT_APPS_ACCESS,
    payload: [
      {
        appId: app.id,
        appRoleId: appRole.id,
        userId: user.id,
      },
    ],
  });

  await logAndExitIfActionFailed(
    res,
    "Failed giving the user access to the app role."
  );

  console.log(chalk.bold("App role access was added."));
  autoModeOut({
    id: (res.resultAction as any)?.payload?.id,
    appId: app.id,
    appRoleId: appRole.id,
    userId: user.id,
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

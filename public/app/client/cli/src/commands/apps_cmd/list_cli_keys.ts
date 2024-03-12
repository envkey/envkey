import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { BaseArgs } from "../../types";
import { initCore } from "../../lib/core";
import chalk from "chalk";
import { findApp, getAppChoices } from "../../lib/args";
import Table from "cli-table3";
import { getAppRoleForUserOrInvitee, graphTypes } from "@core/lib/graph";
import * as R from "ramda";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { Model } from "@core/types";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["cli-keys [app]"];
export const desc = "List CLI keys with access to a specific app.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("app", { type: "string", describe: "app name or id" });
export const handler = async (
  argv: BaseArgs & { app?: string }
): Promise<void> => {
  const prompt = getPrompt();
  const { state, auth } = await initCore(argv, true);
  let app: Model.App | undefined;

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
      const otherArgsValid = !argv["app"];
      if (otherArgsValid) {
        app = state.graph[appId] as Model.App | undefined;
        if (app) {
          console.log("Detected app", chalk.bold(app.name), "\n");
        }
      }
    }
  }

  if (!app) {
    const appChoices = getAppChoices(state.graph);
    if (!appChoices.length) {
      console.log(chalk.bold("Create an app before listing app CLI keys."));
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

  const cliUsers = R.sortBy(R.prop("name"), graphTypes(state.graph).cliUsers);

  if (cliUsers.length == 0) {
    console.log("No CLI keys have access to " + chalk.bold(app.name) + ".");
    return exit();
  }

  console.log(`CLI keys with access to ${chalk.bold(app.name)}:`);

  const table = new Table({
    head: ["Name", "App Role"],
    style: {
      head: [], //disable colors in header cells
    },
  });
  let cliUsersDisplay: any[] = [];

  for (let cliUser of cliUsers) {
    const appRole = getAppRoleForUserOrInvitee(state.graph, app.id, cliUser.id);
    if (!appRole) continue;

    table.push([chalk.bold(cliUser.name), chalk.bold(appRole.name)]);

    cliUsersDisplay.push({
      id: cliUser.id,
      name: cliUser.name,
      appRoleId: appRole.id,
      appRoleName: appRole.name,
    });
  }

  console.log(table.toString());
  autoModeOut({ cliUsers: cliUsersDisplay });
  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

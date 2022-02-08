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

export const command = ["collaborators [app]", "people [app]"];
export const desc = "List people with access to a specific app.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("app", { type: "string", describe: "app name" });
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
      console.log(
        chalk.bold("Create an app before listing app collaborators.")
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
  console.log(`People with access to ${chalk.bold(app.name)}:`);

  const table = new Table({
    head: ["Name", "Email", "App Role"],
    style: {
      head: [], //disable colors in header cells
    },
  });
  let orgUsersDisplay: any[] = [];
  for (let user of R.sortBy(
    (u) => [u.lastName, u.firstName].join(" "),
    graphTypes(state.graph).orgUsers
  )) {
    const appRole = getAppRoleForUserOrInvitee(state.graph, app.id, user.id);
    if (!appRole) continue;

    table.push([
      user.firstName + " " + chalk.bold(user.lastName),
      user.email,
      chalk.bold(appRole.name),
    ]);

    orgUsersDisplay.push({
      id: user.id,
      email: user.email,
      appRoleId: appRole.id,
      appRoleName: appRole.name,
    });
  }

  console.log(table.toString());
  autoModeOut({ orgUsers: orgUsersDisplay });
  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

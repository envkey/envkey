import chalk from "chalk";
import * as R from "ramda";
import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz } from "@core/lib/graph";
import { Api, Model } from "@core/types";
import { findApp, logAndExitIfActionFailed } from "../../lib/args";
import { getPrompt, isAutoMode } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["delete [app]"];
export const desc = "Delete an app and all its environments.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("app", { type: "string", describe: "app name" });
export const handler = async (
  argv: BaseArgs & { app: string | undefined }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);
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
    const appChoices = R.sortBy(
      R.prop("message"),
      authz.getDeletableApps(state.graph, auth.userId).map((app) => ({
        name: app.id,
        message: chalk.bold(app.name),
      }))
    );
    if (!appChoices) {
      return exit(
        1,
        chalk.red("There are no apps available for you to delete.")
      );
    }
    const appName = (
      await prompt<{ name: string }>({
        type: "autocomplete",
        name: "name",
        message: "App:",
        required: true,
        choices: appChoices,
      })
    ).name as string;

    app = findApp(state.graph, appName);
  }

  if (!app) {
    return exit(1, chalk.red.bold(`App not found.`));
  }

  if (!authz.canDeleteApp(state.graph, auth.userId, app.id)) {
    return exit(
      1,
      chalk.red.bold("You don't have permission to delete the app.")
    );
  }

  // sure, you want to - but should you?
  if (!isAutoMode()) {
    const { confirm } = await prompt<{ confirm: boolean }>({
      type: "confirm",
      name: "confirm",
      message: chalk.bold(
        `Delete ${app.name} and all config? This action cannot be reversed.`
      ),
    });

    if (!confirm) {
      console.log(chalk.bold("App deletion aborted."));
      return exit();
    }
  }

  const res = await dispatch({
    type: Api.ActionType.DELETE_APP,
    payload: {
      id: app.id,
    },
  });

  await logAndExitIfActionFailed(res, "Deleting the app failed.");

  console.log(chalk.bold(`App ${app.name} (${app.id}) was deleted!`));

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

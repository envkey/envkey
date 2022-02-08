import * as R from "ramda";
import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { graphTypes } from "@core/lib/graph";
import chalk from "chalk";
import { findApp, getAppChoices, writeEnvKeyTable } from "../../lib/args";
import { fetchEnvsIfNeeded } from "../../lib/envs";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";
import { Model } from "@core/types";

export const command = ["list [app]", "$0"];
export const desc = "List local ENVKEYs for an app.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("app", {
    type: "string",
    describe: "App name or id",
  });
export const handler = async (
  argv: BaseArgs & {
    app?: string;
  }
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
    const appChoices = getAppChoices(state.graph);
    if (!appChoices.length) {
      return exit(
        1,
        chalk.red("There are no apps available for viewing local keys.")
      );
    }

    const appName = (
      await prompt<{ app: string }>({
        type: "autocomplete",
        name: "app",
        message: "Select app:",
        initial: 0,
        choices: appChoices,
      })
    ).app as string;

    app = findApp(state.graph, appName);
  }

  if (!app) {
    console.log(
      chalk.bold(`The app does not exist, or you don't have access.`)
    );
    return exit();
  }

  const localKeys = R.sortBy(
    R.prop("name"),
    graphTypes(state.graph).localKeys
  ).filter(R.propEq("appId", app.id));

  if (!localKeys.length) {
    console.log(
      `There are no local keys for the app ${chalk.bold(app.name)}.`,
      "\n",
      `\nUse ${chalk.bold(
        "envkey local-keys create"
      )} to add a new local ENVKEY.`
    );
    return exit();
  }

  console.log(
    chalk.bold(
      `You have access to ${localKeys.length} local key${
        localKeys.length > 1 ? "s" : ""
      } for ${app.name}:`
    )
  );

  state = await fetchEnvsIfNeeded(state, [app.id]);

  writeEnvKeyTable(state.graph, localKeys, app.id);
  autoModeOut({
    localKeys: localKeys.map((k) =>
      R.pick(["id", "name", "environmentId", "appId"], k)
    ),
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

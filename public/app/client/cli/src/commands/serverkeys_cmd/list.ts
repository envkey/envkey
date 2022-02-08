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
import { Model } from "@core/types";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["list [app]", "$0"];
export const desc = "List server ENVKEYs for an app.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("app", {
    type: "string",
    describe: "App name or id",
  });
export const handler = async (
  argv: BaseArgs & { app?: string }
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
    const { apps } = graphTypes(state.graph);
    if (!apps.length) {
      const message =
        chalk.green.bold("Create an app before creating servers.") +
        chalk.green(
          `Servers are specific to apps and environments. Use ${chalk.bold(
            "envkey apps create"
          )} to add a new application.`
        );

      return exit(1, message);
    }
    const appName = (
      await prompt<{ app: string }>({
        type: "autocomplete",
        name: "app",
        message: "Select app:",
        initial: 0,
        choices: getAppChoices(state.graph),
      })
    ).app as string;

    // valid app?
    app = findApp(state.graph, appName);
  }

  if (!app) {
    console.log(
      chalk.bold(`The app does not exist, or you don't have access.`)
    );
    return exit();
  }

  const servers = R.sortBy(
    R.prop("name"),
    graphTypes(state.graph).servers
  ).filter(R.propEq("appId", app.id));

  if (!servers.length) {
    console.log(
      `There are no servers viewable for the app ${chalk.bold(app.name)}.`,
      "\n",
      `\nUse ${chalk.bold("envkey servers create")} to add a new server ENVKEY.`
    );
    return exit();
  }

  console.log(
    chalk.bold(
      `You have access to ${servers.length} server${
        servers.length > 1 ? "s" : ""
      } for ${app.name}:`
    )
  );
  state = await fetchEnvsIfNeeded(state, [app.id]);

  writeEnvKeyTable(state.graph, servers, app.id);
  autoModeOut({
    serverKeys: servers.map((k) => R.pick(["id", "name", "environmentId"], k)),
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

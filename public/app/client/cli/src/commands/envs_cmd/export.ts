import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz, getEnvironmentName } from "@core/lib/graph";
import { Client, Model } from "@core/types";
import chalk from "chalk";
import {
  findApp,
  getAppChoices,
  getEnvironmentChoices,
  logAndExitIfActionFailed,
  normalizeFilePath,
} from "../../lib/args";
import { findEnvironment, fetchEnvsIfNeeded } from "../../lib/envs";
import { Format } from "@core/lib/parse";
import { getPrompt } from "../../lib/console_io";
import {
  argIsEnvironment,
  tryApplyDetectedAppOverride,
} from "../../app_detection";

export const command = "export [app] [environment] [filepath]";
export const desc = "Export environment variables to a file.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("app", { type: "string", describe: "app name" })
    .positional("environment", {
      type: "string",
      describe: "environment name",
    })
    .positional("filepath", {
      type: "string",
      describe: "filepath",
    })
    .option("format", {
      type: "string",
      describe: "export file format",
      default: "json",
      choices: ["json", "yaml", "env", "json-pretty"],
    });
export const handler = async (
  argv: BaseArgs & {
    app?: string;
    environment?: string;
    filepath?: string;
    format: Format | string;
  }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);
  let app: Model.App | undefined;

  const appChoices = getAppChoices(state.graph);
  if (!appChoices.length) {
    console.log(
      `You don't have access to any apps. Apps can be created with ${chalk.bold(
        "envkey apps create"
      )}.`
    );
    return exit();
  }

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
      const envFirst = argIsEnvironment(state.graph, appId, argv["app"]);
      const otherArgsValid = !argv["app"] || envFirst;
      if (otherArgsValid) {
        app = state.graph[appId] as Model.App | undefined;
        if (app) {
          console.log("Detected app", chalk.bold(app.name), "\n");
          if (envFirst) {
            // shuffle right
            argv["filepath"] = argv["environment"];
            argv["environment"] = argv["app"];
          }
        }
      }
    }
  }

  if (!app) {
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
    return exit(1, chalk.red.bold("App not found."));
  }

  const environmentChoices = getEnvironmentChoices(
    state.graph,
    auth.userId,
    app.id
  );
  if (!environmentChoices) {
    return exit(
      1,
      chalk.red.bold(
        "No environments exist for the app, or you to not have access."
      )
    );
  }
  const environmentName = (argv.environment ??
    (
      await prompt<{ environment: string }>({
        type: "autocomplete",
        name: "environment",
        message: "Select app environment:",
        initial: 0,
        choices: environmentChoices,
      })
    ).environment) as string;
  const appEnv = findEnvironment(state.graph, app.id, environmentName);
  if (!appEnv || !authz.canReadEnv(state.graph, auth.userId, appEnv.id)) {
    return exit(
      1,
      chalk.red(
        `Environment ${chalk.bold(environmentName)} for ${chalk.bold(
          app.name
        )} is not available for export.`
      )
    );
  }

  const filePath = normalizeFilePath(
    argv.filepath ??
      (
        await prompt<{ filePath: string }>({
          type: "input",
          name: "filePath",
          message: `Output file path (${argv.format}):`,
          required: true,
        })
      ).filePath
  );

  await fetchEnvsIfNeeded(state, [app.id]);

  const res = await dispatch({
    type: Client.ActionType.EXPORT_ENVIRONMENT,
    payload: {
      format: argv.format as Format,
      filePath,
      envParentId: app.id,
      environmentId: appEnv.id,
    },
  });

  await logAndExitIfActionFailed(res, "Failed exporting environment.");

  state = res.state;
  console.log(
    `Successfully wrote ${chalk.bold(app.name)} (${getEnvironmentName(
      state.graph,
      appEnv.id
    )}) to ${chalk.bold(filePath)}`
  );

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

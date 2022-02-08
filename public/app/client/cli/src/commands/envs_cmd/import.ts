import fs from "fs";
import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz } from "@core/lib/graph";
import { Client, Model, Rbac } from "@core/types";
import chalk from "chalk";
import {
  findApp,
  getEnvironmentChoices,
  logAndExitIfActionFailed,
  normalizeFilePath,
} from "../../lib/args";
import { findEnvironment } from "../../lib/envs";
import { parseMultiFormat } from "@core/lib/parse";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import {
  argIsEnvironment,
  tryApplyDetectedAppOverride,
} from "../../app_detection";

export const command = "import [app] [environment] [filepath]";
export const desc = "Import environment variables from a file.";
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
    });
export const handler = async (
  argv: BaseArgs & { app?: string; environment?: string; filepath?: string }
): Promise<void> => {
  const prompt = getPrompt();
  const { state, auth } = await initCore(argv, true);
  let app: Model.App | undefined;

  const appChoices = authz.getAppsPassingEnvTest(
    state.graph,
    auth.userId,
    authz.canUpdateEnv
  );
  if (!appChoices.length) {
    console.log(
      "You don't have access to any apps for which environments can be updated."
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
  ).filter((choice) =>
    authz.canUpdateEnv(state.graph, auth.userId, choice.name)
  );
  if (!environmentChoices) {
    return exit(
      1,
      chalk.red.bold(
        "You don't have permission to update any environments for the app."
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
        )} is not available for import.`
      )
    );
  }

  // it is actually better not to call path.resolve() or anything fancy, because
  // fs.open it will be relative to the cwd, and still respect home `~/`.
  const filePath = normalizeFilePath(
    argv.filepath ??
      (
        await prompt<{ filePath: string }>({
          type: "input",
          name: "filePath",
          message: "Import file path:",
          required: true,
        })
      ).filePath
  ) as string;

  let parsed: { [k: string]: string } | null;
  try {
    const envFileText = fs.readFileSync(filePath, { encoding: "utf8" });
    parsed = parseMultiFormat(envFileText);
    if (!parsed) {
      return exit(
        1,
        chalk.red(
          `Failed parsing the environment file, or it is empty: ${chalk.bold(
            envFileText
          )}`
        )
      );
    }
  } catch (err) {
    return exit(1, chalk.red.bold("Failed reading environment file.") + err);
  }

  console.log("Successfully parsed environment...");

  const res = await dispatch({
    type: Client.ActionType.IMPORT_ENVIRONMENT,
    payload: {
      envParentId: app!.id,
      environmentId: appEnv.id,
      parsed,
    },
  });

  await logAndExitIfActionFailed(res, "Failed importing environment.");

  console.log(
    `Successfully imported ${chalk.bold(
      Object.keys(parsed).join(", ")
    )} to ${chalk.bold(app.name)} (${
      (state.graph[appEnv!.environmentRoleId] as Rbac.EnvironmentRole).name
    }) from  ${chalk.bold(filePath)}.\n Changes are pending. Use ${chalk.bold(
      "envkey commit"
    )} to finish importing.`
  );

  autoModeOut({
    appId: app.id,
    environmentId: appEnv.id,
    entryKeys: Object.keys(parsed),
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz, graphTypes } from "@core/lib/graph";
import { Api, Model } from "@core/types";
import chalk from "chalk";
import {
  findApp,
  findKeyableParent,
  getLocalKeyChoices,
  logAndExitIfActionFailed,
} from "../../lib/args";
import * as R from "ramda";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import {
  argIsEnvironment,
  tryApplyDetectedAppOverride,
} from "../../app_detection";

export const command = ["delete [app] [key-name]"];
export const desc = "Delete a local ENVKEY.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("app", { type: "string", describe: "app name" })
    .positional("key-name", {
      type: "string",
      describe: "local key name",
    });
export const handler = async (
  argv: BaseArgs & { app?: string; "key-name"?: string }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);
  let app: Model.App | undefined;
  let keyName: string | undefined = argv["key-name"];

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
      const firstKeyName =
        argv["app"] &&
        Boolean(
          graphTypes(state.graph).localKeys.find((k) =>
            [k.name, k.id].includes(argv["app"]!)
          )
        );
      const otherArgsValid = !argv["app"] || firstKeyName;
      if (otherArgsValid) {
        app = state.graph[appId] as Model.App | undefined;
        if (app) {
          console.log("Detected app", chalk.bold(app.name), "\n");
          if (firstKeyName) {
            // shift left
            keyName = argv["app"];
          }
        }
      }
    }
  }

  if (!app) {
    const appChoices = R.sortBy(
      R.prop("message"),
      authz
        .getAppsPassingKeyableTest(
          state.graph,
          auth.userId,
          authz.canDeleteLocalKey
        )
        .map((a) => ({
          name: a.id,
          message: chalk.bold(a.name),
        }))
    );
    if (!appChoices.length) {
      return exit(
        1,
        chalk.red(
          "There are no apps for which you have permission to delete a local key."
        )
      );
    }

    const appName = (argv.app ??
      (
        await prompt<{ app: string }>({
          type: "autocomplete",
          name: "app",
          message: "App name:",
          choices: appChoices,
        })
      ).app) as string;
    app = findApp(state.graph, appName);
  }

  if (!app) {
    return exit(1, chalk.red.bold(`App not found, or you don't have access.`));
  }
  const { localKeys } = graphTypes(state.graph);
  if (!localKeys.length) {
    return exit(1, chalk.bold(`No local keys exist for the app ${app.name}.`));
  }
  if (!keyName) {
    keyName = (
      await prompt<{ key_name: string }>({
        type: "autocomplete",
        name: "key_name",
        message: "Local key name:",
        initial: 0,
        choices: getLocalKeyChoices(state.graph, app.id),
      })
    ).key_name as string;
  }

  const localKey = findKeyableParent(state.graph, app.id, keyName);
  if (!localKey) {
    return exit(
      1,
      chalk.red(
        `Local key ${chalk.bold(keyName)} not found for app ${chalk.bold(
          app.name
        )}`
      )
    );
  }
  if (!authz.canDeleteLocalKey(state.graph, auth.userId, localKey.id)) {
    return exit(
      1,
      chalk.red.bold("You don't have permission to delete the local key.")
    );
  }

  const res = await dispatch({
    type: Api.ActionType.DELETE_LOCAL_KEY,
    payload: {
      id: localKey.id,
    },
  });

  await logAndExitIfActionFailed(res, "Deleting the local key failed.");

  console.log(chalk.bold(`Local key ${localKey.name} was deleted.`));

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

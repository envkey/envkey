import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import {
  authz,
  getEnvironmentName,
  graphTypes,
  getActiveGeneratedEnvkeysByKeyableParentId,
} from "@core/lib/graph";
import { Client, Model } from "@core/types";
import chalk from "chalk";
import * as R from "ramda";
import Table from "cli-table3";
import clipboardy from "clipboardy";
import {
  findApp,
  findKeyableParent,
  getLocalKeyChoices,
  logAndExitIfActionFailed,
} from "../../lib/args";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

// old module
const notifier = require("node-notifier");

export const command = ["regen [app] [key-name]"];
export const desc = "Regenerate a local ENVKEY.";
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
  const now = Date.now();
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
          authz.canGenerateKey
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
          "There are no apps for which you have permission to renew a local key."
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

  const localKeysChoices = getLocalKeyChoices(state.graph, app.id);
  if (!localKeysChoices.length) {
    console.error(chalk.bold(`No local keys exist for the app ${app.name}.`));
    return exit();
  }
  if (!keyName) {
    keyName = (
      await prompt<{ key_name: string }>({
        type: "autocomplete",
        name: "key_name",
        message: "Local key name:",
        initial: 0,
        required: true,
        choices: localKeysChoices,
      })
    ).key_name as string;
  }

  const localKey = findKeyableParent(state.graph, app.id, keyName);
  if (!localKey) {
    return exit(
      1,
      chalk.red(
        `Local key ${chalk.bold(localKey)} not found for app ${chalk.bold(
          app.name
        )}`
      )
    );
  }

  let envkeyShortOriginalDisplay: string;
  const existingKey = graphTypes(state.graph).generatedEnvkeys.find(
    (k) => k.keyableParentId === localKey.id
  );
  if (existingKey) {
    envkeyShortOriginalDisplay = `${existingKey.envkeyShort}****`;
  } else {
    envkeyShortOriginalDisplay = "<revoked>";
  }

  if (!authz.canGenerateKey(state.graph, auth.userId, localKey.id)) {
    return exit(
      1,
      chalk.red.bold("You don't have permission to renew the local key.")
    );
  }

  const res = await dispatch({
    type: Client.ActionType.GENERATE_KEY,
    payload: {
      appId: app.id,
      keyableParentId: localKey.id,
      keyableParentType: localKey.type,
    },
  });
  await logAndExitIfActionFailed(
    res,
    `Renewing the local key ${localKey.name} failed.`
  );

  state = res.state;

  const { envkeyIdPart, encryptionKey } = state.generatedEnvkeys[localKey.id];
  let fullKey = [
    envkeyIdPart,
    encryptionKey,
    auth.hostType == "self-hosted" ? auth.hostUrl : undefined,
  ]
    .filter(Boolean)
    .join("-");

  const table = new Table(); // don't constrain columns as this prevents entire key from being printed

  table.push(
    ["Name:", chalk.bold(localKey.name)],
    ["App:", chalk.bold(app.name)],
    [
      "Environment:",
      chalk.bold(getEnvironmentName(state.graph, localKey.environmentId)),
    ],
    ["Old Key:", `ENVKEY=${chalk.bold(envkeyShortOriginalDisplay)}`]
  );

  console.log(
    chalk.bold(
      "Local key renewed. It won't be shown again, so be sure to save it somewhere safe."
    )
  );
  console.log(table.toString());
  console.log("New Local Key:", `\nENVKEY=${chalk.bold(fullKey)}`);
  autoModeOut({
    localKey: fullKey,
    id: localKey.id,
    appId: app.id,
  });

  clipboardy.writeSync(fullKey);
  notifier.notify("The new local envkey has been copied to clipboard.");

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

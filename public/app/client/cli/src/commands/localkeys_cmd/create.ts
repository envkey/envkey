import * as R from "ramda";
import {
  authz,
  graphTypes,
  getEnvironmentName,
  getEnvironmentsByEnvParentId,
} from "@core/lib/graph";
import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { Client, Model } from "@core/types";
import chalk from "chalk";
import Table from "cli-table3";
import { EnvironmentRole } from "@core/types/rbac";
import {
  findApp,
  findEnvironmentWithSubIfDefinedOrError,
  getEnvironmentChoices,
  logAndExitIfActionFailed,
} from "../../lib/args";
import { Graph } from "@core/types/client/graph";
import { autoModeOut, getPrompt, isAutoMode } from "../../lib/console_io";
import {
  argIsEnvironment,
  tryApplyDetectedAppOverride,
} from "../../app_detection";

export const command = ["create [app] [environment] [key-name]"];
export const desc = "Create a new local ENVKEY.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("key-name", {
      type: "string",
      describe: "local key name",
    })
    .positional("app", { type: "string", describe: "app name" })
    .positional("environment", {
      type: "string",
      describe: "environment name",
      coerce: R.toLower,
    })
    .option("branch", {
      type: "string",
      alias: "b",
      describe: "branch when environment is a parent",
      coerce: R.toLower,
    })
    .option("auto", {
      type: "boolean",
      describe: "",
      hidden: true,
    });
export const handler = async (
  argv: BaseArgs & {
    app?: string;
    environment?: string;
    branch?: string;
    "key-name"?: string;
    auto?: boolean;
  }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(
    argv,
    true,
    undefined,
    undefined,
    argv["app"]
  );

  let app: Model.App | undefined;
  let environmentNameArg: string | undefined = argv["environment"];
  let environmentName: string | undefined;
  let environmentId: string | undefined;
  let appEnv: Model.Environment | undefined;
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
      const firstEnv = argIsEnvironment(state.graph, appId, argv["app"]);
      const otherArgsValid = !argv["app"] || firstEnv;
      if (otherArgsValid) {
        app = state.graph[appId] as Model.App | undefined;
        if (app) {
          console.log("Detected app", chalk.bold(app.name), "\n");
          if (firstEnv) {
            // shift left
            environmentNameArg = argv["app"];
            keyName = argv["environment"];
          }
        }
      }
    }
  }

  if (!app) {
    const appChoices = R.sortBy(
      R.prop("message"),
      authz
        .getAppsPassingEnvTest(
          state.graph,
          auth.userId,
          authz.canCreateLocalKey
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
          "There are no apps for which you have permission to create a local key."
        )
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
    return exit(
      1,
      chalk.red.bold("App does not exist, or you don't have access.")
    );
  }

  if (environmentNameArg) {
    environmentId = findEnvironmentWithSubIfDefinedOrError(
      state.graph,
      app.id,
      environmentNameArg,
      argv["branch"],
      true,
      (graph, env) => authz.canCreateLocalKey(graph, auth.userId, env.id)
    );
  }

  // user may have passed in an environment, and/or a branch, or environment name
  // that is duplicated - thus we need to prompt them
  environmentName = (environmentId ??
    (await promptEnvironmentIfNeeded(
      state.graph,
      auth.userId,
      app.id
    ))) as string;
  const appEnvironments =
    getEnvironmentsByEnvParentId(state.graph)[app.id] ?? [];

  const appEnvs = appEnvironments.filter((env) => {
    const envName = getEnvironmentName(state.graph, env.id) as string;
    const role = state.graph[env.environmentRoleId] as EnvironmentRole;
    return (
      envName.toLowerCase() === environmentName!.toLowerCase() ||
      env.id === environmentName ||
      role.id === environmentName
    );
  });
  if (!appEnvs.length) {
    return exit(
      1,
      chalk.red(
        `Environment ${chalk.bold(
          environmentName
        )} does not exist, or you don't have access.`
      )
    );
  }
  if (appEnvs.length === 1) {
    appEnv = appEnvs[0];
  } else {
    console.log("There is more than one environment with that name.");
    appEnv = state.graph[
      await promptEnvironmentIfNeeded(state.graph, auth.userId, app.id)
    ] as Model.Environment;
  }

  const envRole = state.graph[appEnv.environmentRoleId] as EnvironmentRole;
  if (!envRole.hasLocalKeys) {
    return exit(
      1,
      chalk.red(
        `Environment role ${chalk.bold(
          envRole.name
        )} does not allow local keys.`
      )
    );
  }

  if (!authz.canCreateLocalKey(state.graph, auth.userId, appEnv.id)) {
    return exit(
      1,
      chalk.red(
        "You aren't allowed to create a local key for the app and environment."
      )
    );
  }

  const environmentHasAKey =
    graphTypes(state.graph).localKeys.filter(
      R.propEq("environmentId", appEnv.id)
    ).length > 0;
  if (!keyName) {
    if (isAutoMode()) {
      return exit(
        1,
        "Must provide a key name in auto mode as the third positional argument after the app and environment."
      );
    }

    keyName = (
      await prompt<{ key_name: string }>({
        type: "input",
        name: "key_name",
        message: "New local key name:",
        initial: environmentHasAKey ? "" : `Default ${envRole.name} Key`,
      })
    ).key_name as string;
  }

  const res = await dispatch({
    type: Client.ActionType.CREATE_LOCAL_KEY,
    payload: {
      name: keyName!,
      appId: app.id,
      environmentId: appEnv.id,
      autoGenerated: argv.auto || undefined,
    },
  });

  await logAndExitIfActionFailed(res, "Creating the local key failed.");

  state = res.state;

  const newGeneratedEnvkey = R.last(
    R.sort(R.prop("createdAt"), graphTypes(state.graph).generatedEnvkeys)
  );

  if (!newGeneratedEnvkey) {
    return exit(1, chalk.bold("Error fetching new local key."));
  }

  const newLocalKey = state.graph[
    newGeneratedEnvkey.keyableParentId
  ] as Model.LocalKey;

  const { envkeyIdPart, encryptionKey } =
    state.generatedEnvkeys[newGeneratedEnvkey.keyableParentId];
  let fullKey = [
    envkeyIdPart,
    encryptionKey,
    auth.hostType == "self-hosted" ? auth.hostUrl : undefined,
  ]
    .filter(Boolean)
    .join("-");

  const table = new Table({
    colWidths: [15, 60],
  });

  const possibleParentName =
    appEnv.isSub && appEnv.parentEnvironmentId
      ? `${getEnvironmentName(state.graph, appEnv.parentEnvironmentId)} > `
      : "";
  table.push(
    ["Name:", chalk.bold(newLocalKey.name)],
    ["App:", chalk.bold(app.name)],
    [
      "Environment:",
      possibleParentName +
        chalk.bold(getEnvironmentName(state.graph, appEnv.id)),
    ]
  );

  console.log(table.toString());
  console.log("Local Key:", `\nENVKEY=${chalk.bold(fullKey)}`);
  autoModeOut({ localKey: fullKey, id: newLocalKey.id, appId: app.id });

  console.log("");
  console.log(
    "Put it in a file at:",
    chalk.bold(`$HOME/.envkey/apps/${app.id}.env`)
  );

  console.log("");
  console.log("Or put it in a file at:", chalk.bold(`$HOME/.env`));

  console.log("");
  console.log("Or set it as an environment variable when running your app.");

  await dispatch({
    type: Client.ActionType.CLEAR_GENERATED_ENVKEY,
    payload: {
      keyableParentId: newLocalKey.id,
    },
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

const promptEnvironmentIfNeeded = (
  graph: Graph.UserGraph,
  currentUserId: string,
  appId: string
) => {
  const choices = getEnvironmentChoices(
    graph,
    currentUserId,
    appId,
    "localKey"
  );
  if (choices.length == 0) {
    return exit(
      1,
      chalk.red(
        "There are no environments you're permitted to create a local key for."
      )
    );
  } else if (choices.length == 1) {
    return choices[0].name;
  } else {
    return getPrompt()<{ environment: string }>({
      type: "autocomplete",
      name: "environment",
      message: "Select app environment:",
      initial: 0,
      choices,
    }).then(R.prop("environment"));
  }
};

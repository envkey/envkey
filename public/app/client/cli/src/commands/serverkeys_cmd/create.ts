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
import { Client, Model, Rbac } from "@core/types";
import { Graph } from "@core/types/client/graph";
import chalk from "chalk";
import Table from "cli-table3";
import {
  getEnvironmentChoices,
  logAndExitIfActionFailed,
  findEnvironmentWithSubIfDefinedOrError,
  findApp,
} from "../../lib/args";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import {
  argIsEnvironment,
  tryApplyDetectedAppOverride,
} from "../../app_detection";
// old module

export const command = ["create [app] [environment] [server-name]"];
export const desc = "Create a new server ENVKEY.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("server-name", {
      type: "string",
      describe: "server name",
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
    });
export const handler = async (
  argv: BaseArgs & {
    app?: string;
    environment?: string;
    "server-name"?: string;
    branch?: string;
  }
): Promise<void> => {
  const prompt = getPrompt();
  const now = Date.now();
  let { state, auth } = await initCore(argv, true);
  let app: Model.App | undefined;
  let environmentNameArg: string | undefined = argv["environment"];
  let environmentName: string | undefined;
  let environmentId: string | undefined;
  let appEnv: Model.Environment | undefined;
  let serverName: string | undefined = argv["server-name"];

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
            serverName = argv["environment"];
          }
        }
      }
    }
  }

  // license check
  const { license, org } = graphTypes(state.graph);
  const numActive = org.serverEnvkeyCount;
  const licenseExpired = license.expiresAt != -1 && now > license.expiresAt;
  if (
    (license.maxServerEnvkeys != -1 && numActive >= license.maxServerEnvkeys) ||
    licenseExpired
  ) {
    let message =
      chalk.red(
        licenseExpired
          ? `Your org's ${
              license.provisional ? "provisional " : ""
            }license has expired.`
          : `Your org has reached its limit of ${
              license.maxServerEnvkeys
            } ENVKEY${license.maxServerEnvkeys == 1 ? "" : "s"}.`
      ) + "\n";
    if (
      authz.hasOrgPermission(state.graph, auth.userId, "org_manage_billing")
    ) {
      message += `To create more servers, ${
        licenseExpired ? "renew" : "upgrade"
      } your org's license.`;
    } else {
      message += `To create more servers, ask an admin to ${
        licenseExpired ? "renew" : "upgrade"
      } your org's license.`;
    }
    return exit(1, message);
  }

  if (!app) {
    const appChoices = R.sortBy(
      R.prop("message"),
      authz
        .getAppsPassingEnvTest(state.graph, auth.userId, authz.canCreateServer)
        .map((a) => ({
          name: a.id,
          message: chalk.bold(a.name),
        }))
    );
    if (!appChoices.length) {
      return exit(
        1,
        chalk.red(
          "There are no apps for which you have permission to create a server key."
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
      argv["branch"]
    );
  }

  // user may have passed in an environment, and/or a branch, or environment name
  // that is duplicated - thus we need to prompt them
  environmentName =
    environmentId ??
    (await promptEnvironment(state.graph, auth.userId, app.id));
  const appEnvironments =
    getEnvironmentsByEnvParentId(state.graph)[app.id] ?? [];

  const appEnvs = appEnvironments.filter((env) => {
    const envName = getEnvironmentName(state.graph, env.id) as string;
    const role = state.graph[env.environmentRoleId] as Rbac.EnvironmentRole;
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
      await promptEnvironment(state.graph, auth.userId, app.id)
    ] as Model.Environment;
  }

  const envRole = state.graph[appEnv.environmentRoleId] as Rbac.EnvironmentRole;
  if (!envRole.hasServers) {
    return exit(
      1,
      chalk.red(
        `Environment role ${chalk.bold(
          envRole.name
        )} does not allow server keys.`
      )
    );
  }
  if (!authz.canCreateServer(state.graph, auth.userId, appEnv.id)) {
    return exit(
      1,
      chalk.red(
        "You don't have permission to create a server for this environment."
      )
    );
  }

  const environmentHasAServer =
    graphTypes(state.graph).servers.filter(R.propEq("environmentId", appEnv.id))
      .length > 0;
  if (!serverName) {
    serverName = (
      await prompt<{ server_name: string }>({
        type: "input",
        name: "server_name",
        message: "New server name:",
        initial: environmentHasAServer ? "" : `Default ${envRole.name} Server`,
      })
    ).server_name as string;
  }
  const serverNameExists = !!graphTypes(state.graph).servers.find(
    R.whereEq({ appId: app.id, name: serverName })
  );
  if (serverNameExists) {
    return exit(
      1,
      chalk.red.bold("A server already exists with that name for the app.")
    );
  }

  const res = await dispatch({
    type: Client.ActionType.CREATE_SERVER,
    payload: {
      name: serverName,
      appId: app.id,
      environmentId: appEnv.id,
    },
  });

  await logAndExitIfActionFailed(res, "Creating the server envkey failed.");

  state = res.state;

  const newServer = graphTypes(state.graph).servers.find(
    // normally matched to graphUpdatedAt, but perhaps it is different because of key being local
    R.whereEq({ appId: app.id, environmentId: appEnv.id, name: serverName })
  );
  if (!newServer) {
    return exit(
      1,
      chalk.bold("Error fetching newly created server to display key.")
    );
  }

  const { envkeyIdPart, encryptionKey } = state.generatedEnvkeys[newServer.id];
  let fullKey = [
    envkeyIdPart,
    encryptionKey,
    auth.hostType == "self-hosted" ? auth.hostUrl : undefined,
  ]
    .filter(Boolean)
    .join("-");

  const table = new Table({
    // don't cap width or the key can be cut off :)
  });

  const possibleParentName =
    appEnv.isSub && appEnv.parentEnvironmentId
      ? `${getEnvironmentName(state.graph, appEnv.parentEnvironmentId)} > `
      : "";
  table.push(
    ["Name:", chalk.bold(newServer.name)],
    ["App:", chalk.bold(app.name)],
    [
      "Environment:",
      possibleParentName +
        chalk.bold(getEnvironmentName(state.graph, appEnv.id)),
    ]
  );

  console.log(table.toString());
  console.log("Server Key:", `\nENVKEY=${chalk.bold(fullKey)}`);
  autoModeOut({ serverKey: fullKey, id: newServer.id, appId: app.id });

  console.log("");
  console.log("Set it as an environment variable on your server.");

  console.log("");
  console.log("Or put it in a file at:", chalk.bold(`$HOME/.env`));

  console.log("");
  console.log(
    "To enable multiple ENVKEYs on one server, instead put it in a file at:",
    chalk.bold(`$HOME/.envkey/apps/${app.id}.env`)
  );

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

const promptEnvironment = (
  graph: Graph.UserGraph,
  currentUserId: string,
  appId: string
) =>
  getPrompt()<{ environment: string }>({
    type: "autocomplete",
    name: "environment",
    message: "Select app environment:",
    initial: 0,
    choices: getEnvironmentChoices(graph, currentUserId, appId, "server"),
  }).then(R.prop("environment"));

import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore, dispatch, getState } from "../../lib/core";
import { BaseArgs } from "../../types";
import { stripNullsRecursive } from "@core/lib/utils/object";
import { Client, Model, Rbac, Api } from "@core/types";
import chalk from "chalk";
import { findApp, logAndExitIfActionFailed } from "../../lib/args";
import { fetchEnvsIfNeeded } from "../../lib/envs";
import { getEnvWithMeta } from "@core/lib/client";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";
import { createApp } from "../../lib/apps";

export const command = ["duplicate <app>"];
export const desc = "Duplicate an app's environments and values to a new app.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("app", { type: "string", describe: "source app name" })
    .option("dir", {
      type: "string",
      describe: "root directory of app (to create .envkey file)",
    });

export const handler = async (
  argv: BaseArgs & {
    app?: string;
    dir?: string;
  }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);
  let sourceApp: Model.App | undefined;

  if (argv["app"]) {
    sourceApp = findApp(state.graph, argv["app"]);
  }

  // detection from ENVKEY
  if (!sourceApp) {
    if (tryApplyDetectedAppOverride(auth.userId, argv)) {
      return handler(argv);
    }
    const appId = argv["detectedApp"]?.appId?.toLowerCase();
    if (appId) {
      sourceApp = state.graph[appId] as Model.App | undefined;
      if (sourceApp) {
        console.log("Detected app", chalk.bold(sourceApp.name), "\n");
      }
    }
  }

  // choose an app
  if (!sourceApp) {
    const appChoices = R.sortBy(R.prop("name"), g.graphTypes(state.graph).apps);
    if (!appChoices.length) {
      console.log(chalk.bold("There are no apps to duplicate."));
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
    sourceApp = findApp(state.graph, appName);
  }

  if (!sourceApp) {
    return exit(1, chalk.red.bold("App not found"));
  }

  const sourceAppEnvironments =
    g.getEnvironmentsByEnvParentId(state.graph)[sourceApp.id] ?? [];

  const newApp = await createApp(
    auth,
    state,
    sourceApp.name + " (copy)",
    argv.dir,
    undefined,
    true
  );

  state = getState();

  const newAppBaseEnvironments =
    g.getEnvironmentsByEnvParentId(state.graph)[newApp.id] ?? [];

  const newEnvToSourceEnvIdMap: Record<string, string> = {};
  for (let newEnvironment of newAppBaseEnvironments) {
    const sourceEnvironment = sourceAppEnvironments.find(
      (e) => e.environmentRoleId == newEnvironment.environmentRoleId
    )!;
    newEnvToSourceEnvIdMap[newEnvironment.id] = sourceEnvironment.id;
  }
  const sourceEnvToNewEnvIdMap = R.invertObj(newEnvToSourceEnvIdMap);

  // create branches if needed
  const sourceBranches = sourceAppEnvironments.filter(
    (e): e is Model.Environment & { isSub: true } => e.isSub
  );
  if (sourceBranches.length > 0) {
    for (let sourceBranch of sourceBranches) {
      const res = await dispatch({
        type: Api.ActionType.CREATE_ENVIRONMENT,
        payload: {
          envParentId: newApp.id,
          environmentRoleId: sourceBranch.environmentRoleId,
          isSub: true,
          subName: sourceBranch.subName,
          parentEnvironmentId:
            sourceEnvToNewEnvIdMap[sourceBranch.parentEnvironmentId],
        },
      });
      await logAndExitIfActionFailed(res, "Failed to create branch.");
      state = res.state;

      const newAppEnvironments =
        g.getEnvironmentsByEnvParentId(state.graph)[newApp.id] ?? [];
      const newBranch = R.last(
        R.sortBy(R.prop("createdAt"), newAppEnvironments)
      )!;

      newEnvToSourceEnvIdMap[newBranch.id] = sourceBranch.id;
    }
  }

  const newAppEnvironments =
    g.getEnvironmentsByEnvParentId(state.graph)[newApp.id] ?? [];

  state = await fetchEnvsIfNeeded(state, [sourceApp.id]);

  // import environments
  for (let newEnvironment of newAppEnvironments) {
    const sourceEnvironmentId = newEnvToSourceEnvIdMap[newEnvironment.id];

    const envWithMeta = getEnvWithMeta(state, {
      envParentId: sourceApp.id,
      environmentId: sourceEnvironmentId,
    });

    for (let entryKey in envWithMeta.variables) {
      const update = stripNullsRecursive(envWithMeta.variables[entryKey]);
      if (update.inheritsEnvironmentId) {
        const mappedInheritsId =
          sourceEnvToNewEnvIdMap[update.inheritsEnvironmentId];
        update.inheritsEnvironmentId = mappedInheritsId;
      }

      const res = await dispatch({
        type: Client.ActionType.UPDATE_ENTRY_VAL,
        payload: {
          envParentId: newApp.id,
          environmentId: newEnvironment.id,
          entryKey,
          update,
        },
      });
      await logAndExitIfActionFailed(
        res,
        "Failed to set environment: " +
          g.getEnvironmentName(state.graph, newEnvironment.id) +
          ", key: " +
          entryKey
      );
      state = res.state;
    }
  }

  let res = await dispatch({
    type: Client.ActionType.COMMIT_ENVS,
    payload: {},
  });
  await logAndExitIfActionFailed(res, "Failed to commit envs.");

  console.log(chalk.bold("App was duplicated."));
  autoModeOut({
    appId: newApp.id,
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

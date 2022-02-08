import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz, getObjectName } from "@core/lib/graph";
import { Api, Model } from "@core/types";
import chalk from "chalk";
import {
  findApp,
  findBlock,
  logAndExitIfActionFailed,
  mustSelectSubEnvironmentForDeletion,
} from "../../lib/args";
import { findEnvironment } from "../../lib/envs";
import * as R from "ramda";
import { getPrompt, isAutoMode } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = "delete [app-or-block] [branch]";
export const desc = "Delete a branch for an app or block.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("app-or-block", {
      type: "string",
      describe: "app or block name",
    })
    .positional("branch", {
      type: "string",
      describe: "branch name",
    })
    .option("parent-environment", {
      type: "string",
      describe: "parent-environment name",
    });
export const handler = async (
  argv: BaseArgs & {
    "app-or-block"?: string;
    branch?: string;
    "parent-environment"?: string;
    force?: boolean;
  }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);
  let envParent: Model.EnvParent | undefined;

  let parentEnvironmentArg: string | undefined;
  let branchArg: string | undefined;
  if (argv["app-or-block"] && argv["parent-environment"] && !argv["branch"]) {
    parentEnvironmentArg = argv["app-or-block"];
    branchArg = argv["parent-environment"];
  } else if (
    argv["app-or-block"] &&
    !argv["parent-environment"] &&
    !argv["branch"]
  ) {
    branchArg = argv["app-or-block"];
  }

  if (argv["app-or-block"]) {
    envParent =
      findApp(state.graph, argv["app-or-block"]) ||
      findBlock(state.graph, argv["app-or-block"]);
  }

  // detection from ENVKEY
  if (!envParent) {
    if (tryApplyDetectedAppOverride(auth.userId, argv)) {
      return handler(argv);
    }
    const appId = argv["detectedApp"]?.appId;
    if (appId) {
      envParent = state.graph[appId] as Model.App | undefined;
    }
  }

  if (!envParent) {
    const appBlockChoices = R.sortBy(
      R.prop("message"),
      authz
        .getEnvParentsWithDeletableSubEnvironments(state.graph, auth.userId)
        .map((envParent) => ({
          name: envParent.id,
          message: `${envParent.type} - ${chalk.bold(envParent.name)}`,
        }))
    );
    if (!appBlockChoices.length) {
      return exit(
        1,
        chalk.red(
          "There are no apps or blocks for which you are allowed to delete branches."
        )
      );
    }

    const parentName = (
      await prompt<{ envParent: string }>({
        type: "autocomplete",
        name: "envParent",
        message: "Select app or block:",
        initial: 0,
        choices: appBlockChoices,
      })
    ).envParent as string;
    envParent =
      findApp(state.graph, parentName) || findBlock(state.graph, parentName);
  }

  if (!envParent) {
    return exit(1, chalk.red.bold("App or block not found."));
  }

  let parentEnvironment: Model.Environment | undefined;

  if (parentEnvironmentArg ?? argv["detectedApp"]?.environmentId) {
    parentEnvironment = findEnvironment(
      state.graph,
      envParent.id,
      (parentEnvironmentArg ?? argv["detectedApp"]?.environmentId)!
    );

    if (parentEnvironment && parentEnvironment.isSub) {
      parentEnvironment = findEnvironment(
        state.graph,
        envParent.id,
        parentEnvironment.parentEnvironmentId
      );
    }
  }

  const subEnv = await mustSelectSubEnvironmentForDeletion(
    state.graph,
    auth.userId,
    envParent.id,
    branchArg,
    parentEnvironment?.id
  );

  if (
    !subEnv.isSub ||
    !authz.canDeleteEnvironment(state.graph, auth.userId, subEnv.id)
  ) {
    return exit(
      1,
      chalk.red.bold("You don't have permission to delete this branch.")
    );
  }

  if (!argv.force) {
    const { confirm } = await prompt<{ confirm: boolean }>({
      type: "confirm",
      name: "confirm",
      message: `Delete branch ${chalk.bold(
        getObjectName(state.graph, subEnv.id)
      )} for ${envParent.type} ${chalk.bold(
        envParent.name
      )}? This cannot be undone.`,
    });

    if (!confirm) {
      console.log(chalk.bold("App deletion aborted."));
      return exit();
    }
  }

  const res = await dispatch({
    type: Api.ActionType.DELETE_ENVIRONMENT,
    payload: {
      id: subEnv.id,
    },
  });

  await logAndExitIfActionFailed(res, "The branch could not be deleted.");

  console.log(
    `Branch ${chalk.bold(getObjectName(state.graph, subEnv.id))} was deleted!`
  );

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

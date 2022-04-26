import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz, getEnvironmentName } from "@core/lib/graph";
import { Api, Model } from "@core/types";
import chalk from "chalk";
import { findApp, findBlock, logAndExitIfActionFailed } from "../../lib/args";
import { findEnvironment } from "../../lib/envs";
import * as R from "ramda";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["create [app-or-block] [parent-environment] [name]"];
export const desc = "Create a branch for an app or block environment.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("app-or-block", {
      type: "string",
      describe: "app or block name",
    })
    .positional("parent-environment", {
      type: "string",
      describe: "environment name",
      coerce: R.toLower,
    })
    .positional("name", {
      type: "string",
      describe: "new branch name",
    });
export const handler = async (
  argv: BaseArgs & {
    "app-or-block"?: string;
    "parent-environment"?: string;
    name?: string;
  }
): Promise<void> => {
  const prompt = getPrompt();

  let { state, auth } = await initCore(argv, true);
  let envParent: Model.EnvParent | undefined;

  let parentEnvironmentArg: string | undefined;
  let nameArg: string | undefined;

  if (argv["app-or-block"] && argv["parent-environment"] && !argv["name"]) {
    parentEnvironmentArg = argv["app-or-block"];
    nameArg = argv["parent-environment"];
  } else if (
    argv["app-or-block"] &&
    !argv["parent-environment"] &&
    !argv["name"]
  ) {
    nameArg = argv["app-or-block"];
  } else {
    parentEnvironmentArg = argv["parent-environment"];
    nameArg = argv["name"];
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
        .getCanCreateSubEnvironmentsForEnvParents(state.graph, auth.userId)
        .map((envParent) => ({
          name: envParent.id,
          message: chalk.bold(envParent.name),
        }))
    );
    if (!appBlockChoices.length) {
      return exit(
        1,
        chalk.red(
          "There are no apps or blocks for which you are allowed to create branches."
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

  if (!parentEnvironment) {
    const availableParentEnvironmentChoices = authz
      .getCanCreateSubEnvironmentForEnvironments(
        state.graph,
        auth.userId,
        envParent.id
      )
      .map((env) => ({
        name: getEnvironmentName(state.graph, env.id),
        message: chalk.bold(getEnvironmentName(state.graph, env.id)),
      }));
    if (!availableParentEnvironmentChoices.length) {
      return exit(
        1,
        chalk.red(
          `You don't have permission to create branches for the ${
            envParent.type
          } ${chalk.bold(envParent.name)}!`
        )
      );
    }

    const parentEnvironmentName = (parentEnvironmentArg ??
      (
        await prompt<{ environment: string }>({
          type: "autocomplete",
          name: "environment",
          message: "Select parent environment:",
          initial: 0,
          choices: availableParentEnvironmentChoices,
        })
      ).environment) as string;
    parentEnvironment = findEnvironment(
      state.graph,
      envParent.id,
      parentEnvironmentName
    );
    if (!parentEnvironment) {
      return exit(
        1,
        chalk.red(
          `Environment ${chalk.bold(
            parentEnvironmentName
          )} does not exist, or you don't have access.`
        )
      );
    }
    if (
      parentEnvironment.isSub ||
      !authz.canCreateSubEnvironment(
        state.graph,
        auth.userId,
        parentEnvironment.id
      )
    ) {
      return exit(
        1,
        chalk.red(
          `You are not allowed to create of a branch of ${chalk.bold(
            parentEnvironmentName
          )}.`
        )
      );
    }
  }

  const name =
    nameArg ??
    (
      await prompt<{ name: string }>({
        type: "input",
        name: "name",
        required: true,
        message: "New branch name:",
      })
    ).name;

  const res = await dispatch({
    type: Api.ActionType.CREATE_ENVIRONMENT,
    payload: {
      isSub: true,
      envParentId: envParent.id,
      environmentRoleId: parentEnvironment.environmentRoleId,
      parentEnvironmentId: parentEnvironment.id,
      subName: name,
    },
  });

  await logAndExitIfActionFailed(res, "The branch could not be created.");

  console.log(`Branch ${chalk.bold(name)} was created!`);
  autoModeOut({
    id: (res.resultAction as any)?.id,
    envParentId: envParent.id,
    environmentRoleId: parentEnvironment.environmentRoleId,
    parentEnvironmentId: parentEnvironment.id,
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

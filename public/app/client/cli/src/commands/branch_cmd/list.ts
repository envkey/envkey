import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { findApp, findBlock, getAppAndBlockChoices } from "../../lib/args";
import {
  findEnvironment,
  getEnvironmentTree,
  getEnvironmentTreeJson,
} from "../../lib/envs";
import chalk from "chalk";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import {
  getEnvironmentName,
  getEnvironmentsByEnvParentId,
  graphTypes,
} from "@core/lib/graph";
import * as R from "ramda";
import { Model } from "@core/types";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["list [app-or-block] [parent-environment]", "$0"];
export const desc = "List branches for an app or block environment.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("app-or-block", {
      type: "string",
      describe: "app or block name",
    })
    .positional("parent-environment", {
      type: "string",
      describe: "parent environment name",
      coerce: R.toLower,
    });
export const handler = async (
  argv: BaseArgs & { "app-or-block"?: string; "parent-environment"?: string }
): Promise<void> => {
  const prompt = getPrompt();
  let { auth, state } = await initCore(argv, true);
  let envParent: Model.EnvParent | undefined;

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
    const parentName = (
      await prompt<{ envParent: string }>({
        type: "autocomplete",
        name: "envParent",
        message: "Select app or block:",
        initial: 0,
        choices: getAppAndBlockChoices(state.graph),
      })
    ).envParent as string;
    envParent =
      findApp(state.graph, parentName) || findBlock(state.graph, parentName);
  }

  if (!envParent) {
    return exit(1, chalk.red.bold("App or block not found."));
  }

  let parentEnvironment: Model.Environment | undefined;

  const envParentEnvironments =
    getEnvironmentsByEnvParentId(state.graph)[envParent.id] ?? [];
  const developmentRole = graphTypes(state.graph).environmentRoles.find(
    (role) => role.isDefault && role.defaultName == "Development"
  )!;
  const developmentEnvironment = envParentEnvironments.find(
    (environment) =>
      !environment.isSub && environment.environmentRoleId == developmentRole.id
  )!;

  if (argv["parent-environment"]) {
    parentEnvironment = findEnvironment(
      state.graph,
      envParent.id,
      argv["parent-environment"]!
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
    // if app override was set, default to dev environment
    if (argv["detectedApp"]) {
      parentEnvironment = developmentEnvironment;
    }

    if (!parentEnvironment) {
      const parentEnvironmentChoices = envParentEnvironments
        .filter((environment) => !environment.isSub)
        .map(({ id }) => ({
          name: getEnvironmentName(state.graph, id),
          message: chalk.bold(getEnvironmentName(state.graph, id)),
        }));
      if (parentEnvironmentChoices.length == 0) {
        console.log(getEnvironmentTree(state.graph, envParent.id), "\n");

        autoModeOut({
          environments: getEnvironmentTreeJson(state.graph, envParent.id),
        });

        return exit();
      }
      const parentEnvironmentName = (
        await prompt<{ environment: string }>({
          type: "autocomplete",
          name: "environment",
          message: "Select parent environment:",
          initial: 0,
          choices: parentEnvironmentChoices,
        })
      ).environment as string;
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
    }
  }

  console.log(
    getEnvironmentTree(
      state.graph,
      envParent.id,
      parentEnvironment.id,
      argv["detectedApp"]?.environmentId ?? developmentEnvironment.id
    ),
    "\n"
  );

  autoModeOut({
    environments: getEnvironmentTreeJson(
      state.graph,
      envParent.id,
      parentEnvironment.id,
      argv["detectedApp"]?.environmentId ?? developmentEnvironment.id
    ),
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

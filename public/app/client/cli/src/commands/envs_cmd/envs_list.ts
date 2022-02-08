import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { findApp, findBlock, getAppAndBlockChoices } from "../../lib/args";
import { getEnvironmentTree, getEnvironmentTreeJson } from "../../lib/envs";
import chalk from "chalk";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import {
  getEnvironmentName,
  getEnvironmentsByEnvParentId,
} from "@core/lib/graph";
import * as R from "ramda";
import { Model } from "@core/types";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["list [app-or-block]", "$0"];
export const desc = "List environments for an app or block.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("app-or-block", {
    type: "string",
    describe: "app or block name",
  });
export const handler = async (
  argv: BaseArgs & { "app-or-block"?: string }
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
    const appId = argv["detectedApp"]?.appId?.toLowerCase();
    if (appId) {
      const otherArgsValid = !argv["app-or-block"];
      if (otherArgsValid) {
        envParent = state.graph[appId] as Model.App | undefined;
        if (envParent) {
          console.log("Detected app", chalk.bold(envParent.name), "\n");
        }
      }
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

  console.log(getEnvironmentTree(state.graph, envParent.id), "\n");
  autoModeOut({
    environments: getEnvironmentTreeJson(state.graph, envParent.id),
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

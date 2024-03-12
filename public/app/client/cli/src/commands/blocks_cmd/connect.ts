import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz, graphTypes } from "@core/lib/graph";

import { Client, Model } from "@core/types";
import chalk from "chalk";
import * as R from "ramda";
import {
  appsConnectBlockMustValidate,
  findApp,
  findBlock,
  getAppChoices,
  logAndExitIfActionFailed,
} from "../../lib/args";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = "connect [app] [block]";
export const desc = "Connect a config block to an app.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("app", { type: "string", describe: "app name or id" })
    .positional("block", { type: "string", describe: "block name" });
export const handler = async (
  argv: BaseArgs & { app?: string; block?: string }
): Promise<void> => {
  const prompt = getPrompt();
  const { state, auth } = await initCore(argv, true);
  let app: Model.App | undefined;
  let blockName: string | undefined = argv["block"];

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
      const blockOnlyArg =
        argv["app"] && findBlock(state.graph, argv["app"]) && !argv["block"];
      const otherArgsValid = !argv["app"] || blockOnlyArg;
      if (otherArgsValid) {
        app = state.graph[appId] as Model.App | undefined;
        if (app) {
          console.log("Detected app", chalk.bold(app.name), "\n");
          if (blockOnlyArg) {
            blockName = argv["app"];
          }
        }
      }
    }
  }

  if (!app) {
    const appName = (
      await prompt<{ app: string }>({
        type: "autocomplete",
        name: "app",
        message: "App:",
        required: true,
        choices: getAppChoices(state.graph),
      })
    ).app as string;
    app = findApp(state.graph, appName);
  }
  if (!app) {
    return exit(1, chalk.red.bold("App not found."));
  }

  const blockChoices = authz
    .getConnectableBlocksForApp(state.graph, auth.userId, app.id)
    .map((block) => ({
      name: block.id,
      message: chalk.bold(block.name),
    }));
  if (!blockChoices.length) {
    return exit(
      1,
      chalk.red.bold(
        "There are no blocks available for you to connect to this app, or you don't have permission."
      )
    );
  }
  if (!blockName) {
    blockName = (
      await prompt<{ block: string }>({
        type: "autocomplete",
        name: "block",
        required: true,
        message: "Block:",
        choices: blockChoices,
      })
    ).block as string;
  }

  const { block, existingAppBlock } = appsConnectBlockMustValidate(
    state.graph,
    app.name,
    blockName
  );
  if (existingAppBlock) {
    console.log(chalk.bold(`The app and block are already connected.`));
    return exit();
  }
  if (!authz.canConnectBlock(state.graph, auth.userId, app.id, block.id)) {
    return exit(
      1,
      chalk.red.bold("You don't have permission to connect the app and block.")
    );
  }

  const { appBlocks } = graphTypes(state.graph);
  const orderIndices = appBlocks.map(R.prop("orderIndex"));
  const maxOrderIndex = R.apply(Math.max, [...orderIndices, 0]);

  const res = await dispatch({
    type: Client.ActionType.CONNECT_BLOCKS,
    payload: [
      {
        appId: app.id,
        blockId: block.id,
        orderIndex: maxOrderIndex + 1,
      },
    ],
  });

  await logAndExitIfActionFailed(res, "Connecting the block and app failed.");

  console.log(chalk.bold("The block and app are now connected."));
  autoModeOut({
    id: (res.resultAction as any)?.payload?.id,
    appId: app.id,
    blockId: block.id,
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

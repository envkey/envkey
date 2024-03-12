import chalk from "chalk";
import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";

import { Api, Model } from "@core/types";
import {
  appsConnectBlockMustValidate,
  findApp,
  findBlock,
  getAppChoices,
  logAndExitIfActionFailed,
} from "../../lib/args";
import { authz } from "@core/lib/graph";
import { getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = "disconnect [app] [block]";
export const desc = "Disconnect a block from an app.";
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
    .getDisconnectableBlocksForApp(state.graph, auth.userId, app.id)
    .map((block) => ({
      name: block.id,
      message: chalk.bold(block.name),
    }));
  if (!blockChoices.length) {
    return exit(
      1,
      chalk.red.bold(
        "There are no blocks that you can disconnect from this app."
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

  const { existingAppBlock } = appsConnectBlockMustValidate(
    state.graph,
    app.name,
    blockName
  );

  if (!existingAppBlock) {
    console.log(chalk.bold(`The app and block are not connected.`));
    return exit();
  }
  if (
    !authz.canDisconnectBlock(state.graph, auth.userId, {
      appBlockId: existingAppBlock.id,
    })
  ) {
    return exit(
      1,
      chalk.red.bold("You don't have permission to connect the app and block.")
    );
  }

  const res = await dispatch({
    type: Api.ActionType.DISCONNECT_BLOCK,
    payload: {
      id: existingAppBlock.id,
    },
  });

  await logAndExitIfActionFailed(
    res,
    "Disconnecting the block and app failed."
  );

  console.log(chalk.bold("The block and app have been disconnected."));

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

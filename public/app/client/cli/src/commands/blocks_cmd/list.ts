import R from "ramda";
import { exit } from "../../lib/process";
import { Argv } from "yargs";

import { initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import {
  getAppRoleForUserOrInvitee,
  getConnectedAppsForBlock,
  getConnectedBlocksForApp,
  graphTypes,
} from "@core/lib/graph";
import { Model } from "@core/types";
import { findApp, getAppChoices } from "../../lib/args";
import chalk from "chalk";
import Table from "cli-table3";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["list [app]", "$0"];
export const desc = "List permitted reusable config blocks.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("app", { type: "string", describe: "app name or id" })
    .option("connected", {
      type: "boolean",
      conflicts: ["all", "unconnected"],
      describe: "show blocks connected to an app",
    })
    .option("unconnected", {
      type: "boolean",
      conflicts: ["connected", "all"],
      describe: "show blocks *not* connected to an app",
    })
    .option("all", {
      type: "boolean",
      conflicts: ["connected", "unconnected"],
      describe: "show all permitted blocks in the org",
    });
export const handler = async (
  argv: BaseArgs & {
    app?: string;
    connected?: boolean;
    unconnected?: boolean;
    all?: boolean;
  }
): Promise<void> => {
  const { state, auth } = await initCore(argv, true);
  const prompt = getPrompt();

  let app: Model.App | undefined;

  if (argv["app"]) {
    app = findApp(state.graph, argv["app"]);
  }

  // detection from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  if (!app && !argv.all) {
    const appId = argv["detectedApp"]?.appId?.toLowerCase();
    if (appId) {
      const otherArgsValid = !argv["app"];
      if (otherArgsValid) {
        app = state.graph[appId] as Model.App | undefined;
        if (app) {
          console.log("Detected app", chalk.bold(app.name), "\n");
        }
      }
    }
  }

  if (!app && !argv.all && (argv.connected || argv["unconnected"])) {
    const appChoices = getAppChoices(state.graph);
    if (!appChoices.length) {
      console.log(chalk.bold("Create an app before listing app blocks."));
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
    app = findApp(state.graph, appName);
  }

  let blocks: Model.Block[] | undefined;
  const listAll = !app || argv.all;

  if (listAll) {
    blocks = graphTypes(state.graph).blocks;
    if (!blocks.length) {
      console.log(chalk.bold("You don't have access to any blocks."));
      return exit();
    }
  } else if (app) {
    const connected = getConnectedBlocksForApp(state.graph, app.id);

    if (argv["unconnected"]) {
      const allBlocks = graphTypes(state.graph).blocks;

      const connectedIds = new Set(connected.map(R.prop("id")));

      blocks = allBlocks.filter((block) => !connectedIds.has(block.id));
    } else {
      // connected
      blocks = connected;
    }
  }

  if (!blocks) {
    throw new Error("Blocks should be defined");
  }

  blocks = R.sortBy(R.prop("name"), blocks);

  if (listAll) {
    const table = new Table({
      head: ["Block Name", "Your Role", "Connected Apps"],
      colWidths: [35, 25, 35],
      style: {
        head: [], //disable colors in header cells
      },
    });

    console.log(
      chalk.bold(
        `You have access to ${blocks.length} block${
          blocks.length == 1 ? "" : "s"
        }:\n`
      )
    );

    for (let b of blocks) {
      const role = getAppRoleForUserOrInvitee(state.graph, b.id, auth.userId);
      const apps = getConnectedAppsForBlock(state.graph, b.id);
      table.push([chalk.bold(b.name), chalk.bold(role!.name), apps.length]);
    }

    console.log(table.toString());

    console.log(
      "\nUse `envkey blocks [app]` to show the blocks connected to a specific app or `envkey blocks [app] --unconnected` to show the blocks that aren't connected."
    );

    autoModeOut({
      blocks: blocks.map((b) => ({
        ...R.pick(["id", "name"], b),
        apps: getConnectedAppsForBlock(state.graph, b.id)?.map(R.prop("id")),
      })),
    });
  } else {
    const table = new Table({
      head: ["Block Name"],
      colWidths: [50],
      style: {
        head: [], //disable colors in header cells
      },
    });

    console.log(
      chalk.bold(
        `${blocks.length} ${
          argv["unconnected"] ? "unconnected" : "connected"
        } block${blocks.length == 1 ? "" : "s"}${
          blocks.length == 0 ? "." : ":"
        }\n`
      )
    );

    for (let b of blocks) {
      table.push([chalk.bold(b.name)]);
    }

    if (blocks.length > 0) {
      console.log(table.toString());
    }

    if (!argv.unconnected) {
      console.log(
        "\nUse `envkey blocks --all` to show all permitted blocks in the org or `envkey blocks [app] --unconnected` to show only the blocks that are *not* connected."
      );
    }

    autoModeOut({
      blocks: blocks.map(R.pick(["id", "name"])),
    });
  }

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

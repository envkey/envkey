import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { graphTypes } from "@core/lib/graph";
import chalk from "chalk";
import Table from "cli-table3";
import * as R from "ramda";
import { autoModeOut } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["environment-roles"];
export const desc = "List environment roles.";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  const { state, auth } = await initCore(argv, true);
  // override account from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  const table = new Table({
    head: ["Name", "Description", "Default All"],
    colWidths: [null, 50, 20],
    wordWrap: true,
    style: {
      head: [], //disable colors in header cells
    },
  });

  for (let envRole of graphTypes(state.graph).environmentRoles) {
    const defaultAllDisplay = [
      envRole.defaultAllApps ? "Apps" : "",
      envRole.defaultAllBlocks ? "Blocks" : "",
    ]
      .filter(Boolean)
      .join(", ");

    table.push([
      { vAlign: "center", content: chalk.bold(envRole.name) },
      envRole.description,
      {
        vAlign: "center",
        content: defaultAllDisplay,
      },
    ]);
  }

  console.log(table.toString());
  autoModeOut({
    environmentRoles: graphTypes(state.graph).environmentRoles.map((r) =>
      R.pick(
        [
          "id",
          "name",
          "description",
          "isDefault",
          "hasLocalKeys",
          "hasServers",
          "defaultAllApps",
          "defaultAllBlocks",
          "settings",
        ],
        r
      )
    ),
  });
  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

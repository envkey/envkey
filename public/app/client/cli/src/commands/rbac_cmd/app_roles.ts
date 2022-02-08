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

export const command = ["app-roles"];
export const desc = "List app roles.";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  const { state, auth } = await initCore(argv, true);
  // override account from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  const table = new Table({
    head: ["Name", "Description", "Default All Apps"],
    colWidths: [null, 50, 18],
    wordWrap: true,
    style: {
      head: [], //disable colors in header cells
    },
  });

  const appRoles = graphTypes(state.graph).appRoles.filter(
    (appRole) =>
      !(
        appRole.defaultName &&
        ["Org Owner", "Org Admin"].includes(appRole.defaultName)
      )
  );

  for (let appRole of appRoles) {
    table.push([
      { vAlign: "center", content: chalk.bold(appRole.name) },
      appRole.description,
      {
        hAlign: "center",
        vAlign: "center",
        content: appRole.defaultAllApps ? "Yes" : "No",
      },
    ]);
  }

  console.log(table.toString());
  autoModeOut(
    appRoles.map((r) =>
      R.pick(["id", "name", "description", "isDefault", "defaultAllApps"], r)
    )
  );
  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { graphTypes } from "@core/lib/graph";
import chalk from "chalk";
import Table from "cli-table3";
import { Rbac } from "@core/types";
import * as R from "ramda";
import { autoModeOut } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["org-roles"];
export const desc = "List organization user roles.";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  const { state, auth } = await initCore(argv, true);
  // override account from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  const table = new Table({
    head: [
      "Name",
      "Description",
      "Built-In",
      "Allows CLI Keys",
      "Person Count",
      "CLI Key Count",
    ],
    colWidths: [null, 50, 10, 10, 10, 10],
    wordWrap: true,
    style: {
      head: [], //disable colors in header cells
    },
  });

  const orgRoles = R.sort(
    R.ascend(R.prop("name")),
    graphTypes(state.graph).orgRoles
  ) as Rbac.OrgRole[];

  for (let orgRole of orgRoles) {
    const userCount = graphTypes(state.graph).orgUsers.filter(
      R.propEq("orgRoleId", orgRole.id)
    ).length;

    const cliKeyCount = graphTypes(state.graph).cliUsers.filter(
      R.propEq("orgRoleId", orgRole.id)
    ).length;

    table.push([
      { vAlign: "center", content: chalk.bold(orgRole.name) },
      { content: orgRole.description },
      {
        hAlign: "center",
        vAlign: "center",
        content: orgRole.isDefault ? "Yes" : "No",
      },
      {
        hAlign: "center",
        vAlign: "center",
        content: orgRole.canHaveCliUsers ? "Yes" : "No",
      },
      {
        hAlign: "center",
        vAlign: "center",
        content: userCount,
      },
      {
        hAlign: "center",
        vAlign: "center",
        content: cliKeyCount,
      },
    ]);
  }

  console.log(table.toString());
  autoModeOut({
    orgRoles: orgRoles.map((or) =>
      R.pick(["id", "name", "description", "canHaveCliUsers", "isDefault"], or)
    ),
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { graphTypes } from "@core/lib/graph";
import chalk from "chalk";
import Table from "cli-table3";
import * as R from "ramda";
import { Model, Rbac } from "@core/types";
import { autoModeOut } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["list", "$0"];
export const desc = "List CLI keys.";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  const { state, auth } = await initCore(argv, true);
  // override account from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  const table = new Table({
    head: ["Name", "Org Role"],
    style: {
      head: [], //disable colors in header cells
    },
  });

  const cliUsers = R.sort(
    R.ascend(R.prop("name")),
    graphTypes(state.graph).cliUsers
  ).filter((u) => !u.deactivatedAt) as Model.CliUser[];

  for (let cliKey of cliUsers) {
    if (cliKey.deactivatedAt || cliKey.deletedAt) {
      continue;
    }
    const orgRole = state.graph[cliKey.orgRoleId] as Rbac.OrgRole;

    table.push([chalk.bold(cliKey.name), orgRole.name]);
  }

  console.log(table.toString());
  autoModeOut({
    cliKeys: cliUsers
      .filter((cliKey) => !(cliKey.deactivatedAt || cliKey.deletedAt))
      .map((cliKey) => R.pick(["id", "name", "orgRoleId"], cliKey)),
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

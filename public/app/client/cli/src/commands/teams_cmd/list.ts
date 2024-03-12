import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz, graphTypes } from "@core/lib/graph";
import { Api, Client } from "@core/types";
import chalk from "chalk";
import * as R from "ramda";
import Table from "cli-table3";
import { logAndExitIfActionFailed } from "../../lib/args";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["list", "$0"];
export const desc = "List teams.";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);

  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  if (!authz.canManageUserGroups(state.graph, auth.userId)) {
    return exit(1, chalk.red("You don't have permission to list teams."));
  }

  const teams = graphTypes(state.graph).groups.filter(
    (g) => g.objectType === "orgUser"
  );

  if (!teams.length) {
    console.log(chalk.bold("No teams."));
    return exit();
  }

  const table = new Table({
    head: ["Name", "Members"],
    style: {
      head: [], //disable colors in header cells
    },
  });

  for (let group of teams) {
    const members = graphTypes(state.graph).groupMemberships.filter(
      (gm) => gm.groupId === group.id
    );
    table.push([group.name, members.length]);
  }

  console.log(table.toString());

  autoModeOut({
    teams: teams.map((group) => ({
      ...R.pick(["id", "name"], group),
      members: graphTypes(state.graph).groupMemberships.filter(
        (gm) => gm.groupId === group.id
      ).length,
    })),
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

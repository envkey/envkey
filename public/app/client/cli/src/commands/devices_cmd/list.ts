import { exit } from "../../lib/process";
import chalk from "chalk";
import { initCore } from "../../lib/core";
import { graphTypes } from "@core/lib/graph";
import { Argv } from "yargs";
import { BaseArgs } from "../../types";
import Table from "cli-table3";
import { Model } from "@core/types";
import { autoModeOut } from "../../lib/console_io";
import { findUser } from "../../lib/args";
import * as R from "ramda";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["list [person]", "$0"];
export const desc = "List active devices.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("person", {
      type: "string",
      describe: "show a single person's devices (email address)",
    })
    .option("mine", {
      type: "boolean",
      describe: "show only your own authorized devices",
    });
export const handler = async (
  argv: BaseArgs & {
    person?: string;
    mine?: boolean;
  }
): Promise<void> => {
  let { state, auth } = await initCore(argv, true);
  // override account from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  let userId: string | undefined;

  if (argv["person"]) {
    const user = findUser(state.graph, argv["person"]);

    if (!user) {
      return exit(1, chalk.red.bold("Person not found"));
    }

    userId = user.id;
  } else if (argv.mine) {
    userId = auth.userId;
  }

  let devices = graphTypes(state.graph).orgUserDevices;

  if (userId) {
    devices = devices.filter((d) => d.userId === userId);
  }

  if (!devices.length) {
    return exit(1, "No authorized devices.");
  }

  devices = R.sortBy((d) => {
    const user = state.graph[d.userId] as Model.OrgUser;
    return [user?.lastName, user?.firstName].join(", ");
  }, devices);

  const table = new Table({
    style: {
      head: [], //disable colors in header cells
    },
    head: ["Person", "Device", "Authorized At"],
  });
  for (let d of devices) {
    const user = state.graph[d.userId] as Model.OrgUser;
    if (!user) {
      continue;
    }
    table.push([
      [user.firstName, chalk.bold(user.lastName)].join(" "),
      chalk.bold(d.name),
      new Date(d.createdAt).toISOString(),
    ]);
  }
  console.log(table.toString());
  autoModeOut({
    devices: devices.map((d) => ({
      ...R.pick(["id", "userId", "createdAt"], d),
      userEmail: (state.graph[d.userId] as Model.OrgUser)?.email,
    })),
  });

  return exit();
};

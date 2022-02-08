import * as R from "ramda";
import { authz, graphTypes, getActiveCliUsers } from "@core/lib/graph";
import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { Client, Model } from "@core/types";
import chalk from "chalk";
import Table from "cli-table3";
import {
  logAndExitIfActionFailed,
  sortByPredefinedOrder,
} from "../../lib/args";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

const clipboardy = require("clipboardy");
const notifier = require("node-notifier");

export const command = ["create [name] [role]"];
export const desc = "Create a CLI key for automating the EnvKey CLI.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("name", { type: "string", describe: "CLI key name" })
    .positional("role", { type: "string", describe: "Org role" });
export const handler = async (
  argv: BaseArgs & { name?: string; role?: string }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);

  // override account from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  let orgRoleId: string | undefined = argv["role"]
    ? authz
        .getCliUserCreatableOrgRoles(state.graph, auth.userId)
        ?.find((or) =>
          [
            or.id.toLowerCase(),
            or.name.toLowerCase(),
            or.defaultName?.toLowerCase(),
          ].includes(argv["role"]?.toLowerCase())
        )?.id
    : undefined;
  const now = Date.now();

  const name =
    argv.name ??
    (
      await prompt<{ name: string }>({
        type: "input",
        name: "name",
        message: "CLI key name:",
      })
    ).name;
  const alreadyExistsByName = graphTypes(state.graph)
    .cliUsers.filter((u) => !u.deactivatedAt)
    .find(R.propEq("name", name));
  if (alreadyExistsByName) {
    return exit(1, chalk.red.bold("A CLI Key already exists with that name."));
  }

  if (!orgRoleId) {
    orgRoleId = (
      await prompt<{ orgRoleId: string }>({
        type: "select",
        name: "orgRoleId",
        message: "Org role:",
        initial: 0,
        required: true,
        choices: sortByPredefinedOrder(
          ["Basic User", "Org Admin", "Org Owner"],
          authz.getCliUserCreatableOrgRoles(state.graph, auth.userId),
          "defaultName"
        ).map((or) => ({
          name: or.id,
          message: `${chalk.bold(or.name)} - ${or.description}`,
        })),
      })
    ).orgRoleId;
  }

  const role = graphTypes(state.graph).orgRoles.find((or) =>
    [or.id, or.name.toLowerCase(), or?.defaultName?.toLowerCase()].includes(
      orgRoleId
    )
  );
  if (!role) {
    return exit(1, chalk.red("Role is invalid."));
  }

  if (
    !authz.canCreateCliUser(state.graph, auth.userId, {
      orgRoleId: role.id,
    })
  ) {
    return exit(
      1,
      chalk.red("You don't have permission to create a CLI key with that role.")
    );
  }

  const { license, org } = graphTypes(state.graph);
  const numActive = org.deviceLikeCount;

  const licenseExpired = license.expiresAt != -1 && now > license.expiresAt;
  if (numActive >= license.maxDevices || licenseExpired) {
    let message = chalk.red(
      licenseExpired
        ? `Your org's ${
            license.provisional ? "provisional " : ""
          }license has expired.`
        : `Your org has reached its limit of ${license.maxDevices} device${
            license.maxDevices == 1 ? "" : "s"
          }.`
    );

    message += "\n";

    if (
      authz.hasOrgPermission(state.graph, auth.userId, "org_manage_billing")
    ) {
      message += `To generate more CLI keys, ${
        licenseExpired ? "renew" : "upgrade"
      } your org's license.`;
    } else {
      message += `To generate more CLI keys, ask an admin to ${
        licenseExpired ? "renew" : "upgrade"
      } your org's license.`;
    }
    return exit(1, message);
  }

  const res = await dispatch({
    type: Client.ActionType.CREATE_CLI_USER,
    payload: {
      name,
      orgRoleId,
    },
  });

  await logAndExitIfActionFailed(res, "Creating the CLI key failed.");

  console.log(chalk.bold("CLI key created.\n"));

  state = res.state;

  const newUser = graphTypes(state.graph).cliUsers.filter(
    R.propEq("createdAt", state.graphUpdatedAt)
  )[0];
  const orgName = (state.graph[auth.orgId] as Model.Org).name;

  const table = new Table({
    colWidths: [20, 40],
  });

  table.push(
    ["CLI Key Name", chalk.bold(newUser.name)],
    ["CLI Key Org Role", chalk.bold(role.name)],
    ["Org", chalk.bold(orgName)]
  );

  console.log(table.toString(), "\n");
  const { cliKey } = state.generatedCliUsers[0];
  console.log(
    "Save this user's CLI key. It won't be shown again.\n",
    `\nThe new key can be used with the CLI:\n  CLI flag: --cli-envkey=${chalk.bold(
      cliKey
    )}`,
    `\n  Environment variable: CLI_ENVKEY=${chalk.bold(cliKey)}`,
    "\n"
  );
  clipboardy.writeSync(cliKey);
  notifier.notify("The new CLI key has been copied to clipboard.");

  autoModeOut({ cliKey: cliKey, id: newUser.id, roleId: role.id });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

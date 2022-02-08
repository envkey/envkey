import { exit } from "../../lib/process";
import { Client, Model } from "@core/types";
import { findUser, logAndExitIfActionFailed } from "../../lib/args";
import { initCore, dispatch } from "../../lib/core";
import { Argv } from "yargs";
import { BaseArgs } from "../../types";
import chalk from "chalk";
import { authz, graphTypes } from "@core/lib/graph";
import * as R from "ramda";
import { autoModeOut } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";
const clipboardy = require("clipboardy");

export const command = "authorize [person]";
export const desc = "Authorize a new device.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("person", {
    type: "string",
    alias: "u",
    describe: "Email address (defaults to current user)",
    coerce: R.toLower,
  });
export const handler = async (
  argv: BaseArgs & { person?: string }
): Promise<void> => {
  let { state, auth } = await initCore(argv, true);
  // override account from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }
  // begin as self
  let granteeUser: Model.OrgUser | Model.CliUser | undefined = state.graph[
    auth.userId
  ] as Model.OrgUser;
  const now = Date.now();

  if (argv["person"]) {
    granteeUser = findUser(state.graph, argv["person"]);
    if (!granteeUser || granteeUser.type === "cliUser") {
      return exit(1, chalk.red.bold("The org user was not found."));
    }
  }
  if (!authz.canCreateDeviceGrant(state.graph, auth.userId, granteeUser.id)) {
    const message =
      auth.userId === granteeUser.id
        ? chalk.red(`You don't have permission to add another device.`)
        : chalk.red(
            `You don't have permission to invite another device for ${chalk.bold(
              granteeUser.id
            )}.`
          );

    return exit(1, message);
  }

  const { license, org } = graphTypes(state.graph);

  const licenseExpired = license.expiresAt != -1 && now > license.expiresAt;
  if (
    (license.maxDevices != -1 && org.deviceLikeCount >= license.maxDevices) ||
    licenseExpired
  ) {
    let message = chalk.red(
      licenseExpired
        ? `Your org's ${
            license.provisional ? "provisional " : ""
          }license has expired.`
        : `Your org has reached its limit of ${license.maxDevices} device${
            license.maxDevices == 1 ? "" : "s"
          }.\n`
    );
    if (
      authz.hasOrgPermission(state.graph, auth.userId, "org_manage_billing")
    ) {
      message += `To authorize more devices, ${
        licenseExpired ? "renew" : "upgrade"
      } your org's license.`;
    } else {
      message += `To authorize more devices, ask an admin to ${
        licenseExpired ? "renew" : "upgrade"
      } your org's license.`;
    }

    return exit(1, message);
  }

  const res = await dispatch({
    type: Client.ActionType.APPROVE_DEVICES,
    payload: [{ granteeId: granteeUser.id }],
  });

  await logAndExitIfActionFailed(res, "Failed creating device grant.");

  state = res.state;

  const { identityHash, encryptionKey } = state.generatedDeviceGrants[0];

  const outOfBandEncToken = [identityHash, encryptionKey].join("_");

  if (auth.userId === granteeUser.id) {
    console.log(
      `\nSuccess!\nTwo tokens are required to confirm the new device.\n 1. Check your email for an ${chalk.bold(
        "invitation token"
      )}.\n 2. Use the following encryption token:`
    );
  } else {
    console.log(
      `\nSuccess!\nTwo tokens are required for ${[
        granteeUser.firstName,
        granteeUser.lastName,
      ].join(" ")} to confirm the new device.\n 1. ${
        granteeUser.email
      } must check their email for an ${chalk.bold(
        "invitation token"
      )}.\n 2. Give them the following encryption token:`
    );
  }

  console.log(`\n    ${chalk.bold(outOfBandEncToken)}\n`);
  autoModeOut({ encryptionToken: outOfBandEncToken });

  clipboardy.writeSync(outOfBandEncToken);
  console.log(
    chalk.italic("    The encryption token was copied to your clipboard.")
  );
  console.log(
    `\n${
      auth.userId === granteeUser.id
        ? "Use"
        : [granteeUser.firstName, granteeUser.lastName, "can use"].join(" ")
    } ${chalk.bold(
      "envkey accept-invite"
    )} with both tokens to authenticate the new device.\n`
  );
  return exit();
};

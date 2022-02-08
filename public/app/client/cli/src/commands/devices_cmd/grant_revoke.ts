import chalk from "chalk";
import { Api, Model } from "@core/types";
import { exit } from "../../lib/process";
import { initCore, dispatch } from "../../lib/core";
import { logAndExitIfActionFailed } from "../../lib/args";
import { Argv } from "yargs";
import { BaseArgs } from "../../types";
import { authz } from "@core/lib/graph";
import { getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["revoke-pending [device-grant-id]"];
export const desc = "Revoke a pending device authorization.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("device-grant-id", { type: "string" });
export const handler = async (
  argv: BaseArgs & { "device-grant-id"?: string }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);
  // override account from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  const now = Date.now();
  const revokableDeviceGrants = authz.getRevokableDeviceGrants(
    state.graph,
    auth.userId,
    now
  );

  if (!revokableDeviceGrants.length) {
    console.log("There are no pending device grants.");
    return exit();
  }

  const deviceGrantId = (argv["device-grant-id"] ??
    (
      await prompt<{ id: string }>({
        type: "select",
        name: "id",
        message: "Select a device grant to revoke:",
        initial: 0,
        choices: revokableDeviceGrants.map((deviceGrant) => {
          const createdBy = state.graph[
            deviceGrant.grantedByUserId
          ]! as Model.OrgUser;
          const createdFor = state.graph[
            deviceGrant.granteeId
          ]! as Model.OrgUser;
          return {
            name: deviceGrant.id,
            message: `${deviceGrant.id} - created by ${chalk.bold(
              createdBy.email
            )} for ${chalk.bold(createdFor.email)} at ${new Date(
              deviceGrant.createdAt
            ).toUTCString()} UTC`,
          };
        }),
      })
    ).id) as string;

  if (
    !authz.canRevokeDeviceGrant(state.graph, auth.userId, deviceGrantId, now)
  ) {
    return exit(
      1,
      chalk.red("You aren't permitted to revoke this device grant.")
    );
  }

  const res = await dispatch({
    type: Api.ActionType.REVOKE_DEVICE_GRANT,
    payload: { id: deviceGrantId },
  });
  await logAndExitIfActionFailed(res, "Failed revoking the device grant.");

  console.log(chalk.bold("The device grant was revoked."));

  return exit();
};

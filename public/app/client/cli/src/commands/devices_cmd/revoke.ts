import { exit } from "../../lib/process";
import chalk from "chalk";
import { dispatch, initCore } from "../../lib/core";
import { Api, Model } from "@core/types";
import { logAndExitIfActionFailed } from "../../lib/args";
import * as R from "ramda";
import { authz } from "@core/lib/graph";
import { Argv } from "yargs";
import { BaseArgs } from "../../types";
import { getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["revoke [device]"];
export const desc = "Revoke a device.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("device", {
    type: "string",
    description: "Device name or id",
  });
export const handler = async (
  argv: BaseArgs & { device?: string }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);
  // override account from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  const revokableDevices = authz.getRevokableDevices(state.graph, auth.userId);
  if (!revokableDevices.length) {
    return exit(
      1,
      "There are no revokable devices, or you lack permission to revoke them."
    );
  }

  const deviceId = (argv.device ??
    (
      await prompt<{ deviceId: string }>({
        type: "autocomplete",
        name: "deviceId",
        message: "Select device:",
        initial: 0,
        choices: revokableDevices.map((d) => {
          const user = state.graph[d.userId] as Model.OrgUser;
          return {
            name: d.id,
            message: `${chalk.bold(d.name)} (${user.email} - ${
              user.firstName
            } ${user.lastName})`,
          };
        }),
      })
    ).deviceId) as string;

  const device =
    (state.graph[deviceId] as Model.OrgUserDevice) ??
    // current user's own device name
    revokableDevices.find(R.whereEq({ userId: auth.userId, name: deviceId }));
  if (!device) {
    return exit(1, chalk.red.bold("Device not found."));
  }

  if (!authz.canRevokeDevice(state.graph, auth.userId, device.id)) {
    return exit(1, chalk.red("You aren't permitted to revoke this device."));
  }

  const res = await dispatch({
    type: Api.ActionType.REVOKE_DEVICE,
    payload: { id: device.id },
  });
  await logAndExitIfActionFailed(res, "Device revocation failed.");

  console.log(chalk.bold("The device was revoked."));

  return exit();
};

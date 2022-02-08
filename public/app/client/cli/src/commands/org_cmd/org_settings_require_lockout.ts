import { logAndExitIfActionFailed } from "../../lib/args";
import { printOrgSettings } from "../../lib/settings";
import { promptPassphrase } from "../../lib/crypto";
import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { Client, Api, Model } from "@core/types";
import { authz } from "@core/lib/graph";
import { BaseArgs } from "../../types";
import chalk from "chalk";
import { getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = "require-lockout [minutes]";
export const desc =
  "Require all users of the organization to set an inactivity lockout. Also adds passphrase requirement if not already set.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("minutes", {
      type: "number",
      describe: "max allowed inactivity lockout (in minutes)",
    })
    .option("remove", {
      type: "boolean",
      describe: "remove lockout requirement",
      conflicts: ["minutes"],
    });
export const handler = async (
  argv: BaseArgs & { minutes?: number; remove?: boolean }
): Promise<void> => {
  const prompt = getPrompt();
  const { auth, state } = await initCore(argv, true, true);
  // override account from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  const org = state.graph[auth.orgId] as Model.Org;

  if (!authz.canUpdateOrgSettings(state.graph, auth.userId)) {
    return exit(
      1,
      chalk.bold(
        `You don't have permission to update settings for ${org.name}.`
      )
    );
  }

  if (argv.remove) {
    if (org.settings.crypto.requiresLockout) {
      const res = await dispatch({
        type: Api.ActionType.UPDATE_ORG_SETTINGS,
        payload: {
          ...org.settings,
          crypto: {
            ...org.settings.crypto,
            requiresLockout: false,
            lockoutMs: undefined,
          },
        },
      });

      await logAndExitIfActionFailed(
        res,
        `Failed to remove lockout requirement from ${org.name}`
      );

      console.log(
        chalk.bold(`Successfully removed lockout requirement from ${org.name}.`)
      );

      printOrgSettings(res.state.graph[auth.orgId] as Model.Org, [
        "requiresPassphrase",
        "requiresLockout",
        "lockoutMs",
      ]);
    } else {
      console.log(chalk.bold(`${org.name} doesn't require a lockout.`));
    }
  } else {
    if (!state.requiresPassphrase) {
      const passphrase = await promptPassphrase(
        "Set a passphrase for this device. Min 10 characters:",
        true,
        true
      );

      await dispatch({
        type: Client.ActionType.SET_DEVICE_PASSPHRASE,
        payload: { passphrase },
      });
    }

    const minutes =
        argv.minutes ??
        (
          await prompt<{ minutes: number }>({
            type: "numeral",
            name: "minutes",
            min: 1,
            float: false,
            required: true,
            message: "Minutes of inactivity before lockout:",
          })
        ).minutes,
      lockoutMs = minutes * 60 * 1000;

    const res = await dispatch({
      type: Api.ActionType.UPDATE_ORG_SETTINGS,
      payload: {
        ...org.settings,
        crypto: {
          ...org.settings.crypto,
          requiresPassphrase: true,
          requiresLockout: true,
          lockoutMs,
        },
      },
    });

    await logAndExitIfActionFailed(
      res,
      `Failed to set lockout requirement for ${org.name}`
    );

    const needsDeviceLockout = !state.lockoutMs || state.lockoutMs > lockoutMs;
    if (needsDeviceLockout) {
      await dispatch({
        type: Client.ActionType.SET_DEVICE_LOCKOUT,
        payload: { lockoutMs },
      });
    }

    console.log(
      chalk.bold(
        `Successfully added lockout requirement for users of ${org.name}.`
      )
    );

    if (needsDeviceLockout) {
      console.log(
        "Also set your device lockout, since it either wasn't set or was higher than the new requirement."
      );
    }

    printOrgSettings(res.state.graph[auth.orgId] as Model.Org, [
      "requiresPassphrase",
      "requiresLockout",
      "lockoutMs",
    ]);
  }

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

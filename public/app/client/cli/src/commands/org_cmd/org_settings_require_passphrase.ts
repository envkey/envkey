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
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["require-passphrase"];
export const desc =
  "Require all users of the organization to set a device passphrase.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.option("remove", {
    type: "boolean",
    describe: "remove passphrase requirement",
  });
export const handler = async (
  argv: BaseArgs & { remove?: boolean }
): Promise<void> => {
  const { auth, state } = await initCore(argv, true, true);
  // override account from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  const org = state.graph[auth.orgId] as Model.Org;
  const initialRequiresLockout = org.settings.crypto.requiresLockout;

  if (!authz.canUpdateOrgSettings(state.graph, auth.userId)) {
    return exit(
      1,
      chalk.bold(
        `You don't have permission to update settings for ${org.name}.`
      )
    );
  }

  if (argv.remove) {
    if (org.settings.crypto.requiresPassphrase) {
      const res = await dispatch({
        type: Api.ActionType.UPDATE_ORG_SETTINGS,
        payload: {
          ...org.settings,
          crypto: {
            ...org.settings.crypto,
            requiresPassphrase: false,
            requiresLockout: false,
            lockoutMs: undefined,
          },
        },
      });

      await logAndExitIfActionFailed(
        res,
        `Failed to remove passphrase requirement from ${org.name}`
      );

      console.log(
        chalk.bold(
          `Successfully removed passphrase ${
            initialRequiresLockout ? "and lockout requirements" : "requirement"
          } from ${org.name}.`
        )
      );

      printOrgSettings(res.state.graph[auth.orgId] as Model.Org, [
        "requiresPassphrase",
        "requiresLockout",
        "lockoutMs",
      ]);
    } else {
      console.log(chalk.bold(`${org.name} doesn't require a passphrase.`));
    }
  } else {
    if (org.settings.crypto.requiresPassphrase) {
      console.log(chalk.bold(`${org.name} already requires a passphrase.`));
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

      let res = await dispatch({
        type: Api.ActionType.UPDATE_ORG_SETTINGS,
        payload: {
          ...org.settings,
          crypto: {
            ...org.settings.crypto,
            requiresPassphrase: true,
          },
        },
      });

      await logAndExitIfActionFailed(
        res,
        `Failed to set passphrase requirement for ${org.name}`
      );

      console.log(
        chalk.bold(
          `Successfully added passphrase requirement for users of ${org.name}.`
        )
      );

      printOrgSettings(res.state.graph[auth.orgId] as Model.Org, [
        "requiresPassphrase",
        "requiresLockout",
        "lockoutMs",
      ]);
    }
  }

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

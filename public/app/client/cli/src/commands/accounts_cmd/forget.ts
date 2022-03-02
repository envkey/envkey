import { exit } from "../../lib/process";
import { BaseArgs } from "../../types";
import { Argv } from "yargs";
import chalk from "chalk";
import { dispatch, initCore } from "../../lib/core";
import { chooseAccount } from "../../lib/auth";
import { Client } from "@core/types";
import { logAndExitIfActionFailed } from "../../lib/args";
import { getPrompt, alwaysWriteError } from "../../lib/console_io";

export const command = "forget";
export const desc =
  "Revoke device access and remove the account from this device.";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  const prompt = getPrompt();
  let { state } = await initCore(argv, false);

  let account: Client.ClientUserAuth | undefined;
  try {
    account = await chooseAccount(state, false, false);
    if (!account) {
      alwaysWriteError("No accounts are available");
      return await exit(0);
    }
  } catch (err) {
    return await exit(1, err);
  }

  console.log(
    chalk.bold(
      `\nYou won't be able to sign in to ${account.orgName} again on this device without a new invitation.\n`
    )
  );

  const { shouldContinue } = await prompt<{
    shouldContinue: boolean;
  }>({
    type: "confirm",
    name: "shouldContinue",
    message: "Are you sure you want to forget this account?",
  });
  if (!shouldContinue) {
    console.log(chalk.bold("Aborted."));
    return exit();
  }

  const res = await dispatch(
    {
      type: Client.ActionType.FORGET_DEVICE,
      payload: {
        accountId: account.userId,
      },
    },
    account.userId
  );

  await logAndExitIfActionFailed(res, "Forgetting the account failed.");

  console.log(chalk.bold("The account was forgotten."));

  return exit();
};

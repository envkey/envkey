import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore, dispatch } from "../../lib/core";
import { BaseArgs } from "../../types";
import {
  authFromEmail,
  chooseAccount,
  listAccounts,
  printNoAccountsHelp,
} from "../../lib/auth";
import { alwaysWriteError } from "../../lib/console_io";
import { Client } from "@core/types";

export const command = "set-default [account]";
export const desc = "Set the default account when using the CLI.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("account", {
    type: "string",
    describe: "Account name to choose",
  });
export const handler = async (argv: BaseArgs): Promise<void> => {
  const { state } = await initCore(argv, false),
    accounts = Object.values(state.orgUserAccounts) as Client.ClientUserAuth[];
  if (!accounts.length) {
    printNoAccountsHelp();
    return exit();
  }
  let auth: Client.ClientUserAuth | undefined;

  if (argv.account) {
    auth = await authFromEmail(state, argv.account);
  }

  if (!auth) {
    if (accounts.length == 1 && !argv.account) {
      auth = accounts[0];
    } else {
      try {
        auth = await chooseAccount(state, true, false);
        if (!auth) {
          alwaysWriteError("No accounts are available");
          await exit(0);
        }
      } catch (err) {
        await exit(1, err);
      }
    }
  }

  const res = await dispatch({
    type: Client.ActionType.SELECT_DEFAULT_ACCOUNT,
    payload: {
      accountId: auth!.userId,
    },
  });

  listAccounts(res.state);

  return exit();
};

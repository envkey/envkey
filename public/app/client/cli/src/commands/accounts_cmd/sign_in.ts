import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore, getState } from "../../lib/core";
import { BaseArgs } from "../../types";
import {
  signIn,
  authFromEmail,
  chooseAccount,
  printNoAccountsHelp,
  printAccount,
} from "../../lib/auth";
import * as R from "ramda";
import { Client } from "@core/types";
import chalk from "chalk";

export const command = ["sign-in", "login"];
export const desc =
  "Sign in to an EnvKey account stored on this device. To sign in on a new device, use `envkey accept-invite`.";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  let { state } = await initCore(argv, false);
  const accounts = Object.values(
    state.orgUserAccounts
  ) as Client.ClientUserAuth[];
  if (!accounts.length) {
    printNoAccountsHelp();
    return exit();
  }
  let auth:
    | Client.ClientUserAuth
    | Client.PendingSelfHostedDeployment
    | undefined;

  if (argv.account) {
    auth = await authFromEmail(state, argv.account);

    if (!auth) {
      auth = R.find(
        R.propEq("email", argv.account),
        state.pendingSelfHostedDeployments
      );
    }
  }

  if (!auth) {
    if (
      accounts.length == 1 &&
      state.pendingSelfHostedDeployments.length == 0 &&
      !argv.account
    ) {
      auth = accounts[0];
    } else if (
      accounts.length == 0 &&
      state.pendingSelfHostedDeployments.length == 1 &&
      !argv.account
    ) {
      auth = state.pendingSelfHostedDeployments[0];
    } else if (accounts.length == 0) {
      return await exit(1, "There are no accounts on this device.");
    } else {
      auth = await chooseAccount(state, false, true);
    }
  }

  if (!auth) {
    console.error("No accounts are available");
    return exit(0);
  }

  let signedInAuth: Client.ClientUserAuth;

  if (auth.type == "clientUserAuth") {
    signedInAuth = await signIn(auth);
  } else {
    signedInAuth = await signIn(
      auth,
      state.pendingSelfHostedDeployments.indexOf(auth)
    );
  }

  console.log(chalk.bold("Signed in to EnvKey.\n"));

  state = getState();

  auth = R.last(
    R.sortBy(
      R.prop("lastAuthAt"),
      Object.values(
        state.orgUserAccounts as Record<string, Client.ClientUserAuth>
      )
    )
  )!;

  printAccount(
    signedInAuth.userId,
    auth,
    state.defaultAccountId == signedInAuth.userId,
    state.graph
  );
  console.log("");

  return exit();
};

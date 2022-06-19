import * as R from "ramda";
import { Auth, Api, Client, Model } from "@core/types";
import { BaseArgs } from "../types";
import { sha256 } from "@core/lib/crypto/utils";
import { dispatch, refreshState } from "./core";
import { logAndExitIfActionFailed } from "./args";
import { exit } from "./process";
import chalk from "chalk";
import Table from "cli-table3";
import { spinner, stopSpinner } from "./spinner";
import { wait } from "@core/lib/utils/wait";
import util from "util";
import { getPrompt } from "./console_io";
import { detectApp } from "../app_detection";

export const authenticate = async <
    IncludePendingSelfHostedType extends boolean | undefined
  >(
    state: Client.State,
    argv: BaseArgs,
    forceChooseAccount?: true,
    maybeTargetObjectId?: string
  ): Promise<{
    auth: Client.ClientUserAuth | Client.ClientCliAuth | undefined;
    accountIdOrCliKey: string | undefined;
  }> => {
    let auth: Client.ClientUserAuth | Client.ClientCliAuth | undefined,
      accountIdOrCliKey: string | undefined;

    const accounts = Object.values(
      state.orgUserAccounts
    ) as Client.ClientUserAuth[];

    const signedInAccounts = accounts.filter((acct) => acct.token);

    argv["detectedApp"] = await detectApp(state, argv, process.cwd());

    if (argv["cli-envkey"] ?? process.env.CLI_ENVKEY) {
      accountIdOrCliKey = (argv["cli-envkey"] ?? process.env.CLI_ENVKEY)!;

      const hash = sha256(accountIdOrCliKey),
        cliAuth = state.cliKeyAccounts[hash];

      if (cliAuth) {
        auth = cliAuth;
      } else {
        const res = await dispatch({
          type: Client.ActionType.AUTHENTICATE_CLI_KEY,
          payload: { cliKey: accountIdOrCliKey },
        });

        auth = res.state.cliKeyAccounts[hash];
      }
    } else if (argv.account) {
      auth = await authFromEmail(state, argv.account, argv.org, accounts);
    } else if (maybeTargetObjectId && signedInAccounts.length > 1) {
      // if we are targeting a specific object in the graph for an action
      // look through signed in accounts to see if that object is in one
      // of their graphs, and if so then use that account
      for (let acct of signedInAccounts) {
        let accountState = await refreshState(acct.userId);
        if (!accountState.graphUpdatedAt) {
          const res = await dispatch({
            type: Client.ActionType.GET_SESSION,
          });
          if (res.success) {
            accountState = res.state;
          }
        }

        if (accountState.graph[maybeTargetObjectId]) {
          auth = acct;
          break;
        }
      }
    } else if (argv["detectedApp"] && !forceChooseAccount) {
      auth = state.orgUserAccounts[argv["detectedApp"].accountId];
    } else if (state.defaultAccountId && !forceChooseAccount) {
      auth = state.orgUserAccounts[state.defaultAccountId];
    } else if (signedInAccounts.length == 1 && !forceChooseAccount) {
      auth = signedInAccounts[0];
    } else if (accounts.length == 1) {
      auth = accounts[0];
    } else if (accounts.length > 1) {
      auth = await chooseAccount(state, false, false);
    }

    if (!auth) {
      return exit(
        1,
        chalk.bold("Authentication required."),
        "Use",
        chalk.bold("`envkey sign-in`") + ", or",
        chalk.bold("`envkey accept-invite`")
      );
    }

    if (auth.type == "clientUserAuth" && (!auth.token || !auth.privkey)) {
      auth = await signIn(auth);
    }

    return {
      auth,
      accountIdOrCliKey: accountIdOrCliKey ?? auth?.userId,
    };
  },
  chooseAccount = async <IncludePendingSelfHostedType extends boolean>(
    state: Client.State,
    signedInOnly: boolean,
    includePendingSelfHosted: IncludePendingSelfHostedType,
    chooseAccountFilter?: (auth: Client.ClientUserAuth) => boolean
  ) => {
    const prompt = getPrompt();
    let choices = (
      Object.values(state.orgUserAccounts) as Client.ClientUserAuth[]
    )
      .filter(
        (auth) =>
          (!signedInOnly || auth.token) &&
          (!chooseAccountFilter || chooseAccountFilter(auth))
      )
      .map((acct) => ({
        name: acct.userId,
        message: `${acct.orgName} - ${chalk.bold(acct.email)}`,
      }));

    if (includePendingSelfHosted) {
      choices = choices.concat(
        state.pendingSelfHostedDeployments.map((pending, i) => ({
          name: i.toString(),
          message: `${pending.orgName} - ${chalk.bold(pending.email)}`,
        }))
      );
    }
    if (choices.length === 0) {
      return undefined;
    }

    const { id } = await prompt<{ id: string }>({
      type: "select",
      name: "id",
      message: "Select an account on this device:",
      initial: 0,
      choices,
    });

    return (
      includePendingSelfHosted
        ? state.orgUserAccounts[id] ??
          state.pendingSelfHostedDeployments[parseInt(id)]
        : state.orgUserAccounts[id]
    ) as IncludePendingSelfHostedType extends true
      ? Client.ClientUserAuth | Client.PendingSelfHostedDeployment
      : Client.ClientUserAuth;
  },
  chooseOrg = async (
    state: Client.State,
    emailOrUserId: string,
    signedIn?: true
  ): Promise<Client.ClientUserAuth> => {
    const prompt = getPrompt();
    const { id } = await prompt<{ id: string }>({
      type: "select",
      name: "id",
      message: "Select an account on this device:",
      initial: 0,
      choices: (Object.values(state.orgUserAccounts) as Client.ClientUserAuth[])
        .filter(
          (acct) =>
            (acct.email == emailOrUserId || acct.userId === emailOrUserId) &&
            (!signedIn || acct.token)
        )
        .map((acct) => ({
          name: acct.userId,
          message: chalk.bold(acct.orgName),
        })),
    });

    return state.orgUserAccounts[id]!;
  },
  authFromEmail = async (
    state: Client.State,
    emailOrUserId: string,
    org?: string,
    accountsArg?: Client.ClientUserAuth[]
  ) => {
    const accounts =
        accountsArg ??
        (Object.values(state.orgUserAccounts) as Client.ClientUserAuth[]),
      candidates = accounts.filter(
        (acct) => acct!.email == emailOrUserId || acct.userId == emailOrUserId
      );

    if (candidates.length == 1) {
      return candidates[0];
    } else if (candidates.length > 1) {
      if (org) {
        return candidates.find(({ orgName }) => orgName.toLowerCase() == org);
      } else {
        return chooseOrg(state, emailOrUserId);
      }
    }

    return undefined;
  };

export async function signIn(
  auth: Client.ClientUserAuth
): Promise<Client.ClientUserAuth>;
export async function signIn(
  auth: Client.ClientUserAuth,
  pendingSelfHostedDeploymentIndex: undefined,
  attemptCounter?: number
): Promise<Client.ClientUserAuth>;
export async function signIn(
  auth: Client.PendingSelfHostedDeployment,
  pendingSelfHostedDeploymentIndex: number,
  attemptCounter?: number
): Promise<Client.ClientUserAuth>;
// recusive calls of signIn() are recommended to pass the attempt counter
export async function signIn(
  auth: Client.ClientUserAuth | Client.PendingSelfHostedDeployment,
  pendingSelfHostedDeploymentIndex?: number | undefined,
  attemptCounter = 0
): Promise<Client.ClientUserAuth> {
  const prompt = getPrompt();
  let emailVerificationToken: string | undefined;
  let externalAuthSessionId: string | undefined;

  if (attemptCounter > 4) {
    // Infinite loop due to a bug somewhere. None are known at this time, but this has happened and slammed the server.
    throw new Error("Too many retry attempts on sign-in");
  }

  if (auth.type == "pendingSelfHostedDeployment") {
    console.log(
      `\nIf your installation of EnvKey Self-Hosted finished successfully, you should have received an email at ${
        auth.email
      } including an ${chalk.bold("Init Token")}.\n\n${chalk.bold(
        "*Note:"
      )} you might also need to wait for DNS records to finish propagating for ${chalk.bold(
        auth.domain
      )}\n`
    );

    let { initToken } = await prompt<{
      initToken: string;
    }>({
      type: "password",
      name: "initToken",
      message: `Paste your ${chalk.bold("Init Token")} here:`,
    });

    const loginRes = await dispatch({
      type: Client.ActionType.SIGN_IN_PENDING_SELF_HOSTED,
      payload: { initToken, index: pendingSelfHostedDeploymentIndex! },
    });

    await logAndExitIfActionFailed(
      loginRes,
      `Failed to sign in to Self-Hosted EnvKey installation. Please ensure that the installation has completed successfully and try again.\nYou can check installation status here:\n\n${chalk.bold(
        auth.codebuildLink
      )}\n\n${chalk.bold(
        "*Note:"
      )} you might also need to wait for DNS records to finish propagating on your domain: ${chalk.bold(
        auth.domain
      )}`
    );

    return R.last(
      R.sortBy(
        R.prop("addedAt"),
        Object.values(
          loginRes.state.orgUserAccounts as Record<
            string,
            Client.ClientUserAuth
          >
        )
      )
    )!;
  } else {
    // not pending self-hosted. regular sign-in to account on device.

    const { email, userId } = auth;

    switch (auth.provider) {
      case "email":
        spinner();
        const createVerifRes = await dispatch(
          {
            type: Api.ActionType.CREATE_EMAIL_VERIFICATION,
            payload: { email, authType: "sign_in" },
          },
          userId
        );
        stopSpinner();
        const { verifyEmailError } = createVerifRes.state;
        if (verifyEmailError?.type === "signInWrongProviderError") {
          // provider will have been switched in new state
          return signIn(
            createVerifRes.state.orgUserAccounts[userId]!,
            undefined,
            attemptCounter + 1
          );
        }
        // normal email sign-in
        await logAndExitIfActionFailed(
          createVerifRes,
          "Failed creating an email verification token."
        );
        ({ emailVerificationToken } = await prompt<{
          emailVerificationToken: string;
        }>({
          type: "password",
          name: "emailVerificationToken",
          message: `${chalk.green.bold(
            "Sign In →"
          )} an email verification was just sent to ${chalk.green.bold(
            email
          )}. Paste it here:`,
        }));

        spinner();
        let checkValidRes = await dispatch(
          {
            type: Api.ActionType.CHECK_EMAIL_TOKEN_VALID,
            payload: { email, token: emailVerificationToken },
          },
          userId
        );
        stopSpinner();

        // TODO: add link to issues support here
        while (!checkValidRes.success) {
          ({ emailVerificationToken } = await prompt<{
            emailVerificationToken: string;
          }>({
            type: "password",
            name: "emailVerificationToken",
            message: "Sign in token invalid. Please try again:",
          }));

          spinner();
          checkValidRes = await dispatch(
            {
              type: Api.ActionType.CHECK_EMAIL_TOKEN_VALID,
              payload: { email, token: emailVerificationToken },
            },
            userId
          );
          stopSpinner();
        }

        console.log(chalk.bold("Email verified.\n"));
        break;

      case "saml":
        const createSessRes = await dispatch({
          type: Client.ActionType.CREATE_EXTERNAL_AUTH_SESSION_FOR_LOGIN,
          payload: {
            waitBeforeOpenMillis: 1500,
            authMethod: "saml",
            provider: "saml",
            externalAuthProviderId: auth.externalAuthProviderId!,
            orgId: auth.orgId,
            userId,
          },
        });
        // handle special errors where provider is different
        if (createSessRes.state.startingExternalAuthSessionError) {
          if (
            ["requiresEmailAuthError", "signInWrongProviderError"].includes(
              createSessRes.state.startingExternalAuthSessionError.type
            )
          ) {
            // auth method has changed to email since last time they logged in, state was updated by producer
            return signIn(
              createSessRes.state.orgUserAccounts[userId]!,
              undefined,
              attemptCounter + 1
            );
          }
        }

        await logAndExitIfActionFailed(
          createSessRes,
          "Failed creating SAML pending session"
        );
        console.log(
          chalk.blueBright("You will be prompted to authenticate externally")
        );

        let state = createSessRes.state;
        while (!state.completedExternalAuth) {
          process.stderr.write(".");
          await wait(950);
          state = await refreshState();
          if (state.authorizingExternallyErrorMessage) {
            await exit(
              1,
              util.inspect(state.authorizingExternallyErrorMessage)
            );
          }
        }
        externalAuthSessionId =
          state.completedExternalAuth.externalAuthSessionId;
        console.log("Successfully logged in with SAML.");
        break;

      default:
        throw new Error(
          `External provider ${auth.provider} is not yet supported`
        );
    }

    spinner();
    const loginRes = await dispatch<
      Client.Action.ClientActions["CreateSession"]
    >(
      {
        type: Client.ActionType.CREATE_SESSION,
        payload: {
          accountId: userId,
          emailVerificationToken,
          externalAuthSessionId,
        },
      },
      userId
    );
    stopSpinner();

    await logAndExitIfActionFailed(loginRes, "Signing in failed.");

    return loginRes.state.orgUserAccounts[userId]!;
  }
}

export const listAccounts = (state: Client.State) => {
  const orgUserAccounts = R.toPairs(
      state.orgUserAccounts as Record<string, Client.ClientUserAuth>
    ),
    pendingSelfHostedDeployments = state.pendingSelfHostedDeployments.map(
      (auth, i) => [`pendingSelfHostedDeployment-${i}`, auth]
    ),
    accounts = R.sortBy(([_, auth]) => auth.orgName, [
      ...orgUserAccounts,
      ...pendingSelfHostedDeployments,
    ] as [
      string,
      Client.ClientUserAuth | Client.PendingSelfHostedDeployment
    ][]),
    numAccounts = accounts.length;

  console.log(
    chalk.bold(
      "You have",
      numAccounts,
      `EnvKey account${numAccounts > 1 ? "s" : ""}`,
      "on this device:"
    )
  );

  for (let [accountId, account] of accounts) {
    if (accountId == state.defaultAccountId) {
      continue;
    }
    printAccount(accountId, account, false, state.graph);
  }

  if (state.defaultAccountId) {
    printAccount(
      state.defaultAccountId,
      state.orgUserAccounts[state.defaultAccountId]!,
      true,
      state.graph
    );
  }
};

export const printAccount = (
    accountId: string,
    account: Client.ClientUserAuth | Client.PendingSelfHostedDeployment,
    isDefault: boolean,
    graph?: Client.Graph.UserGraph
  ) => {
    let authStatus: string;
    if (account.type == "pendingSelfHostedDeployment") {
      authStatus = "Pending";
    } else if (account.token) {
      authStatus = "Signed in";
    } else {
      authStatus = " Signed out";
    }
    const signedIn = authStatus == "Signed in";

    const table = new Table({
      colWidths: [11, 36, 13, 13],
      style: {
        head: [], //disable colors in header cells
        border: signedIn ? [isDefault ? "cyan" : "green"] : [],
      },
    });

    let { provider } = account;
    const thisUser = graph?.[accountId] as Model.OrgUser | undefined;
    if (thisUser?.provider) {
      // read from the graph, if it's the current active user
      provider = thisUser.provider;
    }

    table.push(
      [
        {
          content: chalk.bold("🔑"),
          hAlign: "center",
        },
        {
          content: chalk.bold(account.orgName),
          colSpan: isDefault ? 1 : 2,
        },
        isDefault && {
          content: chalk.bgCyan(chalk.whiteBright(chalk.bold(" Default "))),
          hAlign: "center",
        },
        {
          content: signedIn
            ? chalk.bgGreen(chalk.whiteBright(chalk.bold(` ${authStatus} `)))
            : authStatus,
          hAlign: "center",
        },
      ].filter(Boolean) as any,
      ["Host", { content: chalk.bold(account.hostUrl), colSpan: 3 }],
      ["Email", { content: chalk.bold(account.email), colSpan: 3 }],
      [
        "Auth",
        {
          content: chalk.bold(Auth.AUTH_PROVIDERS[provider]),
          colSpan: 3,
        },
      ],
      [
        "Device",
        {
          content: chalk.bold(account.deviceName),
          colSpan: 3,
        },
      ],
      [
        "Security",
        {
          content: chalk.bold(
            account.requiresPassphrase && account.lockoutMs
              ? account.requiresLockout
                ? `passphrase and max ${
                    account.lockoutMs / 1000 / 60
                  } minute lockout required`
                : "passphrase required, no lockout required"
              : "no passphrase or lockout required"
          ),
          colSpan: 3,
        },
      ]
    );

    console.log("");
    console.log(table.toString());
  },
  printNoAccountsHelp = () => {
    console.log(chalk.bold("No EnvKey accounts are stored on this device.\n"));
    console.log("Try", chalk.bold("`envkey accept-invite`"), "\n");
  },
  printDeviceSettings = (state: Client.State) => {
    const defaultAccount = state.defaultAccountId
        ? state.orgUserAccounts[state.defaultAccountId]
        : undefined,
      defaultAccountString = defaultAccount
        ? [defaultAccount.orgName, defaultAccount.email].join(" - ")
        : "none";

    const table = new Table({
      colWidths: [22, 53],
      colAligns: ["left", "center"],
      style: {
        head: [], //disable colors in header cells
      },
    });

    table.push(
      [{ colSpan: 2, content: chalk.bold(chalk.cyan("Device Settings")) }],
      ["Default Device Name", state.defaultDeviceName],
      ["Has Passphrase", state.requiresPassphrase ? "yes" : "no"],
      [
        "Inactivity Lockout",
        state.lockoutMs
          ? (state.lockoutMs / 1000 / 60).toString() + " minutes"
          : "none",
      ],
      ["Default Account", defaultAccountString]
    );

    console.log("");
    console.log(table.toString());
  };

import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { BaseArgs } from "../../types";
import { destroyHost } from "@infra/destroy-host";
import { regions, Region } from "@infra/stack-constants";
import { chooseAccount } from "../../lib/auth";
import { initCore, dispatch } from "../../lib/core";
import { Client } from "@core/types";
import chalk from "chalk";
import { getPrompt } from "../../lib/console_io";

export const command = "destroy";
export const desc =
  "Completely removes a self-hosted EnvKey installation and all associated resources from an AWS account.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .option("deployment-tag", {
      type: "string",
      describe: "Manually pass a deployment tag (optional)",
    })
    .option("profile", {
      type: "string",
      default: "envkey-host",
      description: "Manually pass AWS credentials profile name (optional)",
    })
    .positional("primary-region", {
      type: "string",
      choices: regions,
      describe: "Manually pass a primary region (optional)",
    })
    .option("failover-region", {
      type: "string",
      choices: regions,
      describe: "Manually pass a failover region (optional)",
    });
export const handler = async (
  argv: BaseArgs & {
    "primary-region"?: string;
    "failover-region"?: string;
    "deployment-tag"?: string;
    profile?: string;
  }
): Promise<void> => {
  const prompt = getPrompt();
  const { state } = await initCore(argv, false);

  console.log("Using AWS profile", argv["profile"]);

  let primaryRegion = argv["primary-region"] as Region | undefined;
  let failoverRegion = argv["failover-region"] as Region | undefined;
  let deploymentTag = argv["deployment-tag"];
  let profile = argv["profile"];

  if (!(primaryRegion && deploymentTag && profile)) {
    const account = await chooseAccount(state, false, true, (auth) =>
      Boolean(
        auth.hostType == "self-hosted" &&
          auth.profile &&
          auth.primaryRegion &&
          auth.deploymentTag
      )
    );

    if (!account) {
      return exit(
        1,
        "No self-hosted installation found. Try specifying --profile, --deployment-tag, --primary-region, and --failover-region manually."
      );
    }

    primaryRegion = account.primaryRegion!;
    failoverRegion = account.failoverRegion;
    deploymentTag = account.deploymentTag!;
    profile = account.profile!;
  }

  const { confirm } = await prompt<{ confirm: boolean }>({
    type: "confirm",
    name: "confirm",
    message: chalk.bold(
      `Really destroy the EnvKey installation? This cannot be undone!`
    ),
  });

  if (!confirm) {
    return exit();
  }

  try {
    const failed = await destroyHost({
      dryRun: false,
      deploymentTag,
      profile: argv["profile"],
      primaryRegion,
      failoverRegion,
    });
    if (failed) {
      console.log("Some resources were not cleaned up.");
    }
  } catch (err) {
    return exit(1, err);
  }

  console.log("");

  // clean up any local accounts for this host
  const accounts = Object.values(
    state.orgUserAccounts
  ) as Client.ClientUserAuth[];
  for (let account of accounts) {
    if (account.deploymentTag == deploymentTag) {
      await dispatch(
        {
          type: Client.ActionType.FORGET_DEVICE,
          payload: { accountId: account.userId },
        },
        account.userId
      );
    }
  }

  await cleanupPending(state, deploymentTag);

  console.log(
    "The EnvKey host deletion has run to the end. Check the logs above for anything which failed to delete. It may take a little while for certain resources to be released."
  );
  console.log("Any RDS snapshots will need to be removed manually.");

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

const cleanupPending = async (state: Client.State, deploymentTag: string) => {
  // clean up any pending deployments for this host
  const pendingAccounts = state.pendingSelfHostedDeployments;
  for (let pending of pendingAccounts) {
    if (pending.deploymentTag == deploymentTag) {
      await dispatch({
        type: Client.ActionType.CLEAR_PENDING_SELF_HOSTED_DEPLOYMENT,
        payload: { deploymentTag },
      });
      console.log("Removed pending account", pending.uid);
    }
  }
};

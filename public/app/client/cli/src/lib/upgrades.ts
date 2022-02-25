import { Client, Api } from "@core/types";
import * as g from "@core/lib/graph";
import chalk from "chalk";
import * as semver from "semver";
import * as R from "ramda";
import { dispatch } from "./core";
import { spinner, stopSpinner } from "./spinner";
import { getPrompt } from "./console_io";

// workaround for mismatched marked module typings
import { marked as markedImport } from "marked";
const marked = require("marked") as typeof markedImport;

const SKIP_UPGRADE_DURATION = 1000 * 60 * 60 * 24; // 1 day

export const resolveUpgrades = async (
  initialState: Client.State,
  auth: Client.ClientUserAuth | Client.ClientCliAuth | undefined,
  accountId: string | undefined,
  fetchedSession = false
): Promise<Client.State> => {
  let state = initialState;

  if (!auth || auth.type != "clientUserAuth" || !accountId) {
    return state;
  }

  state = await resolveSelfHostedUpgrade(
    state,
    auth,
    accountId,
    fetchedSession
  );

  return state;
};

// if self-hosted and user has permission to upgrade, check if self-hosted upgrade available
const resolveSelfHostedUpgrade = async (
  initialState: Client.State,
  auth: Client.ClientUserAuth,
  accountId: string,
  fetchedSession = false
): Promise<Client.State> => {
  const prompt = getPrompt();
  let state = initialState;

  // don't prompt if user recently skipped upgrade
  if (
    state.skippedSelfHostedUpgradeAt &&
    Date.now() - state.skippedSelfHostedUpgradeAt < SKIP_UPGRADE_DURATION
  ) {
    return state;
  }

  if (
    !auth.deploymentTag ||
    !g.authz.hasOrgPermission(state.graph, accountId, "self_hosted_upgrade")
  ) {
    return state;
  }

  const org = g.getOrg(state.graph);
  if (!org.selfHostedVersions) {
    return state;
  }

  const currentApiVersion = org.selfHostedVersions.api;
  const currentInfraVersion = org.selfHostedVersions.infra;

  // ensure an upgrade isn't already in progress
  if (org.selfHostedUpgradeStatus) {
    return state;
  }

  const apiUpgradeAvailable = Boolean(
    state.selfHostedUpgradesAvailable.api?.latest &&
      semver.gt(state.selfHostedUpgradesAvailable.api.latest, currentApiVersion)
  );
  const infraUpgradeAvailable = Boolean(
    state.selfHostedUpgradesAvailable.infra?.latest &&
      semver.gt(
        state.selfHostedUpgradesAvailable.infra.latest,
        currentInfraVersion
      )
  );

  if (!(apiUpgradeAvailable || infraUpgradeAvailable)) {
    return state;
  }

  // before continuing to prompt for an upgrade, fetch session first
  // to make sure we have latest state / versions and re-execute this function. also re-check latest available version while we're at it.
  if (!fetchedSession) {
    spinner();
    const [sessionRes] = await Promise.all([
      dispatch(
        {
          type: Client.ActionType.GET_SESSION,
        },
        accountId
      ),
      dispatch({
        type: Client.ActionType.CHECK_SELF_HOSTED_UPGRADES_AVAILABLE,
        payload: {
          lowestCurrentApiVersion: currentApiVersion,
          lowestCurrentInfraVersion: currentInfraVersion,
        },
      }),
    ]);

    stopSpinner();

    if (!sessionRes.success) {
      return sessionRes.state;
    }

    return resolveSelfHostedUpgrade(sessionRes.state, auth, accountId, true);
  }

  console.log(
    `\nAn ${chalk.bold(
      "upgrade is available"
    )} for your Self-Hosted EnvKey installation.`
  );

  if (apiUpgradeAvailable) {
    console.log(
      `\nCurrent Api Version: ${chalk.bold(
        currentApiVersion
      )}\nLatest Api Version: ${chalk.bold(
        state.selfHostedUpgradesAvailable.api!.latest
      )}`
    );
  }

  if (infraUpgradeAvailable) {
    console.log(
      `\nCurrent Infrastructure Version: ${chalk.bold(
        currentInfraVersion
      )}\nLatest Infrastructure Version: ${chalk.bold(
        state.selfHostedUpgradesAvailable.infra!.latest
      )}`
    );
  }

  console.log(
    `\nUpgrades run in the background on your AWS host and ${chalk.bold(
      "don't cause downtime"
    )}. They normally take a few minutes.\n`
  );

  let answer: "upgrade" | "skip_for_now" | "notes" | undefined;

  while (!answer || answer == "notes") {
    ({ answer } = await prompt<{
      answer: "upgrade" | "skip_for_now" | "notes";
    }>({
      type: "select",
      name: "answer",
      message: "Upgrade now?",
      required: true,
      choices: [
        {
          name: "upgrade",
          message: `${chalk.bold("Yes")}, start the upgrade.`,
        },
        ...(answer == "notes"
          ? []
          : [
              {
                name: "notes",
                message: `${chalk.bold(
                  "Show release notes"
                )}, then ask me again.`,
              },
            ]),
        {
          name: "skip_for_now",
          message: `${chalk.bold("No")}, skip for now.`,
        },
      ],
    }));

    if (answer == "notes") {
      showReleaseNotes(
        state,
        currentApiVersion,
        apiUpgradeAvailable
          ? state.selfHostedUpgradesAvailable.api!.latest
          : undefined,
        currentInfraVersion,
        infraUpgradeAvailable
          ? state.selfHostedUpgradesAvailable.infra!.latest
          : undefined
      );
    }
  }

  if (answer == "skip_for_now") {
    const res = await dispatch({
      type: Client.ActionType.SKIP_SELF_HOSTED_UPGRADE_FOR_NOW,
    });
    state = res.state;
  }

  if (answer == "upgrade") {
    spinner();

    const res = await dispatch({
      type: Api.ActionType.UPGRADE_SELF_HOSTED,
      payload: {
        apiVersionNumber:
          state.selfHostedUpgradesAvailable.api?.latest ?? currentApiVersion,
        infraVersionNumber: state.selfHostedUpgradesAvailable.infra?.latest,
      },
    });

    stopSpinner();

    if (!res.success) {
      console.log(
        chalk.red("There was a problem starting the upgrade. Error:")
      );
      console.log((res.resultAction as any).payload);
    }

    console.log(
      `\n${chalk.bold(
        "The upgrade is now in progress."
      )} You'll get an email when it's complete.\n`
    );

    state = res.state;
  }

  console.log("--------\n");

  return state;
};

const showReleaseNotes = (
  state: Client.State,
  currentApiVersion: string,
  apiVersionAvailable: string | undefined,
  currentInfraVersion: string,
  infraVersionAvailable: string | undefined
) => {
  console.log("");
  for (let [current, available, key, name] of [
    <const>[currentApiVersion, apiVersionAvailable, "api", "Api"],
    <const>[
      currentInfraVersion,
      infraVersionAvailable,
      "infra",
      "Infrastructure",
    ],
  ]) {
    if (available) {
      console.log(chalk.underline(chalk.bold(`${name} Release Notes`)));

      R.toPairs(state.selfHostedUpgradesAvailable[key]!.releaseNotes)
        .filter(([version]) => semver.gt(version, current))
        .sort(([v1], [v2]) => semver.rcompare(v1, v2))
        .forEach(([version, notes], i) => {
          console.log(
            `${chalk.bold(version)}:\n${marked(notes).replace(/\n+$/, "")}\n`
          );
        });
    }
  }
};

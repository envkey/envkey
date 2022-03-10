import { Client } from "@core/types";
import { log } from "@core/lib/utils/logger";
import { dispatch } from "./handler";
import * as g from "@core/lib/graph";
import * as semver from "semver";
import { version } from "../package.json";
import {
  queuePersistState,
  processPersistStateQueue,
} from "@core/lib/client_store";

const CHECK_UPGRADES_INTERVAL = 1000 * 60 * 10; // 10 minutes

let checkUpgradesTimeout: NodeJS.Timeout | undefined;

export const checkUpgradesAvailableLoop = async (
  store: Client.ReduxStore,
  localSocketUpdate: () => void
) => {
  let procState = store.getState();
  if (procState.locked) {
    return;
  }

  // log("Checking for self-hosted API upgrades...");

  try {
    await checkSelfHostedUpgradesAvailable(store, localSocketUpdate);
  } catch (err) {
    log("Error checking self-hosted upgrades available:", { err });
  }

  checkUpgradesTimeout = setTimeout(
    () => checkUpgradesAvailableLoop(store, localSocketUpdate),
    CHECK_UPGRADES_INTERVAL
  );
};

export const clearUpgradesLoop = () => {
  if (checkUpgradesTimeout) {
    clearTimeout(checkUpgradesTimeout);
  }
};

const checkSelfHostedUpgradesAvailable = async (
  store: Client.ReduxStore,
  localSocketUpdate: () => void
) => {
  let procState = store.getState();
  let canUpgradeAny = false;
  let lowestCurrentApiVersion: string | undefined;
  let lowestCurrentInfraVersion: string | undefined;

  for (let account of Object.values(procState.orgUserAccounts)) {
    if (!account || !account.token || !account.deploymentTag) {
      continue;
    }

    const accountState = procState.accountStates[account.userId];
    if (!accountState || !accountState.graph) {
      continue;
    }

    const org = g.getOrg(accountState.graph, false);
    if (!org || org.selfHostedUpgradeStatus) {
      continue;
    }

    if (
      !g.authz.hasOrgPermission(
        accountState.graph,
        account.userId,
        "self_hosted_upgrade"
      )
    ) {
      continue;
    }

    canUpgradeAny = true;

    if (org.selfHostedVersions) {
      if (
        !lowestCurrentApiVersion ||
        semver.lt(org.selfHostedVersions.api, lowestCurrentApiVersion)
      ) {
        lowestCurrentApiVersion = org.selfHostedVersions.api;
      }

      if (
        !lowestCurrentInfraVersion ||
        semver.lt(org.selfHostedVersions.infra, lowestCurrentInfraVersion)
      ) {
        lowestCurrentInfraVersion = org.selfHostedVersions.infra;
      }
    }
  }
  if (canUpgradeAny && lowestCurrentApiVersion && lowestCurrentInfraVersion) {
    log("Checking for self-hosted upgrades");
    await dispatch(
      {
        type: Client.ActionType.CHECK_SELF_HOSTED_UPGRADES_AVAILABLE,
        payload: {
          lowestCurrentApiVersion,
          lowestCurrentInfraVersion,
        },
      },
      {
        client: {
          clientName: "core",
          clientVersion: version,
        },
        clientId: "core",
        accountIdOrCliKey: undefined,
      }
    );
    procState = store.getState();
    queuePersistState(procState, true);
    await processPersistStateQueue();
    localSocketUpdate();
  } else {
    // log("Not permitted to upgrade any current self-hosted orgs.");
  }
};

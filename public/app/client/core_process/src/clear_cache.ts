import { getState } from "./lib/state";
import { Client, Model } from "@core/types";
import { log } from "@core/lib/utils/logger";
import { version } from "../../cli/package.json";
import { dispatch } from "./handler";
import { getPendingUpdateDetails } from "@core/lib/client";
import { parseUserEncryptedKeyOrBlobComposite } from "@core/lib/blob";

const CLEAR_CACHE_INTERVAL = 1000 * 60 * 1; // 1 minute
const IDLE_ACCOUNT_CACHE_EXPIRATION = 1000 * 60 * 30; // 30 minutes

let clearCacheTimeout: NodeJS.Timeout | undefined;

export const clearCacheLoop = async (
  store: Client.ReduxStore,
  onClear: () => void
) => {
  let procState = store.getState();
  if (procState.locked) {
    return;
  }

  try {
    await clearExpiredCacheObjects(store, onClear);
  } catch (err) {
    log("Error clearing expired cached envs and changesets:", { err });
  }

  clearCacheTimeout = setTimeout(
    () => clearCacheLoop(store, onClear),
    CLEAR_CACHE_INTERVAL
  );
};

export const clearCacheLoopTimeout = () => {
  if (clearCacheTimeout) {
    clearTimeout(clearCacheTimeout);
  }
};

const clearExpiredCacheObjects = async (
  store: Client.ReduxStore,
  onClear: () => void
) => {
  let procState = store.getState();

  for (let account of Object.values(procState.orgUserAccounts)) {
    if (!account || !account.token) {
      continue;
    }

    const state = getState(store, {
      clientId: "core",
      accountIdOrCliKey: account.userId,
    });

    if (!state || !state.accountLastActiveAt) {
      continue;
    }

    const idleTime = Date.now() - state.accountLastActiveAt;

    if (idleTime < IDLE_ACCOUNT_CACHE_EXPIRATION) {
      continue;
    }

    let shouldClear = false;
    const pendingUpdate = getPendingUpdateDetails(state);
    const environmentIds = new Set<string>();

    for (let composite in state.envs) {
      const { environmentId } = parseUserEncryptedKeyOrBlobComposite(composite);
      environmentIds.add(environmentId);
    }

    for (let environmentId in state.changesets) {
      environmentIds.add(environmentId);
    }

    for (let environmentId of environmentIds) {
      let envParentId: string;
      const environment = state.graph[environmentId] as
        | Model.Environment
        | undefined;
      if (environment) {
        envParentId = environment.envParentId;
      } else {
        [envParentId] = environmentId.split("|");
      }

      if (
        !pendingUpdate.apps.has(envParentId) &&
        !pendingUpdate.blocks.has(envParentId)
      ) {
        shouldClear = true;
        break;
      }
    }

    if (!shouldClear) {
      continue;
    }

    log(
      `Clearing cached envs and changesets (without pending env updates) for account: ${account.userId}`
    );
    await dispatch(
      {
        type: Client.ActionType.CLEAR_CACHED,
      },
      {
        client: {
          clientName: "core",
          clientVersion: version,
        },
        clientId: "core",
        accountIdOrCliKey: account.userId,
      }
    );
    onClear();
  }
};

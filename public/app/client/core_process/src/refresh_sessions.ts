import { dispatch } from "./handler";
import { Client } from "@core/types";
import * as R from "ramda";
import { getContext } from "./default_context";
import { log } from "@core/lib/utils/logger";
import { wait } from "@core/lib/utils/wait";

/*
  This handles keeping signed in sessions up to date when the process is suspended for whatever reason (like os going to sleep), preventing sockets from receiving updates.
*/

const CHECK_SUSPENDED_INTERVAL = 1000 * 60; // 60 seconds
const SUSPENSION_MIN_DELTA = 5000;
const REFRESH_MAX_JITTER = 1000 * 3; // 3 seconds

let lastSuspendedCheckAt: number | undefined;

let checkSuspendedTimeout: NodeJS.Timeout | undefined;

export const checkSuspendedLoop = async (
  store: Client.ReduxStore,
  localSocketUpdate: Client.LocalSocketUpdateFn
) => {
  const state = store.getState();

  if (state.locked) {
    lastSuspendedCheckAt = undefined;
    return;
  }

  const now = Date.now();
  if (typeof lastSuspendedCheckAt == "number") {
    const delta = now - lastSuspendedCheckAt;
    const max = CHECK_SUSPENDED_INTERVAL + SUSPENSION_MIN_DELTA;
    if (delta > max) {
      log(
        `Process was suspended for ${delta}ms. Refreshing signed in sessions...`
      );
      await refreshSessions(state, localSocketUpdate);
    }
  }

  lastSuspendedCheckAt = now;

  checkSuspendedTimeout = setTimeout(
    () => checkSuspendedLoop(store, localSocketUpdate),
    CHECK_SUSPENDED_INTERVAL
  );
};

export const clearCheckSuspendedLoop = () => {
  if (checkSuspendedTimeout) {
    clearTimeout(checkSuspendedTimeout);
  }
};

export const refreshSessions = async (
  state: Client.ProcState,
  localSocketUpdate: Client.LocalSocketUpdateFn,
  accountIdsArg?: string[],
  initialFetch?: boolean
) => {
  let accountIds = accountIdsArg;
  if (!accountIds) {
    const accounts = Object.values(
      state.orgUserAccounts
    ) as Client.ClientUserAuth[];
    accountIds = accounts
      .filter((account) => account.token && account.privkey)
      .map(R.prop("userId"));
  }

  const firstToFetch = R.intersection(
    accountIds,
    R.uniq(
      [state.uiLastSelectedAccountId, state.defaultAccountId].filter(
        (id): id is string => Boolean(id)
      )
    )
  );

  let restToFetch = R.without(firstToFetch, accountIds);
  restToFetch = R.sortBy(
    (id) => state.orgUserAccounts[id]?.lastAuthAt ?? Infinity,
    restToFetch
  );

  log("Refreshing signed in sessions.", {
    firstToFetch,
    restToFetch,
  });

  const getFetchFn =
    (skipJitter?: boolean) => (accountId: string, i: number) => {
      const baseWait = i * 50;
      const toWait = skipJitter
        ? baseWait
        : baseWait + Math.random() * REFRESH_MAX_JITTER;

      return wait(toWait).then(() => {
        dispatch(
          {
            type: Client.ActionType.GET_SESSION,
          },
          getContext(accountId)
        ).finally(() => localSocketUpdate({ type: "update", accountId }));
      });
    };

  if (firstToFetch.length > 0) {
    await Promise.all(firstToFetch.map(getFetchFn(initialFetch)));
  }

  if (restToFetch.length > 0) {
    await Promise.all(restToFetch.map(getFetchFn()));
  }
};

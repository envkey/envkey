import { dispatch } from "./handler";
import { Client } from "@core/types";
import * as R from "ramda";
import { getContext } from "./default_context";
import { log } from "@core/lib/utils/logger";
import { wait } from "@core/lib/utils/wait";

const REFRESH_MAX_JITTER = 1000 * 3; // 3 seconds

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

  const getFetchFn: (
    skipJitter?: boolean
  ) => (accountId: string, i: number) => Promise<any> =
    (skipJitter) => (accountId, i) => {
      const baseWait = i * 50;
      const toWait = skipJitter
        ? baseWait
        : baseWait + Math.random() * REFRESH_MAX_JITTER;

      return wait(toWait).then(() => {
        dispatch(
          {
            type: Client.ActionType.REFRESH_SESSION,
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

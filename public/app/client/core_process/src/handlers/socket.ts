import { clientAction } from "../handler";
import { Client } from "@core/types";
import { dispatch } from "../handler";
import { version as cliVersion } from "../../../cli/package.json";
import { log } from "@core/lib/utils/logger";

const FETCH_MIN_DELAY = 400, // gentle throttling of graph refresh requests
  FETCH_JITTER_MAX = 200,
  fetchTimeouts: Record<string, ReturnType<typeof setTimeout>> = {};

clientAction<Client.Action.ClientActions["ReceivedOrgSocketMessage"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.RECEIVED_ORG_SOCKET_MESSAGE,
  handler: async (
    state,
    { payload: { account, message } },
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    if (fetchTimeouts[account.userId]) {
      clearTimeout(fetchTimeouts[account.userId]);
      delete fetchTimeouts[account.userId];
    }

    // add some jitter so we don't slam the server with fetch requests
    // at the exact same time when many clients are connected
    const jitter = Math.round(Math.random() * FETCH_JITTER_MAX);

    log(
      `Fetching updated graph for ${account.orgName} with delay + jitter of ${
        FETCH_MIN_DELAY + jitter
      }ms...`
    );

    return new Promise((resolve) => {
      fetchTimeouts[account.userId] = setTimeout(async () => {
        delete fetchTimeouts[account.userId];

        const res = await dispatch(
          {
            type: Client.ActionType.GET_SESSION,
          },
          {
            client: {
              clientName: "core",
              clientVersion: cliVersion,
            },
            clientId: "core",
            accountIdOrCliKey: account.userId,
          }
        );

        if (res.success) {
          log("Socket-triggered GET_SESSION success: " + account.email);

          resolve(dispatchSuccess(null, context));
        } else {
          log(
            "Socket-triggered GET_SESSION *failed*: " + account.email,
            (res.resultAction as any)?.payload
          );

          resolve(dispatchFailure((res.resultAction as any)?.payload, context));
        }
      }, FETCH_MIN_DELAY + jitter);
    });
  },
});

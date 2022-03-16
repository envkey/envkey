import { refreshSessions } from "./refresh_sessions";
import { log } from "@core/lib/utils/logger";
import WebSocket from "isomorphic-ws";
import { Client, Api } from "@core/types";
import { getApiAuthParams } from "@core/lib/client";
import { dispatch } from "./handler";
import { getContext } from "./default_context";
import { wait } from "@core/lib/utils/wait";
import * as R from "ramda";

const CONNECTION_TIMEOUT = 5000,
  CONNECT_MAX_JITTER = 1000 * 3, // 3 seconds
  RETRY_BASE_DELAY = 5000,
  PING_INTERVAL = 20000,
  PING_TIMEOUT = 10000,
  sockets: Record<string, WebSocket> = {},
  retryTimeouts: Record<string, ReturnType<typeof setTimeout>> = {},
  receivedPong: Record<string, boolean> = {},
  storeByUserId: Record<string, Client.ReduxStore> = {};

let socketPingLoopTimeout: NodeJS.Timeout | undefined;

let _localSocketUpdate: () => void;

export const resolveOrgSockets = async (
    store: Client.ReduxStore,
    localSocketUpdate: () => void,
    skipJitter?: true
  ) => {
    _localSocketUpdate = localSocketUpdate;
    const state = store.getState();
    if (state.locked || state.networkUnreachable) {
      closeAllOrgSockets();
      return;
    }

    const promises: Promise<any>[] = [];

    for (let account of Object.values(state.orgUserAccounts)) {
      if (!account) {
        continue;
      }
      if (
        account.token &&
        !sockets[account.userId] &&
        !retryTimeouts[account.userId]
      ) {
        promises.push(connectSocket(store, account.userId, -1, skipJitter));
      } else if (!account.token) {
        clearSocket(account.userId);
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }
  },
  closeAllOrgSockets = () => {
    for (let userId in sockets) {
      clearSocket(userId);
    }
  },
  clearSocket = (userId: string, silent = false) => {
    delete storeByUserId[userId];
    const socket = sockets[userId];
    if (socket) {
      if (!silent) {
        log("Closing web socket:", { userId });
      }
      try {
        socket.removeAllListeners();
        socket.close();
      } catch (err) {
        log("Error clearing socket: ", { err, userId });
      }

      delete sockets[userId];
    }
    clearRetryTimeout(userId);
  },
  stopSocketPingLoop = () => {
    if (socketPingLoopTimeout) {
      clearTimeout(socketPingLoopTimeout);
      socketPingLoopTimeout = undefined;
    }
  },
  socketPingLoop = () => {
    R.toPairs(sockets).forEach(([userId, socket]) => {
      if (socket.readyState != WebSocket.OPEN) {
        return;
      }
      socket.ping((err: Error | null) => {
        if (err) {
          log(`Socket error on ping. closing...`, { err, userId });
          clearSocket(userId);
        } else {
          receivedPong[userId] = false;
          setTimeout(() => {
            if (!receivedPong[userId]) {
              log(`Socket ping timed out. closing...`, { userId });
              const store = storeByUserId[userId];
              socket.close();
              if (store) {
                refreshSessions(store.getState(), _localSocketUpdate, [userId]);
              }
            }
          }, PING_TIMEOUT);
        }
      });
    });

    socketPingLoopTimeout = setTimeout(socketPingLoop, PING_INTERVAL);
  };

const connectSocket = async (
    store: Client.ReduxStore,
    userId: string,
    reconnectAttempt = -1,
    skipJitter?: true
  ) => {
    storeByUserId[userId] = store;
    const procState = store.getState();
    const account = procState.orgUserAccounts[userId];

    if (!account || !account.token) {
      clearSocket(userId);
      return;
    }

    const endpoint = "wss://" + account.hostUrl;

    if (!skipJitter) {
      await wait(CONNECT_MAX_JITTER);
    }

    const socket = new WebSocket(endpoint, {
      headers: {
        authorization: JSON.stringify(getApiAuthParams(account)),
      },
      timeout: CONNECTION_TIMEOUT,
    });

    socket.on("pong", () => {
      receivedPong[userId] = true;
    });

    // getReconnectAttempt allows event listeners, defined below, to access the
    // the value reconnectAttempt in this scope. This value is managed and reset
    // inside connectSocket and not in any of the listeners, but it needs to be
    // available at its current value to those listeners
    const getReconnectAttempt = () => {
      reconnectAttempt++;
      return reconnectAttempt;
    };

    const logSocketData = {
      socketUrl: socket.url,
      org: `${account.orgName}|${account.orgId}`,
      email: account.email,
      userId: account.userId,
    };
    // This is a bit too spammy... uncomment for debugging purposes
    // log("Connecting to Api socket server", {
    //   reconnectAttempt,
    //   ...logSocketData,
    // });

    sockets[account.userId] = socket;
    clearRetryTimeout(account.userId);

    socket.addEventListener("open", () => {
      log("Socket connected", { reconnectAttempt, ...logSocketData });

      if (reconnectAttempt > -1) {
        refreshSessions(store.getState(), _localSocketUpdate, [account.userId]);
      }

      reconnectAttempt = -1;
    });

    socket.addEventListener("message", getOnSocketUpdate(account));
    socket.addEventListener(
      "close",
      getOnSocketClosed("close", store, account, getReconnectAttempt)
    );
    socket.addEventListener(
      "error",
      getOnSocketClosed("error", store, account, getReconnectAttempt)
    );
  },
  getOnSocketUpdate =
    (account: Client.ClientUserAuth) => (evt: WebSocket.MessageEvent) => {
      log("Received update message for org:", {
        fromSocketUrl: evt.target.url,
        org: account.orgName,
        email: account.email,
        userId: account.userId,
      });
      const message = JSON.parse(
        evt.data.toString()
      ) as Api.OrgSocketUpdateMessage;
      dispatch(
        {
          type: Client.ActionType.RECEIVED_ORG_SOCKET_MESSAGE,
          payload: { message, account },
        },
        getContext(account.userId)
      ).then(() => {
        if (_localSocketUpdate) {
          _localSocketUpdate();
        }
      });
    },
  clearRetryTimeout = (userId: string) => {
    if (retryTimeouts[userId]) {
      clearTimeout(retryTimeouts[userId]);
      delete retryTimeouts[userId];
    }
  },
  getOnSocketClosed =
    (
      type: "close" | "error",
      store: Client.ReduxStore,
      account: Client.ClientUserAuth,
      getReconnectAttempt: () => number
    ) =>
    (evt: WebSocket.CloseEvent | WebSocket.ErrorEvent) => {
      const reconnectAttempt = getReconnectAttempt();

      const logAccountData = {
        org: account.orgName,
        email: account.email,
        userId: account.userId,
      };

      if (reconnectAttempt == 0) {
        const logSocketData = {
          ...logAccountData,
          message: "message" in evt ? evt.message : undefined,
        };
        log(`Socket received ${type} event`, logSocketData);
      }

      clearSocket(account.userId, reconnectAttempt > 0);

      const state = store.getState();
      if (!state.accountStates[account.userId]?.fetchSessionError) {
        refreshSessions(state, _localSocketUpdate, [account.userId]);
      }

      if ("message" in evt && evt.message.endsWith("401")) {
        // don't retry when response is unauthorized
        log("Socket connection unauthorized. Won't retry.", logAccountData);
        refreshSessions(state, _localSocketUpdate, [account.userId]);
        return;
      } else if (reconnectAttempt == 0) {
        log(
          `Will retry connection every ${RETRY_BASE_DELAY}ms + jitter`,
          logAccountData
        );
      }

      retryTimeouts[account.userId] = setTimeout(
        () => connectSocket(store, account.userId, reconnectAttempt),
        RETRY_BASE_DELAY
      );
    };

import { verifyV1Upgrade } from "./../../../core/src/lib/v1_upgrade";
import express, { NextFunction, Request, Response, Express } from "express";
import { Server } from "http";
import asyncHandler from "express-async-handler";
import WebSocket from "ws";
import { getDefaultStore, clearStore } from "./redux_store";
import { dispatch, getActionParams } from "./handler";
import { getState } from "./lib/state";
import { Client, Crypto } from "@core/types";
import fkill from "fkill";
import { isAlive, stop } from "@core/lib/core_proc";
import {
  hasDeviceKey,
  initDeviceKey,
  initKeyStore,
  isLocked,
  lock,
  unlock,
  getDeviceKey,
} from "@core/lib/client_store/key_store";
import { decryptSymmetricWithKey } from "@core/lib/crypto/proxy";
import { encodeUTF8, decodeBase64 } from "tweetnacl-util";
import {
  queuePersistState,
  processPersistStateQueue,
  getPersistedState,
  enableLogging as clientStoreEnableLogging,
} from "@core/lib/client_store";
import { log, logStderr, initFileLogger } from "@core/lib/utils/logger";
import {
  resolveOrgSockets,
  closeAllOrgSockets,
  socketPingLoop,
  stopSocketPingLoop,
} from "./org_sockets";
import { checkUpgradesAvailableLoop, clearUpgradesLoop } from "./upgrades";
import { refreshSessions } from "./refresh_sessions";
// import { clearCacheLoop, clearCacheLoopTimeout } from "./clear_cache";
import {
  killIfIdleLoop,
  clearKillIfIdleTimeout,
  updateLastActiveAt as idleKillUpdateLastActiveAt,
} from "./idle_kill";
import { getContext } from "./default_context";
import * as R from "ramda";
import { createPatch, Patch } from "rfc6902";
import { version as cliVersion } from "../../cli/package.json";
import { pick } from "@core/lib/utils/pick";
import { openExternalUrl } from "./lib/open";
import cluster from "cluster";
import * as procStatusWorker from "./proc_status_worker";

let v1UpgradeStatus: Client.State["v1UpgradeStatus"] | undefined;
let v1UpgradeInviteTokensById:
  | Record<
      string,
      {
        id: string;
        identityHash: string;
        encryptionKey: string;
      }
    >
  | undefined;

export const start = async (
  port = 19047,
  wsport = 19048,
  statusPort = 19049
) => {
  log("Starting EnvKey core process...", {
    cliVersion,
    isMaster: cluster.isMaster,
    isWorker: cluster.isWorker,
  });
  cluster.isMaster
    ? initMaster(port, wsport, statusPort)
    : initWorker(statusPort);
};

let reduxStore: Client.ReduxStore | undefined,
  lockoutTimeout: ReturnType<typeof setTimeout> | undefined,
  heartbeatTimeout: ReturnType<typeof setTimeout> | undefined,
  lastProcHeartbeatAt = Date.now(),
  wss: WebSocket.Server | undefined;

const initMaster = async (port: number, wsport: number, statusPort: number) => {
    initFileLogger("core");

    await stop();
    await Promise.all([
      fkill(`:${port}`, { force: true }).catch(() => {}),
      fkill(`:${wsport}`, { force: true }).catch(() => {}),
      fkill(`:${statusPort}`, { force: true }).catch(() => {}),
    ]);

    // windowsHide isn't present on ClusterSettings type, but it's supported
    cluster.setupMaster({ windowsHide: true } as any);

    procStatusWorker.setWorker(cluster.fork());
    await procStatusWorker.waitForStart();
    procStatusWorker.handleWorkerToMainMessage(workerToMainMessageHandler);

    await mainServer(port, wsport);
  },
  initWorker = (statusPort: number) => {
    initFileLogger("core");
    statusServer(statusPort);
    handleMainToWorkerMessage();
    procStatusWorker.sendWorkerToMainMessage({ type: "workerStarted" });
  },
  statusServer = async (port: number) => {
    const app = express();
    addAliveRoute(app);
    addV1AliveRoute(app);
    addUpgradeStatusRoute(app);
    app.listen(port, () => {
      log(`Status-only server listening on port ${port}...`);
    });
  },
  mainServer = async (port: number, wsport: number) => {
    await init();

    const app = express();
    startSocketServer(port, wsport);

    app.use(express.json({ limit: "50mb" }));

    // Adding alive route to main server too for legacy alive check
    addAliveRoute(app);

    app.use(loggerMiddleware);

    addStopRoute(app);

    app.use([authMiddleware, lockoutMiddleware]);

    addStateRoute(app);
    addActionRoute(app);

    const serverRunningMsg = `EnvKey local server is running. Server port: ${port}. Websocket port: ${wsport}.`;

    const server = await new Promise<Server>((resolve) => {
      const s = app
        .listen(port, () => {
          log(serverRunningMsg);
          resolve(s);
        })
        .on("error", (err) => {
          log("Error starting server:", { err });
          throw err;
        });
    });

    handleMainProcessErrorOrExit(app, server);
  },
  clientAlive = () => {
    idleKillUpdateLastActiveAt();
  },
  workerToMainMessageHandler = async (
    message: Client.WorkerToMainProcessMessage
  ) => {
    // log("handleWorkerToMainMessage", { type: message.type });

    // handled by proc_status_worker
    if (message.type == "workerStarted") {
      return;
    }

    if (message.type == "clientAlive") {
      clientAlive();
    } else if (message.type == "v1Alive") {
      await dispatch({ type: Client.ActionType.V1_CLIENT_ALIVE }, getContext());
    } else if (message.type == "v1FinishedUpgrade") {
      if (!reduxStore) {
        throw new Error("reduxStore not initialized");
      }
      const procState = reduxStore.getState();

      await dispatch(
        {
          type: Client.ActionType.RESET_V1_UPGRADE,
          payload: {},
        },
        { ...getContext(procState.v1UpgradeAccountId), localSocketUpdate }
      );
    } else if (message.type == "refreshSession") {
      if (!reduxStore) {
        throw new Error("reduxStore not initialized");
      }

      const procState = reduxStore.getState();

      if (procState.locked) {
        return;
      }

      let shouldFetch = true;

      if (message.abortIfError && message.userId) {
        const accountState = procState.accountStates[message.userId];
        if (accountState && accountState.fetchSessionError) {
          shouldFetch = false;
        }
      }

      if (shouldFetch) {
        await refreshSessions(
          procState,
          localSocketUpdate,
          message.userId ? [message.userId] : undefined
        );
      }
    } else if (message.type == "accountUpdated") {
      dispatch(
        {
          type: Client.ActionType.RECEIVED_ORG_SOCKET_MESSAGE,
          payload: { message: message.message, account: message.account },
        },
        getContext(message.account.userId)
      ).then(() => {
        localSocketUpdate({
          type: "update",
          accountId: message.account.userId,
        });
      });
    }
  },
  handleMainToWorkerMessage = () => {
    process.on("message", (message: Client.MainToWorkerProcessMessage) => {
      // log("handleMainToWorkerMessage", {
      //   message,
      // });
      if (message.type == "v1UpgradeStatus") {
        v1UpgradeStatus = message.v1UpgradeStatus;

        if (message.v1UpgradeStatus == "finished") {
          if (!message.generatedInvites) {
            return;
          }

          v1UpgradeInviteTokensById = R.indexBy(
            R.prop("id"),
            message.generatedInvites.map(
              ({ user, identityHash, encryptionKey }) => ({
                id: user.importId!,
                identityHash,
                encryptionKey,
              })
            )
          );
        }
      } else if (message.type == "resolveOrgSockets") {
        resolveOrgSockets(message.state, message.skipJitter);
      }
    });
  },
  addAliveRoute = (app: Express) => {
    app.get("/alive", (req, res) => {
      if (cluster.isWorker) {
        procStatusWorker.sendWorkerToMainMessage({ type: "clientAlive" });
      } else {
        clientAlive();
      }

      res.status(200).json({ cliVersion });
    });
  },
  addV1AliveRoute = (app: Express) => {
    app.get("/v1-alive", (req, res) => {
      res.status(200).json({ cliVersion });

      procStatusWorker.sendWorkerToMainMessage({ type: "v1Alive" });
    });
  },
  addUpgradeStatusRoute = (app: Express) => {
    app.get(
      "/v1-upgrade-status",
      asyncHandler(async (req, res) => {
        procStatusWorker.sendWorkerToMainMessage({ type: "v1Alive" });

        if (v1UpgradeStatus == "finished") {
          if (v1UpgradeInviteTokensById) {
            // this is the only case where sensitive data is returned
            // (when doing initial upgrade, not accepting an upgrade invite)
            // so we'll only check auth here
            if (!req.headers["authorization"]) {
              res.status(401).send("Unauthorized");
              return;
            }
            let auth: { ts: number; signature: string };
            try {
              auth = JSON.parse(req.headers["authorization"] as string);
            } catch (err) {
              res.status(401).send("Unauthorized");
              return;
            }
            const verifyRes = verifyV1Upgrade(auth, Date.now());
            if (verifyRes !== true) {
              res.status(401).send(verifyRes);
            }
          }

          procStatusWorker.sendWorkerToMainMessage({
            type: "v1FinishedUpgrade",
          });

          res.status(200).json({
            upgradeStatus: "finished",
            inviteTokensById: v1UpgradeInviteTokensById,
          });

          v1UpgradeInviteTokensById = undefined;
          v1UpgradeStatus = undefined;
        } else if (v1UpgradeStatus == "canceled") {
          procStatusWorker.sendWorkerToMainMessage({
            type: "v1FinishedUpgrade",
          });

          res.status(200).json({
            upgradeStatus: "canceled",
          });

          v1UpgradeInviteTokensById = undefined;
          v1UpgradeStatus = undefined;
        } else {
          res.status(200).json({
            upgradeStatus: v1UpgradeStatus,
          });
        }
      })
    );
  },
  addStopRoute = (app: Express) => {
    app.get("/stop", (req, res) => {
      log("Received /stop request.");
      res.status(200).send("Stopping local server...");
      process.kill(process.pid, "SIGTERM"); // this is caught and handled for a proper shutdown
    });
  },
  addStateRoute = (app: Express) => {
    app.get(
      "/state",
      asyncHandler(async (req, res) => {
        clientAlive();

        if (isLocked()) {
          log("Responding with LOCKED state.");
          res.status(200).json(Client.lockedState);
          return;
        }

        if (!reduxStore) {
          const msg = "Error: Redux store is not defined.";
          log(msg);
          res.status(500).json({ error: msg });
          return;
        }

        const accountIdOrCliKey = req.query.accountIdOrCliKey as
            | string
            | undefined,
          clientId = req.query.clientId as string | undefined;

        if (!clientId) {
          const msg = "Error: Missing clientId query parameter";
          log(msg);
          res.status(400).json({ error: msg });
          return;
        }

        const state = getState(reduxStore, {
          accountIdOrCliKey,
          clientId,
        });

        const keysParam = req.query.keys as
          | string
          | (keyof Client.State)[]
          | undefined;
        const keys = (
          typeof keysParam == "string" ? [keysParam] : keysParam
        ) as (keyof Client.State)[] | undefined;

        // to update lastActiveAt
        await dispatch(
          {
            type: Client.ActionType.FETCHED_CLIENT_STATE,
          },
          getContext()
        );

        resolveLockoutTimer();

        res.status(200).json(keys ? pick(keys, state) : state);
      })
    );
  },
  addActionRoute = (app: Express) => {
    app.post(
      "/action",
      asyncHandler(async (req, res) => {
        const action = req.body.action as
            | Client.Action.ClientAction
            | undefined,
          context = req.body.context as Client.Context | undefined,
          returnFullState = req.body.returnFullState as boolean | undefined;

        if (context) {
          context.localSocketUpdate = localSocketUpdate;
        }

        if (!action || !context) {
          const msg =
            "Bad request. Requires 'action' and 'context' in post body.";
          log(msg, req.body);
          res.status(400).json({ error: msg });
          return;
        }

        log("Received", { action: action.type });
        clientAlive();

        // shortcut to speed this up
        if (action.type == Client.ActionType.OPEN_URL) {
          openExternalUrl(action.payload.url);
          res.status(301).json({ success: true });
          return;
        }

        let unlocked = false;
        if (isLocked()) {
          if (action.type == Client.ActionType.UNLOCK_DEVICE) {
            try {
              await unlockDevice(action.payload.passphrase);
              unlocked = true;
            } catch (err) {
              log("Error unlocking device:", { err });
              res.status(403).json({ error: err.message });
              return;
            }
          } else if (action.type == Client.ActionType.LOAD_RECOVERY_KEY) {
            try {
              log(
                "Re-initializing locked device before handling LOAD_RECOVERY_KEY"
              );
              await init(true);
              unlocked = true;
            } catch (err) {
              log(
                "Error resetting device key for LOAD_RECOVERY_KEY with locked device:",
                { err }
              );
              res.status(500).json({ error: err.message });
              return;
            }
          } else if (action.type == Client.ActionType.INIT_DEVICE) {
            try {
              log("Re-initializing locked device");
              await init(true);
              unlocked = true;
            } catch (err) {
              log("Error resetting device key ", { err });
              res.status(500).json({ error: err.message });
              return;
            }
          } else {
            const msg =
              "Error: EnvKey is LOCKED. Can only receive UNLOCK_DEVICE, INIT_DEVICE, or LOAD_RECOVERY_KEY actions.";
            log(msg);
            res.status(403).json({ error: msg });
            return;
          }
        } else if (action.type == Client.ActionType.UNLOCK_DEVICE) {
          const msg = "Error: Device isn't locked.";
          log(msg);
          res.status(422).json({ error: msg });
          return;
        }

        if (!reduxStore) {
          const msg = "Error: Redux store is not defined.";
          log(msg);
          res.status(500).json({ error: msg });
          return;
        }

        if (action.type == Client.ActionType.LOCK_DEVICE) {
          const { requiresPassphrase } = reduxStore.getState();
          if (!requiresPassphrase) {
            const msg = "Error: Cannot lock device if no passphrase is set.";
            log(msg);
            res.status(422).json({ error: msg });
            return;
          }

          await lockDevice();
          res.status(200).json({ success: true, state: Client.lockedState });
          return;
        }

        const initialClientState = unlocked
          ? Client.lockedState
          : getState(reduxStore, context);

        const actionParams = getActionParams(action.type);
        const dispatchPromise = dispatch(action, context);

        const afterDispatchClientState = getState(reduxStore, context);

        const skipSocketUpdate =
          "skipLocalSocketUpdate" in actionParams &&
          actionParams.skipLocalSocketUpdate;

        const shouldSendSocketUpdate =
          !skipSocketUpdate &&
          (context.client.clientName == "cli" ||
            actionParams.type == "asyncClientAction" ||
            actionParams.type == "apiRequestAction");

        const shouldIncludeEnvsInDiffs =
          action.type == Client.ActionType.FETCH_ENVS ||
          action.type == Client.ActionType.COMMIT_ENVS;

        if (shouldSendSocketUpdate) {
          localSocketUpdate({
            type: "diffs",
            diffs: shouldIncludeEnvsInDiffs
              ? createPatch(initialClientState, afterDispatchClientState)
              : createPatch(
                  R.omit(["envs", "changesets"], initialClientState),
                  R.omit(["envs", "changesets"], afterDispatchClientState)
                ),
          });
        }

        const dispatchRes = await dispatchPromise;

        if (dispatchRes.success) {
          const updatedProcState = reduxStore.getState();

          // persist updated state to disk in background (don't block request for this)
          queuePersistState(updatedProcState);

          // connect to the org sockets of any new accounts that this action may have added to core state
          // (usually a no-op)
          procStatusWorker.sendMainToWorkerMessage({
            type: "resolveOrgSockets",
            state: pick(
              ["locked", "networkUnreachable", "orgUserAccounts"],
              updatedProcState
            ),
            skipJitter: true,
          });
        }

        await resolveLockoutTimer();

        const finalDiffsPreviousState =
          actionParams.type == "clientAction" || !shouldSendSocketUpdate
            ? initialClientState
            : afterDispatchClientState;

        const finalDiffs = shouldIncludeEnvsInDiffs
          ? createPatch(finalDiffsPreviousState, dispatchRes.state)
          : createPatch(
              R.omit(["envs", "changesets"], finalDiffsPreviousState),
              R.omit(["envs", "changesets"], dispatchRes.state)
            );

        if (
          !skipSocketUpdate &&
          (context.client.clientName == "cli" ||
            context.client.clientName == "v1")
        ) {
          localSocketUpdate({ type: "diffs", diffs: finalDiffs });
        }

        res.status(200).json(
          returnFullState
            ? dispatchRes
            : {
                ...R.omit(["state"], dispatchRes),
                diffs: finalDiffs,
              }
        );
      })
    );
  },
  handleMainProcessErrorOrExit = (app: Express, server: Server) => {
    // uncaught error handling
    app.use(function (
      error: Error,
      req: Request,
      res: Response,
      next: NextFunction
    ) {
      logStderr("Core Process Unhandled Error", { err: error });

      res.status(500).send({
        type: "error",
        error: true,
        errorStatus: 500,
        errorReason: error.message,
      });

      gracefulShutdown(undefined, 1);
    });

    const shutdownNetworking = () => {
      stopSocketPingLoop();
      closeAllOrgSockets();

      if (wss) {
        wss.clients.forEach((client) => {
          try {
            client.send(JSON.stringify({ type: "closing" }));
          } catch (err) {
            log("error sending 'closing' message to local socket", { err });
          }

          try {
            client.close();
          } catch (err) {}
        });
        wss.close();
      }

      server.close();
    };

    const gracefulShutdown = (onShutdown?: () => void, code?: number) => {
      log(`Shutting down gracefully...`);
      clearTimers();
      shutdownNetworking();

      if (reduxStore) {
        const procState = reduxStore.getState();
        queuePersistState(procState, true);
        log(`Persisting final state before shutdown...`);
        processPersistStateQueue().then(() => {
          log(`Finished persisting state. Shutting down.`);
          onShutdown ? onShutdown() : process.exit(code ?? 0);
        });
      } else {
        onShutdown ? onShutdown() : process.exit(code ?? 0);
      }
    };

    ["SIGINT", "SIGUSR1", "SIGUSR2", "SIGTERM", "SIGHUP"].forEach(
      (eventType) => {
        process.on(eventType, () => {
          log(`Exiting due to ${eventType}.`);
          gracefulShutdown();
        });
      }
    );

    process.on("unhandledRejection", (reason, promise) => {
      log(`Core process unhandledRejection.`, { reason });

      if (
        (reason as any)?.message?.startsWith(
          "Workerpool Worker terminated Unexpectedly"
        )
      ) {
        log(`Uncaught workerpool error.`);
        gracefulShutdown(undefined, 1);
      }
    });

    process.on("uncaughtException", (err) => {
      log(`Core process uncaughtException.`, { err });
      gracefulShutdown(undefined, 1);
    });
  },
  initReduxStore = async (forceReset?: true) => {
    // if we haven't established a root device key OR we're forcing a reset, init/re-init device key
    if (forceReset || !(await hasDeviceKey())) {
      await initDeviceKey();

      reduxStore = getDefaultStore();

      await dispatch(
        {
          type: Client.ActionType.INIT_DEVICE,
        },
        getContext(undefined, reduxStore)
      );

      queuePersistState(reduxStore.getState());
      await processPersistStateQueue();
    } else if (!isLocked()) {
      reduxStore = getDefaultStore();
      const persisted = await getPersistedState();
      if (persisted) {
        await dispatch(
          {
            type: Client.ActionType.MERGE_PERSISTED,
            payload: persisted,
          },
          getContext(undefined, reduxStore)
        );
      }
    }
  },
  procHeartbeatLoop = async () => {
    // every 10 seconds, see if we've been idle for longer than 15 seconds,
    // and if so make sure we lockout if necessary
    const now = Date.now();
    if (now - lastProcHeartbeatAt > 15000) {
      try {
        await lockoutIfNeeded();
      } catch (err) {
        log("Error on heartbeat loop lockout:", err);
      }
    }
    lastProcHeartbeatAt = now;
    heartbeatTimeout = setTimeout(procHeartbeatLoop, 10000);
  },
  init = async (forceReset?: true) => {
    clientStoreEnableLogging();
    await initReduxStore(forceReset);
    await resolveLockoutTimer();
    await initKeyStore();
    await procHeartbeatLoop();
    await initSocketsAndTimers();
    if (reduxStore) {
      await refreshSessions(
        reduxStore.getState(),
        localSocketUpdate,
        undefined,
        true
      );
      checkUpgradesAvailableLoop(reduxStore!, localSocketUpdate);
    }
  },
  clearTimers = () => {
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
    }
    if (lockoutTimeout) {
      clearTimeout(lockoutTimeout);
    }
    // clearCacheLoopTimeout();
    clearKillIfIdleTimeout();
    clearUpgradesLoop();
  },
  initSocketsAndTimers = async () => {
    if (reduxStore) {
      procStatusWorker.sendMainToWorkerMessage({
        type: "resolveOrgSockets",
        state: pick(
          ["locked", "networkUnreachable", "orgUserAccounts"],
          reduxStore.getState()
        ),
        skipJitter: true,
      });
      socketPingLoop();
      killIfIdleLoop();
      // clearCacheLoop(reduxStore, localSocketUpdate);
    }
  },
  startSocketServer = (port: number, wsport: number) => {
    log(`Starting local socket server on port ${wsport}...`);

    const startFn = (n = 0) => {
      wss = new WebSocket.Server({
        port: wsport,
        verifyClient: ({ origin, req }, cb) => {
          authenticateUserAgent(req.headers["user-agent"]).then((authValid) => {
            log(
              authValid
                ? "Websocket connection successful."
                : "Websocket connection user-agent auth invalid.",
              { ip: req.socket.remoteAddress }
            );
            cb(
              authValid,
              authValid ? undefined : 401,
              authValid ? undefined : "Unauthorized."
            );
          });
        },
      });

      wss.on("error", (err) => {
        log("Error starting local socket server: " + err.message);
        throw err;
      });
    };

    startFn();
  },
  localSocketUpdate: Client.LocalSocketUpdateFn = (msg) => {
    if (wss && wss.clients.size > 0) {
      // log("Dispatching local socket update", { clients: wss.clients.size });
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      });
    }
  },
  lockDevice = async () => {
    clearStore();
    reduxStore = undefined;
    clearLockoutTimer();
    await lock();
    localSocketUpdate({ type: "update", accountId: undefined });
    closeAllOrgSockets();
  },
  unlockDevice = async (passphrase: string) => {
    await unlock(passphrase);
    log("unlocked");

    clearStore();
    log("cleared store");

    await initReduxStore();
    log("initialized store");

    await initSocketsAndTimers();
    log("initialized sockets and timers");

    if (reduxStore) {
      refreshSessions(
        reduxStore.getState(),
        localSocketUpdate,
        undefined,
        true
      );
    }
  },
  clearLockoutTimer = () => {
    if (lockoutTimeout) {
      clearTimeout(lockoutTimeout);
      lockoutTimeout = undefined;
      // log("Cleared lockout timer.");
    }
  },
  resolveLockoutTimer = async (nowArg?: number) => {
    clearLockoutTimer();
    if (isLocked() || !reduxStore) {
      return;
    }

    const now = nowArg ?? Date.now();

    await lockoutIfNeeded(now);
    if (isLocked()) {
      return;
    }

    const state = reduxStore.getState();
    if (state.requiresPassphrase && state.lockoutMs) {
      lockoutTimeout = setTimeout(lockDevice, state.lockoutMs);
      // log("Started lockout timer", {
      //   lockoutInMinutes: Math.floor(state.lockoutMs / 1000 / 60),
      // });
    }
  },
  lockoutIfNeeded = async (nowArg?: number) => {
    if (isLocked() || !reduxStore) {
      return;
    }
    const state = reduxStore.getState();

    if (!state.lockoutMs || !state.lastActiveAt) {
      return;
    }

    const now = nowArg ?? Date.now();

    if (now - state.lastActiveAt > state.lockoutMs) {
      await lockDevice();
    }
  },
  authenticateUserAgent = async (userAgent: string | undefined) => {
    if (!userAgent) {
      log("Authentication failed. user-agent not set.");
      return false;
    }

    const [agentName, , jsonEncryptedToken] = userAgent.split("|");

    if (agentName != Client.CORE_PROC_AGENT_NAME || !jsonEncryptedToken) {
      log("Authentication failed. Invalid user-agent.");
      return false;
    }

    const parsedEncryptedToken = JSON.parse(
        encodeUTF8(decodeBase64(jsonEncryptedToken))
      ) as Crypto.EncryptedData,
      deviceKey = await getDeviceKey();

    if (!deviceKey || !("auth" in deviceKey) || !deviceKey.auth) {
      log("Authentication failed. Device key missing or invalid.");
      return false;
    }

    try {
      const decryptedToken = await decryptSymmetricWithKey({
        encrypted: parsedEncryptedToken,
        encryptionKey: deviceKey.auth,
      });

      if (decryptedToken != Client.CORE_PROC_AUTH_TOKEN) {
        log("Authentication failed. Invalid user-agent auth token.");
        return false;
      }
    } catch (err) {
      log("Authentication failed. Error decrypting user-agent auth token:", {
        err,
      });
      return false;
    }

    return true;
  },
  lockoutMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      await lockoutIfNeeded();
    } catch (err) {
      next(err);
    }
    next();
  },
  loggerMiddleware = (req: Request, res: Response, next: NextFunction) => {
    log(req.method.toUpperCase() + " " + req.path);
    next();
  },
  authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    if (
      req.path == "/action" &&
      (req.body.action.type == Client.ActionType.LOAD_V1_UPGRADE ||
        req.body.action.type == Client.ActionType.LOAD_V1_UPGRADE_INVITE)
    ) {
      if (req.body.action.type == Client.ActionType.LOAD_V1_UPGRADE) {
        const verifyRes = verifyV1Upgrade(req.body.action.payload, Date.now());
        if (verifyRes !== true) {
          res.status(401).send({ error: verifyRes });
          return;
        }
      }

      // Client.ActionType.LOAD_V1_UPGRADE_INVITE doesn't need to be verified here, will be authenticated by invite tokens

      next();
      return;
    }

    let authenticated: boolean = false;
    try {
      authenticated = await authenticateUserAgent(req.get("user-agent"));
    } catch (err) {
      next(err);
      return;
    }
    if (authenticated) {
      next();
    } else {
      res.status(401).send({ error: "Unauthorized" });
    }
  };

import express, { NextFunction, Request, Response } from "express";
import asyncHandler from "express-async-handler";
import WebSocket from "ws";
import { getDefaultStore, clearStore } from "./redux_store";
import { dispatch, getActionParams } from "./handler";
import { getState } from "./lib/state";
import { Client, Crypto } from "@core/types";
import fkill from "fkill";
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
import { clearCacheLoop, clearCacheLoopTimeout } from "./clear_cache";
import { getContext } from "./default_context";
import open from "open";
import * as R from "ramda";
import { createPatch, Patch } from "rfc6902";
import { version as cliVersion } from "../../cli/package.json";

export const start = async (port = 19047, wsport = 19048) => {
  log("Starting EnvKey core process...");
  initFileLogger("core");
  await init();

  const app = express();

  startSocketServer(port, wsport);

  app.use(express.json());

  /*
   * put /alive route *before* loggerMiddleware so we
   * don't fill * up log file with /alive requests
   */
  app.get("/alive", (req, res) => {
    res.status(200).json({ cliVersion });
  });

  app.use(loggerMiddleware);

  app.get("/stop", (req, res) => {
    res.status(200).send("Stopping local server...");
    process.kill(process.pid, "SIGTERM");
  });

  app.use([authMiddleware, lockoutMiddleware]);

  app.get(
    "/state",
    asyncHandler(async (req, res) => {
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

      // to update lastActiveAt
      await dispatch(
        {
          type: Client.ActionType.FETCHED_CLIENT_STATE,
        },
        getContext()
      );

      resolveLockoutTimer();

      res.status(200).json(state);
    })
  );

  app.post(
    "/action",
    asyncHandler(async (req, res) => {
      const action = req.body.action as Client.Action.ClientAction | undefined,
        context = req.body.context as Client.Context | undefined;

      if (!action || !context) {
        const msg =
          "Bad request. Requires 'action' and 'context' in post body.";
        log(msg, req.body);
        res.status(400).json({ error: msg });
        return;
      }

      log("Received", { action: action.type });

      // shortcut to speed this up
      if (action.type == Client.ActionType.OPEN_URL) {
        open(action.payload.url, { newInstance: true });
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

      // log(JSON.stringify(action, null, 2));

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

      if (shouldSendSocketUpdate) {
        localSocketUpdate(
          "diffs",
          createPatch(initialClientState, afterDispatchClientState)
        );
      }

      const dispatchRes = await dispatchPromise;

      if (dispatchRes.success) {
        const updatedProcState = reduxStore.getState();

        // persist updated state to disk in background (don't block request for this)
        queuePersistState(updatedProcState);

        // connect to the org sockets of any new accounts that this action may have added to core state
        // (usually a no-op)
        resolveOrgSockets(reduxStore, localSocketUpdate, true);
      }

      await resolveLockoutTimer();

      const finalDiffs = createPatch(
        actionParams.type == "clientAction" || !shouldSendSocketUpdate
          ? initialClientState
          : afterDispatchClientState,
        dispatchRes.state
      );

      if (
        shouldSendSocketUpdate &&
        context.client.clientName == "cli" &&
        (actionParams.type == "asyncClientAction" ||
          actionParams.type == "apiRequestAction")
      ) {
        localSocketUpdate("diffs", finalDiffs);
      }

      res.status(200).json({
        ...R.omit(["state"], dispatchRes),
        diffs: finalDiffs,
      });
    })
  );

  app.use(function neverShouldGetHere(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    logStderr("Express Core Process Caught Unhandled Error!", { err: error });
    res.status(500).send({
      type: "error",
      error: true,
      errorStatus: 500,
      errorReason: error.message,
    });
  });

  let server: ReturnType<typeof app.listen>;
  const serverRunningMsg = `EnvKey local server is running. Server port: ${port}. Websocket port: ${wsport}.`;

  const startServer = (resolve: (res: boolean) => void, n = 0) => {
    server = app
      .listen(port, () => {
        log(serverRunningMsg);
        resolve(true);
      })
      .on("error", (err) => {
        log("Error starting server:", { err });
        if (
          err.message.includes(`address already in use :::${port}`) ||
          err.message.includes("EADDRINUSE")
        ) {
          handleAddrInUse(resolve, n);
        } else {
          throw err;
        }
      });
  };

  const handleAddrInUse = (resolve: (res: boolean) => void, n = 0) => {
    if (n > 1) {
      log(`Couldn't kill process blocking express port ${port}. Giving up.`);
      return;
    }

    log(`Killing process blocking express port ${port} and trying again...`);
    fkill(`:${port}`, {
      force: true,
      tree: true,
      silent: true,
    }).then(() => {
      setTimeout(() => {
        startServer(resolve, n + 1);
      }, 500);
    });
  };

  await new Promise((resolve) => startServer(resolve));

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

  const gracefulShutdown = (onShutdown?: () => void) => {
    log(`Shutting down gracefully...`);
    clearTimers();
    shutdownNetworking();

    if (reduxStore) {
      const procState = reduxStore.getState();
      queuePersistState(procState, true);
      log(`Persisting final state before shutdown...`);
      processPersistStateQueue().then(() => {
        log(`Finished persisting state. Shutting down.`);
        onShutdown ? onShutdown() : process.exit(0);
      });
    } else {
      onShutdown ? onShutdown() : process.exit(0);
    }
  };

  if (!process.env.IS_ELECTRON) {
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
        log(`Exiting due to uncaught workerpool error.`);
        gracefulShutdown();
      }
    });

    process.on("uncaughtException", (err) => {
      log(`Core process uncaughtException.`, { err });
      // log(`Exiting due to uncaughtException.`);
      // gracefulShutdown();
    });
  }

  return { shutdownNetworking, gracefulShutdown };
};

let reduxStore: Client.ReduxStore | undefined,
  lockoutTimeout: ReturnType<typeof setTimeout> | undefined,
  heartbeatTimeout: ReturnType<typeof setTimeout> | undefined,
  lastProcHeartbeatAt = Date.now(),
  wss: WebSocket.Server | undefined;

const initReduxStore = async (forceReset?: true) => {
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
      refreshSessions(
        reduxStore.getState(),
        localSocketUpdate,
        undefined,
        true
      ).then(() => checkUpgradesAvailableLoop(reduxStore!, localSocketUpdate));
    }
  },
  clearTimers = () => {
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
    }
    if (lockoutTimeout) {
      clearTimeout(lockoutTimeout);
    }
    clearCacheLoopTimeout();
    clearUpgradesLoop();
  },
  initSocketsAndTimers = async () => {
    if (reduxStore) {
      await resolveOrgSockets(reduxStore, localSocketUpdate, true);
      socketPingLoop();
      clearCacheLoop(reduxStore, localSocketUpdate);
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
        if (
          err.message.includes(`address already in use :::${wsport}`) ||
          err.message.includes("EADDRINUSE")
        ) {
          handleAddrInUse(n);
        } else {
          throw err;
        }
      });
    };

    const handleAddrInUse = (n = 0) => {
      if (n > 1) {
        log(`Couldn't kill process blocking wss port ${wsport}. Giving up.`);
        return;
      }

      log(`Killing process blocking wss port ${wsport} and trying again...`);
      fkill(`:${wsport}`, {
        force: true,
        tree: true,
        silent: true,
      }).then(() => {
        setTimeout(() => {
          startFn(n + 1);
        }, 500);
      });
    };

    startFn();
  },
  localSocketUpdate = (
    updateType: "full_update" | "diffs" = "full_update",
    diffs?: Patch
  ) => {
    if (wss && wss.clients.size > 0) {
      log("Dispatching local socket update", { clients: wss.clients.size });
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify(
              updateType == "full_update"
                ? { type: "update" }
                : {
                    type: "diffs",
                    diffs,
                  }
            )
          );
        }
      });
    }
  },
  lockDevice = async () => {
    clearStore();
    reduxStore = undefined;
    clearLockoutTimer();
    await lock();
    localSocketUpdate();
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

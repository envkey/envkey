import { getOrg } from "../../../shared/src/models/orgs";
import * as R from "ramda";
import WebSocket from "ws";
import url from "url";
import { IncomingMessage, createServer } from "http";
import { Auth, Api, Billing } from "@core/types";
import { log, logStderr } from "@core/lib/utils/logger";
import { authenticate, verifySignedLicense } from "../../../shared/src/auth";
import { okResult } from "./routes/route_helpers";
import { upTo1Sec, wait } from "@core/lib/utils/wait";
import {
  getDb,
  getNewTransactionConn,
  releaseTransaction,
} from "../../../shared/src/db";
import { env } from "../../../shared/src/env";

type RawSocket = IncomingMessage["socket"];

let socketServer: WebSocket.Server;

const HEARTBEAT_INTERVAL_MILLIS = 60000;

let numDeviceConnections = 0;
const userConnections: Api.UserSocketConnections = {};
const connectedByDeviceId: Api.ConnectedByDeviceId = {};

let numEnvkeyConnections = 0;
const envkeyConnections: Api.EnvkeySocketConnections = {};
const connectedByConnectionId: Api.ConnectedByConnectionId = {};

const numConnectionsByOrg: {
  [orgId: string]: number;
} = {};

let heartbeatTimeout: NodeJS.Timeout;
const pingAllClientsHeartbeat = async () => {
  let pingsQueued = 0;
  for (const wsClient of socketServer.clients) {
    if (wsClient.readyState != WebSocket.OPEN) {
      continue;
    }

    // background
    wait(upTo1Sec()).then(() => {
      wsClient.ping((err: Error | null) => {
        const clientInfo = (wsClient as any)._socket?._peername;
        if (err) {
          log("Client WebSocket ping ended with error", {
            err,
            client: clientInfo,
          });
        }
        // logDevOnly("Client WebSocket ping OK", { client: clientInfo });
      });
    });

    // every thousand pings, wait a second to cool off
    pingsQueued++;
    if (pingsQueued % 1000 == 0) {
      await wait(1000);
    }
  }

  heartbeatTimeout = setTimeout(
    pingAllClientsHeartbeat,
    HEARTBEAT_INTERVAL_MILLIS
  );
};

let getNumHostsFn: (() => number) | undefined;
export const registerGetNumHostsFn = (fn: typeof getNumHostsFn) => {
  getNumHostsFn = fn;
};
const getNumHosts = () => getNumHostsFn?.() ?? 1;

let throttleSocketConnectionFn: Api.ThrottleSocketConnectionFn | undefined;
export const registerThrottleSocketConnectionFn = (
  fn: Api.ThrottleSocketConnectionFn
) => {
  throttleSocketConnectionFn = fn;
};

let balanceSocketsFn: Api.BalanceSocketsFn | undefined;
export const registerBalanceSocketsFn = (fn: Api.BalanceSocketsFn) => {
  balanceSocketsFn = fn;
};

const start: Api.SocketServer["start"] = () => {
    const port = env.SOCKET_PORT ? parseInt(env.SOCKET_PORT) : 3002;

    const httpServer = createServer((req, res) => {
      const { pathname } = url.parse(<string>req.url);
      if (pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Socket Server OK");
        return;
      }
      if (pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(okResult));
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    });
    socketServer = new WebSocket.Server({ noServer: true });

    socketServer.on(
      "connection",
      (
        socket: WebSocket,
        req: IncomingMessage,
        context: Auth.TokenAuthContext | Auth.EnvkeySocketAuthContext
      ) => {
        const orgId =
          context.type == "tokenAuthContext"
            ? context.org.id
            : context.generatedEnvkey.pkey;

        if (context.type == "tokenAuthContext") {
          if (!userConnections[orgId]) {
            userConnections[orgId] = {};
          }

          if (!userConnections[orgId][context.user.id]) {
            userConnections[orgId][context.user.id] = {};
          }

          clearDeviceSocket(orgId, context.user.id, context.orgUserDevice.id);

          if (balanceSocketsFn) {
            balanceSocketsFn(
              "device",
              connectedByDeviceId,
              connectedByConnectionId,
              numDeviceConnections,
              numEnvkeyConnections,
              clearDeviceSocket,
              clearEnvkeyConnectionSocket
            );
          }
          userConnections[orgId][context.user.id][context.orgUserDevice.id] =
            socket;
          connectedByDeviceId[context.orgUserDevice.id] = {
            orgId,
            userId: context.user.id,
          };
          numDeviceConnections++;
          if (!numConnectionsByOrg[orgId]) {
            numConnectionsByOrg[orgId] = 1;
          } else {
            numConnectionsByOrg[orgId]++;
          }

          socket.on("close", getClearSocketFn("close", context));
          socket.on("error", getClearSocketFn("error", context));

          log("Websocket org user connected", {
            fromAddr: req.socket.remoteAddress + ":" + req.socket.remotePort,
            org: context.org.name,
            email: context.user.email,
            device: context.orgUserDevice.name,
            userId: context.user.id,
            numDeviceConnections,
            numEnvkeyConnections,
          });
        } else {
          const { generatedEnvkey, connectionId } = context;
          const generatedEnvkeyId = generatedEnvkey.id;

          if (!envkeyConnections[orgId]) {
            envkeyConnections[orgId] = {};
          }

          if (!envkeyConnections[orgId][generatedEnvkeyId]) {
            envkeyConnections[orgId][generatedEnvkeyId] = {};
          }

          clearEnvkeyConnectionSocket(orgId, generatedEnvkeyId, connectionId);

          if (balanceSocketsFn) {
            balanceSocketsFn(
              "generatedEnvkey",
              connectedByDeviceId,
              connectedByConnectionId,
              numDeviceConnections,
              numEnvkeyConnections,
              clearDeviceSocket,
              clearEnvkeyConnectionSocket
            );
          }
          envkeyConnections[orgId][generatedEnvkeyId][connectionId] = socket;
          numEnvkeyConnections++;
          connectedByConnectionId[connectionId] = {
            orgId,
            generatedEnvkeyId,
          };
          if (!numConnectionsByOrg[orgId]) {
            numConnectionsByOrg[orgId] = 1;
          } else {
            numConnectionsByOrg[orgId]++;
          }

          socket.on("close", getClearSocketFn("close", context));
          socket.on("error", getClearSocketFn("error", context));

          log("Websocket envkey connected", {
            fromAddr: req.socket.remoteAddress + ":" + req.socket.remotePort,
            orgId,
            generatedEnvkeyId,
            connectionId,
          });
        }
      }
    );

    httpServer.on(
      "upgrade",
      (req: IncomingMessage, socket: RawSocket, head) => {
        const fromAddr = req.socket.remoteAddress + ":" + req.socket.remotePort;
        log("Websocket connection attempt", {
          fromAddr,
        });

        if (typeof req.headers["authorization"] != "string") {
          log("Websocket authorization header missing", { fromAddr });
          socketAuthErr(socket);
          return;
        }

        const authParams = JSON.parse(req.headers["authorization"]) as
          | Auth.ApiAuthParams
          | Auth.FetchEnvkeySocketAuthParams;

        // transaction for authentication
        getNewTransactionConn().then(async (transactionConn) => {
          if (authParams.type == "tokenAuthParams") {
            let context: Auth.TokenAuthContext;
            try {
              context = await authenticate<Auth.TokenAuthContext>(
                authParams,
                transactionConn
              );
            } catch (err) {
              log("socket httpServer.authenticate error", { err });
              socketAuthErr(socket);
              return;
            } finally {
              releaseTransaction(transactionConn);
            }

            if (throttleSocketConnectionFn) {
              try {
                throttleSocketConnectionFn(
                  "device",
                  context.license,
                  getNumHosts(),
                  numConnectionsByOrg[context.org.id] ?? 0
                );
              } catch (err) {
                log("socket connection throttle error", { err });
                socketThrottleErr(socket);
                return;
              }
            }

            socketServer.handleUpgrade(req, socket, head, (ws) => {
              socketServer.emit("connection", ws, req, context);
            });
          } else if (authParams.type == "fetchEnvkeySocketAuthParams") {
            let generatedEnvkey: Api.Db.GeneratedEnvkey | undefined;
            let org: Api.Db.Org | undefined;
            let license: Billing.License | undefined;
            try {
              generatedEnvkey = await getDb<Api.Db.GeneratedEnvkey>(
                authParams.envkeyIdPart,
                {
                  transactionConn,
                  deleted: false,
                }
              );

              if (generatedEnvkey && throttleSocketConnectionFn) {
                org = await getOrg(generatedEnvkey.pkey, transactionConn);
                if (!org) {
                  log("socket httpServer.authenticate error", {
                    err: "org missing",
                  });
                  socketAuthErr(socket);
                  return;
                }
                license = verifySignedLicense(
                  org.id,
                  org.signedLicense,
                  Date.now(),
                  false
                );
              }
            } catch (err) {
              log("socket httpServer.authenticate error", { err });
              socketAuthErr(socket);
              return;
            } finally {
              releaseTransaction(transactionConn);
            }

            if (generatedEnvkey) {
              if (throttleSocketConnectionFn && org && license) {
                try {
                  throttleSocketConnectionFn(
                    "device",
                    license,
                    getNumHosts(),
                    numConnectionsByOrg[org.id] ?? 0
                  );
                } catch (err) {
                  log("socket connection throttle error", { err });
                  socketThrottleErr(socket);
                  return;
                }
              }

              socketServer.handleUpgrade(req, socket, head, (ws) => {
                socketServer.emit("connection", ws, req, {
                  type: "envkeySocketAuthContext",
                  generatedEnvkey,
                  connectionId: authParams.connectionId,
                });
              });
            } else {
              log("socket httpServer.authenticate error: not found");
              socketAuthErr(socket);
            }
          } else {
            releaseTransaction(transactionConn).then(() => {
              logStderr("invalid socket auth params", authParams);
            });
          }
        });
      }
    );

    httpServer.listen(port, () => {
      log(`Socket server waiting for connections`, {
        port,
        heartbeatIntervalMillis: HEARTBEAT_INTERVAL_MILLIS,
      });

      heartbeatTimeout = setTimeout(
        pingAllClientsHeartbeat,
        HEARTBEAT_INTERVAL_MILLIS
      );

      socketServer.on("close", () => clearTimeout(heartbeatTimeout));
    });
  },
  sendOrgUpdate: Api.SocketServer["sendOrgUpdate"] = (
    orgId,
    msg,
    skipDeviceId,
    scope
  ) => {
    const byUserId = userConnections[orgId] ?? {};
    log("Dispatching client socket update", { orgId });
    let devicesPublishedTo = 0;
    for (let userId in byUserId) {
      if (scope && scope.userIds && !scope.userIds.includes(userId)) {
        continue;
      }

      const byDeviceId = byUserId[userId] ?? {};
      for (let deviceId in byDeviceId) {
        if (deviceId == skipDeviceId) {
          continue;
        }
        if (scope && scope.deviceIds && !scope.deviceIds.includes(deviceId)) {
          continue;
        }
        const conn = byDeviceId[deviceId];
        if (conn.readyState == WebSocket.OPEN) {
          conn.send(JSON.stringify(msg));
          devicesPublishedTo++;

          // bring to the front (for balancing logic)
          connectedByDeviceId[deviceId] = { orgId, userId };
        }
      }
    }

    log("Dispatched client socket update", { orgId, devicesPublishedTo });
  },
  sendEnvkeyUpdate: Api.SocketServer["sendEnvkeyUpdate"] = (
    orgId,
    generatedEnvkeyId,
    msg
  ) => {
    const byConnectionId =
      (envkeyConnections[orgId] ?? {})[generatedEnvkeyId] ?? {};
    log("Dispatching envkey socket update", { generatedEnvkeyId });
    let connectionsPublishedTo = 0;

    for (let connectionId in byConnectionId) {
      const conn = byConnectionId[connectionId];
      if (conn.readyState == WebSocket.OPEN) {
        conn.send(JSON.stringify(msg));
        connectionsPublishedTo++;

        // bring to the front (for balancing logic)
        connectedByConnectionId[connectionId] = { orgId, generatedEnvkeyId };
      }
    }

    log("Dispatched client socket update", { orgId, connectionsPublishedTo });
  },
  clearDeviceSocket: Api.SocketServer["clearDeviceSocket"] = (
    orgId,
    userId,
    deviceId
  ) => {
    if (
      userConnections[orgId] &&
      userConnections[orgId][userId] &&
      userConnections[orgId][userId][deviceId]
    ) {
      log("Clearing socket", { orgId, userId, deviceId });
      const conn = userConnections[orgId][userId][deviceId];
      if (conn) {
        try {
          conn.removeAllListeners();
          conn.close();
        } catch (err) {
          log("Error closing socket:", { err, orgId, userId, deviceId });
        }
      }

      delete userConnections[orgId][userId][deviceId];
      numEnvkeyConnections--;
      if (numConnectionsByOrg[orgId]) {
        numConnectionsByOrg[orgId]--;
      }

      if (R.isEmpty(userConnections[orgId][userId])) {
        delete userConnections[orgId][userId];
      }

      if (R.isEmpty(userConnections[orgId])) {
        delete userConnections[orgId];
      }
    }

    if (connectedByDeviceId) {
      delete connectedByDeviceId[deviceId];
    }
  },
  clearEnvkeyConnectionSocket: Api.ClearEnvkeyConnectionSocketFn = (
    orgId,
    generatedEnvkeyId,
    connectionId
  ) => {
    if (
      envkeyConnections[orgId] &&
      envkeyConnections[orgId][generatedEnvkeyId] &&
      envkeyConnections[orgId][generatedEnvkeyId][connectionId]
    ) {
      log("Clearing socket", {
        orgId,
        generatedEnvkeyId,
        connectionId,
      });
      const conn = envkeyConnections[orgId][generatedEnvkeyId][connectionId];
      if (conn) {
        try {
          conn.removeAllListeners();
          conn.close();
        } catch (err) {
          log("Error closing socket:", {
            err,
            orgId,
            generatedEnvkeyId,
            connectionId,
          });
        }
      }

      delete envkeyConnections[orgId][generatedEnvkeyId][connectionId];
      numEnvkeyConnections--;
      if (numConnectionsByOrg[orgId]) {
        numConnectionsByOrg[orgId]--;
      }

      if (R.isEmpty(envkeyConnections[orgId][generatedEnvkeyId])) {
        delete envkeyConnections[orgId][generatedEnvkeyId];
      }

      if (R.isEmpty(envkeyConnections[orgId])) {
        delete envkeyConnections[orgId];
      }
    }

    if (connectedByConnectionId) {
      delete connectedByConnectionId[connectionId];
    }
  },
  clearEnvkeySockets: Api.SocketServer["clearEnvkeySockets"] = (
    orgId,
    generatedEnvkeyId
  ) => {
    if (
      envkeyConnections[orgId] &&
      envkeyConnections[orgId][generatedEnvkeyId]
    ) {
      const byConnectionId = envkeyConnections[orgId][generatedEnvkeyId];
      for (let connectionId in byConnectionId) {
        clearEnvkeyConnectionSocket(orgId, generatedEnvkeyId, connectionId);
      }
    }
  },
  clearUserSockets: Api.SocketServer["clearUserSockets"] = (orgId, userId) => {
    if (userConnections[orgId] && userConnections[orgId][userId]) {
      const byDeviceId = userConnections[orgId][userId];
      for (let deviceId in byDeviceId) {
        clearDeviceSocket(orgId, userId, deviceId);
      }
    }
  },
  clearOrgSockets: Api.SocketServer["clearOrgSockets"] = (orgId) => {
    if (userConnections[orgId]) {
      const byUserId = userConnections[orgId];
      for (let userId in byUserId) {
        clearUserSockets(orgId, userId);
      }
    }
  },
  clearOrgEnvkeySockets: Api.SocketServer["clearOrgEnvkeySockets"] = (
    orgId
  ) => {
    if (envkeyConnections[orgId]) {
      const byGeneratedEnvkeyid = envkeyConnections[orgId];
      for (let generatedEnvkeyId in byGeneratedEnvkeyid) {
        clearEnvkeySockets(orgId, generatedEnvkeyId);
      }
    }
  },
  socketAuthErr = (socket: RawSocket) => {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.removeAllListeners();
    socket.destroy();
  },
  socketThrottleErr = (socket: RawSocket) => {
    socket.write("HTTP/1.1 413 Too Many Connections\r\n\r\n");
    socket.removeAllListeners();
    socket.destroy();
  },
  getClearSocketFn =
    (
      type: "close" | "error",
      context: Auth.TokenAuthContext | Auth.EnvkeySocketAuthContext
    ) =>
    () => {
      if (context.type == "tokenAuthContext") {
        log(`Received ${type} web socket event for org user connection`, {
          org: context.org.name,
          email: context.user.email,
          device: context.orgUserDevice.name,
        });
        clearDeviceSocket(
          context.org.id,
          context.user.id,
          context.orgUserDevice.id
        );
      } else {
        const { generatedEnvkey, connectionId } = context;
        const orgId = generatedEnvkey.pkey;
        const generatedEnvkeyId = generatedEnvkey.id;

        log(`Received ${type} web socket event for envkey connection`, {
          orgId,
          generatedEnvkeyId,
          connectionId,
        });

        clearEnvkeyConnectionSocket(orgId, generatedEnvkeyId, connectionId);
      }
    };

for (let exitSignal of [
  "SIGINT",
  "SIGUSR1",
  "SIGUSR2",
  "uncaughtException",
  "SIGTERM",
  "SIGHUP",
]) {
  process.on(exitSignal, () => {
    log(
      `Received ${exitSignal} - clearing socket connections before exiting...`
    );

    for (let orgId in userConnections) {
      clearOrgSockets(orgId);
    }

    for (let orgId in envkeyConnections) {
      clearOrgEnvkeySockets(orgId);
    }

    process.exit(0);
  });
}

const res: Api.SocketServer = {
  start,
  sendOrgUpdate,
  sendEnvkeyUpdate,
  clearOrgSockets,
  clearUserSockets,
  clearDeviceSocket,
  clearOrgEnvkeySockets,
  clearEnvkeySockets,
};
export default res;

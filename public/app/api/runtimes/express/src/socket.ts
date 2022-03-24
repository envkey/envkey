import { getOrg } from "../../../shared/src/models/orgs";
import * as R from "ramda";
import WebSocket from "ws";
import url from "url";
import { IncomingMessage, createServer } from "http";
import { Auth, Api, Model, Billing } from "@core/types";
import { log, logStderr } from "@core/lib/utils/logger";
import {
  authenticate,
  verifySignedLicense,
  getOrgStats,
} from "../../../shared/src/auth";
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

const HEARTBEAT_INTERVAL_MS = 30000;
const PING_TIMEOUT = 10000;

let numDeviceConnections = 0;
const userConnections: Api.UserSocketConnections = {};
const connectedByDeviceId: Api.ConnectedByDeviceId = {};
const receivedPongByDeviceId: Record<string, boolean> = {};

let numEnvkeyConnections = 0;
const envkeyConnections: Api.EnvkeySocketConnections = {};
const connectedByConnectionId: Api.ConnectedByConnectionId = {};
const receivedPongByConnectionId: Record<string, boolean> = {};

const numConnectionsByOrg: {
  [orgId: string]: number;
} = {};

let heartbeatTimeout: NodeJS.Timeout | undefined;

const pingClient = async (
  client: WebSocket,
  cb: (error: Error | null) => void
) => {
  // background
  wait(upTo1Sec() * 10).then(() => {
    client.ping((err: Error | null) => {
      const clientInfo = (client as any)._socket?._peername;
      if (err) {
        log("Client WebSocket ping ended with error", {
          err,
          client: clientInfo,
        });
      }
      cb(err);
    });
  });
};

const getOnPingDeviceSocket = (deviceId: string) => (err: Error | null) => {
  const connected = connectedByDeviceId[deviceId];

  if (!connected) {
    return;
  }

  const { orgId, userId } = connected;
  if (err) {
    clearDeviceSocket(orgId, userId, deviceId, true, false);
  } else {
    receivedPongByDeviceId[deviceId] = false;
    setTimeout(() => {
      if (!receivedPongByDeviceId[deviceId]) {
        clearDeviceSocket(orgId, userId, deviceId, true, false);
      }
    }, PING_TIMEOUT);
  }
};

const getOnPingEnvkeySocket = (connectionId: string) => (err: Error | null) => {
  const connected = connectedByConnectionId[connectionId];

  if (!connected) {
    return;
  }

  const { orgId, generatedEnvkeyId } = connected;
  if (err) {
    clearEnvkeyConnectionSocket(
      orgId,
      generatedEnvkeyId,
      connectionId,
      true,
      false
    );
  } else {
    receivedPongByConnectionId[connectionId] = false;
    setTimeout(() => {
      if (!receivedPongByConnectionId[connectionId]) {
        clearEnvkeyConnectionSocket(
          orgId,
          generatedEnvkeyId,
          connectionId,
          true,
          false
        );
      }
    }, PING_TIMEOUT);
  }
};

const pingAllClientsHeartbeat = async () => {
  // log("pinging all websocket clients...", {
  //   numDeviceConnections,
  //   numEnvkeyConnections,
  // });

  for (let deviceId in connectedByDeviceId) {
    const conn = connectedByDeviceId[deviceId];
    if (!conn) {
      continue;
    }
    const { socket } = conn;
    pingClient(socket, getOnPingDeviceSocket(deviceId));
  }

  for (let connectionId in connectedByConnectionId) {
    const conn = connectedByConnectionId[connectionId];
    if (!conn) {
      continue;
    }
    const { socket } = conn;
    pingClient(socket, getOnPingEnvkeySocket(connectionId));
  }

  heartbeatTimeout = setTimeout(pingAllClientsHeartbeat, HEARTBEAT_INTERVAL_MS);
};

let throttleSocketConnectionFn: Api.ThrottleSocketConnectionFn | undefined;
export const registerThrottleSocketConnectionFn = (
  fn: Api.ThrottleSocketConnectionFn
) => {
  throttleSocketConnectionFn = fn;
};

let clusterFns:
  | {
      balanceSockets: Api.BalanceSocketsFn;

      addActiveDeviceSocket: Api.AddActiveDeviceSocketFn;
      addActiveEnvkeySocket: Api.AddActiveEnvkeySocketFn;

      clearActiveDeviceSocket: Api.ClearActiveDeviceSocketFn;
      clearActiveEnvkeyConnectionSocket: Api.ClearActiveEnvkeyConnectionSocketFn;
      clearActiveEnvkeySockets: Api.ClearActiveEnvkeySocketsFn;
      clearActiveUserSockets: Api.ClearActiveUserSocketsFn;

      clearActiveOrgDeviceSockets: Api.ClearActiveOrgSocketsFn;
      clearActiveOrgEnvkeySockets: Api.ClearActiveOrgSocketsFn;

      getEnvkeyBatchInfo: Api.EnvkeySocketBatchInfoFn;
    }
  | undefined;

export const registerClusterFns = (fns: Required<typeof clusterFns>) => {
  clusterFns = fns;
};

export const clearAllSockets = (clearActive = false) => {
  for (let orgId in userConnections) {
    clearOrgSockets(orgId, clearActive, false);
  }

  for (let orgId in envkeyConnections) {
    clearOrgEnvkeySockets(orgId, clearActive, false);
  }
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
    socketServer = new WebSocket.Server({
      noServer: true,
      maxPayload: 5 * 1024, // 5 KB
    });

    socketServer.on(
      "connection",
      async (
        socket: WebSocket,
        req: IncomingMessage,
        context: Auth.TokenAuthContext | Auth.EnvkeySocketAuthContext,
        ip: string
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

          clearDeviceSocket(
            orgId,
            context.user.id,
            context.orgUserDevice.id,
            false,
            false
          );

          if (clusterFns) {
            await clusterFns.balanceSockets(
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
            socket,
            consumerIp: ip,
          };
          numDeviceConnections++;
          if (!numConnectionsByOrg[orgId]) {
            numConnectionsByOrg[orgId] = 1;
          } else {
            numConnectionsByOrg[orgId]++;
          }

          if (clusterFns) {
            // add active socket
            await clusterFns.addActiveDeviceSocket(
              orgId,
              context.user.id,
              context.orgUserDevice.id,
              ip
            );
          }

          socket.on("close", getClearSocketFn("close", context));
          socket.on("error", getClearSocketFn("error", context));
          socket.on("pong", () => {
            receivedPongByDeviceId[context.orgUserDevice.id] = true;
          });

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

          clearEnvkeyConnectionSocket(
            orgId,
            generatedEnvkeyId,
            connectionId,
            false,
            false
          );

          if (clusterFns) {
            await clusterFns.balanceSockets(
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
            socket,
            consumerIp: ip,
          };
          if (!numConnectionsByOrg[orgId]) {
            numConnectionsByOrg[orgId] = 1;
          } else {
            numConnectionsByOrg[orgId]++;
          }
          if (clusterFns) {
            // increment active sockets
            await clusterFns.addActiveEnvkeySocket(
              orgId,
              generatedEnvkeyId,
              connectionId,
              ip
            );
          }

          socket.on("close", getClearSocketFn("close", context));
          socket.on("error", getClearSocketFn("error", context));
          socket.on("pong", () => {
            receivedPongByConnectionId[connectionId] = true;
          });

          log("Websocket envkey connected", {
            fromAddr: req.socket.remoteAddress + ":" + req.socket.remotePort,
            orgId,
            generatedEnvkeyId,
            connectionId,
            numDeviceConnections,
            numEnvkeyConnections,
          });
        }
      }
    );

    httpServer.on(
      "upgrade",
      (req: IncomingMessage, socket: RawSocket, head) => {
        const ip =
          (req.headers["x-forwarded-for"] as string) ??
          req.socket.remoteAddress;

        log("Websocket connection attempt", {
          ip,
        });

        if (typeof req.headers["authorization"] != "string") {
          log("Websocket authorization header missing", { ip });
          // socketAuthErr(socket);
          socketServer.handleUpgrade(req, socket, head, (ws) => {
            ws.close(4001, "forbidden");
          });
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
                transactionConn,
                ip,
                true
              );
            } catch (err) {
              log("socket httpServer.authenticate error", { err });
              socketServer.handleUpgrade(req, socket, head, (ws) => {
                ws.close(4001, "forbidden");
              });
              return;
            } finally {
              releaseTransaction(transactionConn);
            }

            if (throttleSocketConnectionFn && context.orgStats!) {
              try {
                throttleSocketConnectionFn(
                  "device",
                  context.license,
                  context.orgStats
                );
              } catch (err) {
                log("socket connection throttle error", { err });
                socketServer.handleUpgrade(req, socket, head, (ws) => {
                  ws.close(4002, "throttled");
                });
                return;
              }
            }

            socketServer.handleUpgrade(req, socket, head, (ws) => {
              socketServer.emit("connection", ws, req, context, ip);
            });
          } else if (authParams.type == "fetchEnvkeySocketAuthParams") {
            let generatedEnvkey: Api.Db.GeneratedEnvkey | undefined;
            let org: Api.Db.Org | undefined;
            let orgStats: Model.OrgStats | undefined;
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
                [org, orgStats] = await Promise.all([
                  getOrg(generatedEnvkey.pkey, transactionConn),
                  getOrgStats(generatedEnvkey.pkey, transactionConn, true),
                ]);
                if (!org || !orgStats) {
                  log("socket httpServer.authenticate error", {
                    err: "org or orgStats missing",
                  });
                  socketServer.handleUpgrade(req, socket, head, (ws) => {
                    ws.close(4001, "forbidden");
                  });
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
              socketServer.handleUpgrade(req, socket, head, (ws) => {
                ws.close(4001, "forbidden");
              });
              return;
            } finally {
              releaseTransaction(transactionConn);
            }

            if (generatedEnvkey) {
              if (throttleSocketConnectionFn && org && license && orgStats) {
                try {
                  throttleSocketConnectionFn(
                    "generatedEnvkey",
                    license,
                    orgStats
                  );
                } catch (err) {
                  log("caught throttle error...");
                  log("socket connection throttle error", { err });
                  socketServer.handleUpgrade(req, socket, head, (ws) => {
                    ws.close(4001, "throttled");
                  });
                  return;
                }
              }

              socketServer.handleUpgrade(req, socket, head, (ws) => {
                socketServer.emit(
                  "connection",
                  ws,
                  req,
                  {
                    type: "envkeySocketAuthContext",
                    generatedEnvkey,
                    connectionId: authParams.connectionId,
                  },
                  ip
                );
              });
            } else {
              log("socket httpServer.authenticate error: not found");
              socketServer.handleUpgrade(req, socket, head, (ws) => {
                ws.close(4001, "forbidden");
              });
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
        heartbeatIntervalMillis: HEARTBEAT_INTERVAL_MS,
      });

      heartbeatTimeout = setTimeout(
        pingAllClientsHeartbeat,
        HEARTBEAT_INTERVAL_MS
      );

      socketServer.on("close", () => {
        if (heartbeatTimeout) {
          clearTimeout(heartbeatTimeout);
          heartbeatTimeout = undefined;
        }
      });
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
          conn.send(JSON.stringify(msg), (err) => {
            if (err) {
              log("Error sending to socket. Closing...", {
                orgId,
                userId,
                deviceId,
                err,
              });
              clearDeviceSocket(orgId, userId, deviceId, true, false);
            } else {
              // bring to the front (for balancing logic)
              const connected = connectedByDeviceId[deviceId];
              if (connected) {
                connectedByDeviceId[deviceId] = {
                  orgId,
                  userId,
                  socket: conn,
                  consumerIp: connected.consumerIp,
                };
              }
            }
          });
          devicesPublishedTo++;
        }
      }
    }

    log("Dispatched client socket update", { orgId, devicesPublishedTo });
  },
  sendEnvkeyUpdate: Api.SocketServer["sendEnvkeyUpdate"] = async (
    orgId,
    generatedEnvkeyId
  ) => {
    const byConnectionId =
      (envkeyConnections[orgId] ?? {})[generatedEnvkeyId] ?? {};
    log("Dispatching envkey socket update", { generatedEnvkeyId });
    let connectionsPublishedTo = 0;

    const getBatchInfoFn =
      clusterFns?.getEnvkeyBatchInfo ?? getLocalEnvkeyBatchInfo;
    const { totalConnections, indexByConnectionId } = await getBatchInfoFn(
      orgId,
      generatedEnvkeyId
    );

    for (let connectionId in byConnectionId) {
      const conn = byConnectionId[connectionId];
      if (conn.readyState == WebSocket.OPEN) {
        const msg = `${
          indexByConnectionId[connectionId] ?? 0
        }|${totalConnections}`;

        conn.send(msg, (err) => {
          if (err) {
            log("Error sending to socket. Closing...", {
              orgId,
              generatedEnvkeyId,
              connectionId,
              err,
            });
            clearEnvkeyConnectionSocket(
              orgId,
              generatedEnvkeyId,
              connectionId,
              true,
              false
            );
          } else {
            const connected = connectedByConnectionId[connectionId];

            if (connected) {
              const { consumerIp } = connected;

              // bring to the front (for balancing logic)
              connectedByConnectionId[connectionId] = {
                orgId,
                generatedEnvkeyId,
                socket: conn,
                consumerIp,
              };
            }
          }
        });
        connectionsPublishedTo++;
      }
    }

    log("Dispatched client socket update", { orgId, connectionsPublishedTo });
  },
  clearDeviceSocket: Api.SocketServer["clearDeviceSocket"] = async (
    orgId,
    userId,
    deviceId,
    clearActive,
    noReconnect
  ) => {
    if (connectedByDeviceId[deviceId]) {
      delete connectedByDeviceId[deviceId];
    }

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
          noReconnect ? conn.close(4001, "forbidden") : conn.close();
        } catch (err) {
          log("Error closing socket:", { err, orgId, userId, deviceId });
        }
      }

      delete userConnections[orgId][userId][deviceId];
      numDeviceConnections--;
      if (numConnectionsByOrg[orgId]) {
        numConnectionsByOrg[orgId]--;
      }

      if (R.isEmpty(userConnections[orgId][userId])) {
        delete userConnections[orgId][userId];
      }

      if (R.isEmpty(userConnections[orgId])) {
        delete userConnections[orgId];
      }

      if (clearActive && clusterFns) {
        await clusterFns.clearActiveDeviceSocket(deviceId);
      }
    }
  },
  clearEnvkeyConnectionSocket: Api.ClearEnvkeyConnectionSocketFn = async (
    orgId,
    generatedEnvkeyId,
    connectionId,
    clearActive,
    noReconnect
  ) => {
    if (connectedByConnectionId[connectionId]) {
      delete connectedByConnectionId[connectionId];
    }
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
          noReconnect ? conn.close(4001, "forbidden") : conn.close();
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

      if (clearActive && clusterFns) {
        await clusterFns.clearActiveEnvkeyConnectionSocket(connectionId);
      }
    }
  },
  clearEnvkeySockets: Api.SocketServer["clearEnvkeySockets"] = async (
    orgId,
    generatedEnvkeyId,
    clearActive,
    noReconnect
  ) => {
    if (
      envkeyConnections[orgId] &&
      envkeyConnections[orgId][generatedEnvkeyId]
    ) {
      const byConnectionId = envkeyConnections[orgId][generatedEnvkeyId];
      for (let connectionId in byConnectionId) {
        clearEnvkeyConnectionSocket(
          orgId,
          generatedEnvkeyId,
          connectionId,
          false,
          noReconnect
        );
      }

      if (clearActive && clusterFns) {
        await clusterFns.clearActiveEnvkeySockets(generatedEnvkeyId);
      }
    }
  },
  clearUserSockets: Api.SocketServer["clearUserSockets"] = async (
    orgId,
    userId,
    clearActive,
    noReconnect
  ) => {
    if (userConnections[orgId] && userConnections[orgId][userId]) {
      const byDeviceId = userConnections[orgId][userId];
      for (let deviceId in byDeviceId) {
        clearDeviceSocket(orgId, userId, deviceId, false, noReconnect);
      }

      if (clearActive && clusterFns) {
        await clusterFns.clearActiveUserSockets(userId);
      }
    }
  },
  clearOrgSockets: Api.SocketServer["clearOrgSockets"] = async (
    orgId,
    clearActive,
    noReconnect
  ) => {
    if (userConnections[orgId]) {
      const byUserId = userConnections[orgId];
      for (let userId in byUserId) {
        clearUserSockets(orgId, userId, false, noReconnect);
      }

      if (clearActive && clusterFns) {
        await clusterFns.clearActiveOrgDeviceSockets(orgId);
      }
    }
  },
  clearOrgEnvkeySockets: Api.SocketServer["clearOrgEnvkeySockets"] = async (
    orgId,
    clearActive,
    noReconnect
  ) => {
    if (envkeyConnections[orgId]) {
      const byGeneratedEnvkeyid = envkeyConnections[orgId];
      for (let generatedEnvkeyId in byGeneratedEnvkeyid) {
        clearEnvkeySockets(orgId, generatedEnvkeyId, false, noReconnect);
      }

      if (clearActive && clusterFns) {
        await clusterFns.clearActiveOrgEnvkeySockets(orgId);
      }
    }
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
          context.orgUserDevice.id,
          true,
          false
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

        clearEnvkeyConnectionSocket(
          orgId,
          generatedEnvkeyId,
          connectionId,
          true,
          false
        );
      }
    };

const getLocalEnvkeyBatchInfo: Api.EnvkeySocketBatchInfoFn = async (
  orgId,
  generatedEnvkeyId
) => {
  let i = 0;
  const indexByConnectionId: Record<string, number> = {};

  if (envkeyConnections[orgId] && envkeyConnections[orgId][generatedEnvkeyId]) {
    const connections = envkeyConnections[orgId][generatedEnvkeyId];

    for (let connectionId in connections) {
      indexByConnectionId[connectionId] = i;
      i++;
    }
  }

  return { totalConnections: i, indexByConnectionId };
};

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

import * as R from "ramda";
import WebSocket from "ws";
import url from "url";
import { IncomingMessage, createServer } from "http";
import { Auth, Api } from "@core/types";
import { log, logStderr } from "@core/lib/utils/logger";
import { authenticate } from "../../../shared/src/auth";
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

const HEARTBEAT_INTERVAL_MILLIS = 25000;

const userConnections: {
  [orgId: string]: {
    [userId: string]: {
      [deviceId: string]: WebSocket;
    };
  };
} = {};

const envkeyConnections: {
  [orgId: string]: {
    [generatedEnvkeyId: string]: {
      [connectionId: string]: WebSocket;
    };
  };
} = {};

let heartbeatTimeout: NodeJS.Timeout;
const pingAllClientsHeartbeat = async () => {
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
  }
  heartbeatTimeout = setTimeout(
    pingAllClientsHeartbeat,
    HEARTBEAT_INTERVAL_MILLIS
  );
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
        if (context.type == "tokenAuthContext") {
          if (!userConnections[context.org.id]) {
            userConnections[context.org.id] = {};
          }

          if (!userConnections[context.org.id][context.user.id]) {
            userConnections[context.org.id][context.user.id] = {};
          }

          clearDeviceSocket(
            context.org.id,
            context.user.id,
            context.orgUserDevice.id
          );

          userConnections[context.org.id][context.user.id][
            context.orgUserDevice.id
          ] = socket;
          socket.on("close", getClearSocketFn("close", context));
          socket.on("error", getClearSocketFn("error", context));

          log("Websocket org user connected", {
            fromAddr: req.socket.remoteAddress + ":" + req.socket.remotePort,
            org: context.org.name,
            email: context.user.email,
            device: context.orgUserDevice.name,
            userId: context.user.id,
          });
        } else {
          const { generatedEnvkey, connectionId } = context;
          const orgId = generatedEnvkey.pkey;
          const generatedEnvkeyId = generatedEnvkey.id;

          if (!envkeyConnections[orgId]) {
            envkeyConnections[orgId] = {};
          }

          if (!envkeyConnections[orgId][generatedEnvkeyId]) {
            envkeyConnections[orgId][generatedEnvkeyId] = {};
          }

          clearEnvkeyConnectionSocket(orgId, generatedEnvkeyId, connectionId);

          envkeyConnections[orgId][generatedEnvkeyId][connectionId] = socket;
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
        getNewTransactionConn().then((transactionConn) => {
          if (authParams.type == "tokenAuthParams") {
            authenticate<Auth.TokenAuthContext>(authParams, transactionConn)
              .then((context) => {
                socketServer.handleUpgrade(req, socket, head, (ws) => {
                  socketServer.emit("connection", ws, req, context);
                });
              })
              .catch((err) => {
                log("socket httpServer.authenticate error", { err });
                socketAuthErr(socket);
              })
              .finally(() => releaseTransaction(transactionConn));
          } else if (authParams.type == "fetchEnvkeySocketAuthParams") {
            getDb<Api.Db.GeneratedEnvkey>(authParams.envkeyIdPart, {
              transactionConn,
              deleted: false,
            })
              .then((generatedEnvkey) => {
                if (generatedEnvkey) {
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
              })
              .catch((err) => {
                log("socket httpServer.authenticate error", { err });
                socketAuthErr(socket);
              })
              .finally(() => releaseTransaction(transactionConn));
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

      if (R.isEmpty(userConnections[orgId][userId])) {
        delete userConnections[orgId][userId];
      }

      if (R.isEmpty(userConnections[orgId])) {
        delete userConnections[orgId];
      }
    }
  },
  clearEnvkeyConnectionSocket = (
    orgId: string,
    generatedEnvkeyId: string,
    connectionId: string
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

      if (R.isEmpty(envkeyConnections[orgId][generatedEnvkeyId])) {
        delete envkeyConnections[orgId][generatedEnvkeyId];
      }

      if (R.isEmpty(envkeyConnections[orgId])) {
        delete envkeyConnections[orgId];
      }
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

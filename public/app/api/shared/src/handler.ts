import { asyncify } from "@core/lib/async";
import { clearOrphanedRootPubkeyReplacements } from "./models/crypto";
import { getOrg } from "./models/orgs";
import { log, logWithElapsed, logStderr } from "@core/lib/utils/logger";
import { getLogTransactionStatement } from "./models/logs";
import { createPatch } from "rfc6902";
import { Api, Client, Auth, Crypto, Blob, Rbac, Awaited } from "@core/types";
import { authenticate, authorizeEnvsUpdate } from "./auth";
import * as R from "ramda";
import {
  getNewTransactionConn,
  objectTransactionItemsEmpty,
  mergeObjectTransactionItems,
  objectTransactionStatements,
  executeTransactionStatements,
  releaseTransaction,
} from "./db";
import { env } from "./env";
import {
  getGraphTransactionItems,
  getOrgGraph,
  getApiUserGraph,
  clearOrphanedLocals,
} from "./graph";
import {
  getCurrentEncryptedKeys,
  deleteExpiredAuthObjects,
  graphTypes,
  getNumActiveDeviceLike,
} from "@core/lib/graph";
import { keySetDifference, keySetEmpty } from "@core/lib/blob";
import {
  getDeleteEncryptedKeysTransactionItems,
  getEnvParamsTransactionItems,
  getEnvEncryptedKeys,
  getChangesetEncryptedKeys,
  requireEncryptedKeys,
  queueBlobsForReencryptionFromToDeleteEncryptedKeys,
  getReorderEncryptedKeysTransactionItems,
  getEnvEncryptedBlobs,
  getChangesetEncryptedBlobs,
} from "./blob";
import { pick } from "@core/lib/utils/pick";
import { v4 as uuid } from "uuid";
import { PoolConnection } from "mysql2/promise";
import produce from "immer";

type ApiActionConfig = Api.ApiActionParams<
  Api.Action.RequestAction,
  Api.Net.ApiResult
>;

let replicationFn: Api.ReplicationFn | undefined;
let updateOrgStatsFn: Api.UpdateOrgStatsFn | undefined;
let throttleRequestFn: Api.ThrottleRequestFn | undefined;
let throttleResponseFn: Api.ThrottleResponseFn | undefined;

export const apiAction = <
    ActionType extends Api.Action.RequestAction,
    ResponseType extends Api.Net.ApiResult,
    AuthContextType extends Auth.AuthContext = Auth.DefaultAuthContext
  >(
    apiAction: Api.ApiActionParams<ActionType, ResponseType, AuthContextType>
  ) => {
    if (apiActions[apiAction.type]) {
      throw new Api.ApiError(
        "Api Action with this type was already defined",
        500
      );
    }

    apiActions[apiAction.type] = apiAction as Api.ApiActionParams<
      Api.Action.RequestAction,
      ResponseType
    >;
  },
  registerSocketServer = (server: Api.SocketServer) => (socketServer = server),
  // inject s3 replication handler
  registerReplicationFn = (fn: typeof replicationFn) => {
    replicationFn = fn;
  },
  registerUpdateOrgStatsFn = (fn: Api.UpdateOrgStatsFn) => {
    updateOrgStatsFn = fn;
  },
  registerThrottleRequestFn = (fn: Api.ThrottleRequestFn) => {
    throttleRequestFn = fn;
  },
  getThrottleRequestFn = () => throttleRequestFn,
  registerThrottleResponseFn = (fn: Api.ThrottleResponseFn) => {
    throttleResponseFn = fn;
  },
  getThrottleResponseFn = () => throttleResponseFn,
  handleAction = async (
    action: Api.Action.RequestAction | Api.Action.BulkGraphAction,
    requestParams: Api.RequestParams
  ): Promise<Api.Net.ApiResult> => {
    const transactionId = uuid();
    const requestBytes = Buffer.byteLength(JSON.stringify(action), "utf8");

    log("Received action " + action.type, {
      requestBytes,
      transactionId,
    });

    const isFetchAction =
      action.type == Api.ActionType.FETCH_ENVKEY ||
      action.type == Api.ActionType.ENVKEY_FETCH_UPDATE_TRUSTED_ROOT_PUBKEY;

    const apiActionConfig = apiActions[action.type];

    if (!apiActionConfig && action.type != Api.ActionType.BULK_GRAPH_ACTION) {
      const msg = "No handler matched the API action type";
      log(msg);
      throw new Api.ApiError(msg, 404);
    }

    const requestStart = Date.now();
    const transactionConn = await getNewTransactionConn();
    logWithElapsed(transactionId + " - started transaction", requestStart);

    try {
      let auth: Auth.AuthContext | undefined;
      let actionStart = requestStart;

      if (
        action.type == Api.ActionType.BULK_GRAPH_ACTION ||
        apiActionConfig.authenticated
      ) {
        if (!("auth" in action.meta) || !action.meta.auth) {
          throw new Api.ApiError(
            `Authentication failed (${transactionId})`,
            401
          );
        }

        auth = await authenticate(action.meta.auth, transactionConn).catch(
          (err) => {
            throw err;
          }
        );

        actionStart = Date.now();
      }

      logWithElapsed(transactionId + " - authenticated", requestStart);

      if (auth) {
        log("Authenticated action", {
          type: action.type,
          transactionId,
          requestBytes,
          requestStart,
          actionStart,
          org: [auth.org.name, auth.org.id].join(" → "),
          user:
            "user" in auth && auth.user
              ? "firstName" in auth.user
                ? [
                    [auth.user.firstName, auth.user.lastName].join(" "),
                    auth.user.id,
                  ].join(" → ")
                : [auth.user.name, auth.user.id].join(" → ")
              : undefined,
          device:
            "orgUserDevice" in auth
              ? [auth.orgUserDevice.name, auth.orgUserDevice.id].join(" → ")
              : undefined,
          provisioningProvider:
            "provisioningProvider" in auth
              ? [
                  auth.provisioningProvider.nickname,
                  auth.provisioningProvider.id,
                ].join(" → ")
              : undefined,
          orgRole: "orgRole" in auth ? auth.orgRole?.name : undefined,
          // orgPermissions: Array.from(auth.orgPermissions),
        });
      }

      const result = await tryHandleAction({
        action,
        requestParams,
        apiActionConfig,
        requestStart,
        actionStart,
        transactionId,
        auth,
        transactionConn,
        requestBytes,
      });

      return result;
    } catch (err) {
      let msg: string, status: number;

      if (err instanceof Api.ApiError) {
        msg = err.message;
        status = err.code;
      } else if (err instanceof Error) {
        msg = err.message;
        status = 500;
      } else {
        msg = "Server error";
        status = 500;
      }

      logWithElapsed(`api error: ${msg}`, requestStart, {
        status,
        stack: err.stack,
        transactionConn: Boolean(transactionConn),
      });
      try {
        await transactionConn.query("ROLLBACK;");
        logWithElapsed("rolled back transaction", requestStart);
      } catch (err) {
        logStderr("Error rolling back transaction:", {
          err,
          stack: err.stack,
        });
      }
      throw new Api.ApiError(msg, status);
    } finally {
      try {
        await releaseTransaction(transactionConn);
        logWithElapsed("released transaction", requestStart);
      } catch (err) {
        logStderr("Error releasing transaction:", {
          err,
          stack: err.stack,
        });
      }
    }
  },
  tryHandleAction = async (params: {
    action: Api.Action.RequestAction | Api.Action.BulkGraphAction;
    requestParams: Api.RequestParams;
    apiActionConfig: ApiActionConfig;
    requestStart: number;
    actionStart: number;
    transactionId: string;
    auth?: Auth.AuthContext;
    transactionConn: PoolConnection;
    requestBytes: number;
  }): Promise<Api.Net.ApiResult> => {
    const {
      action,
      requestParams,
      apiActionConfig,
      requestStart,
      actionStart,
      transactionId,
      auth,
      transactionConn,
      requestBytes,
    } = params;

    let response: Api.Net.ApiResult | undefined,
      responseBytes: number | undefined,
      transactionStatements: Api.Db.SqlStatement[] = [],
      backgroundStatements: Api.Db.SqlStatement[] = [],
      postUpdateActions: Api.HandlerPostUpdateActions | undefined,
      clearUserSockets: Api.ClearUserSocketParams[] = [],
      clearEnvkeySockets: Api.ClearEnvkeySocketParams[] = [],
      updatedGeneratedEnvkeyIds: string[] = [],
      orgGraph: Api.Graph.OrgGraph | undefined,
      updatedOrgGraph: Api.Graph.OrgGraph | undefined,
      reorderBlobsIfNeeded = false,
      handlerContext: Api.HandlerContext | undefined;

    if (action.type == Api.ActionType.BULK_GRAPH_ACTION && auth) {
      const graphScopeFns: ReturnType<Api.GraphScopeFn>[][] = [];

      for (let graphAction of action.payload) {
        const graphApiActionConfig = apiActions[graphAction.type];

        if (
          graphApiActionConfig.graphAction &&
          !graphApiActionConfig.skipGraphUpdatedAtCheck &&
          (
            (graphAction as Api.Action.RequestAction).meta as {
              graphUpdatedAt: number;
            }
          ).graphUpdatedAt !== auth.org.graphUpdatedAt
        ) {
          throw new Api.ApiError("client graph outdated", 400);
        }

        if (
          graphApiActionConfig.graphAction &&
          graphApiActionConfig.graphScopes
        ) {
          graphApiActionConfig.graphScopes.forEach((fn, i) => {
            if (!graphScopeFns[i]) {
              graphScopeFns[i] = [];
            }
            graphScopeFns[i].push(
              fn(auth, graphAction as Api.Action.RequestAction)
            );
          });
        }
      }

      if (graphScopeFns.length > 0) {
        for (let scopeFns of graphScopeFns) {
          const scopes = new Set<string>();
          for (let scopeFn of scopeFns) {
            for (let scope of scopeFn(orgGraph)) {
              scopes.add(scope);
            }
          }
          orgGraph = await getOrgGraph(
            auth.org.id,
            {
              transactionConn,
            },
            Array.from(scopes)
          );
        }
      } else {
        orgGraph = await getOrgGraph(auth.org.id, {
          transactionConn,
        });
      }

      logWithElapsed(transactionId + " - got org graph", requestStart);

      const actionResults: Awaited<ReturnType<typeof getActionRes>>[] = [];

      // const actionResults = await Promise.all(
      //   action.payload.map(async (graphAction) => {
      for (let graphAction of action.payload) {
        const graphApiActionConfig = apiActions[graphAction.type];
        if (!graphApiActionConfig) {
          throw new Api.ApiError("no handler supplied", 500);
        }
        if (!graphApiActionConfig.graphAction) {
          throw new Api.ApiError(
            "Bulk graph action can only be composed of graph actions",
            500
          );
        }
        if (graphApiActionConfig.reorderBlobsIfNeeded) {
          reorderBlobsIfNeeded = true;
        }
        log("Processing bulk action sub-action: ", {
          transactionId,
          graphAction: graphAction.type,
        });
        const res = await getActionRes(
          graphApiActionConfig,
          {
            ...graphAction,
            meta: {
              ...graphAction.meta,
              client: action.meta.client,
              auth: action.meta.auth,
            },
          } as Api.Action.GraphAction,
          requestParams,
          transactionConn,
          requestStart,
          actionStart,
          transactionId,
          requestBytes,
          auth,
          orgGraph,
          true
        );
        actionResults.push(res);
        // return res;
      }
      // ));

      for (let res of actionResults) {
        if (
          res.response.type != "graphDiffs" ||
          (response && response.type != "graphDiffs") ||
          !res.updatedOrgGraph ||
          !res.updatedUserGraph
        ) {
          throw new Api.ApiError(
            "Bulk graph action can only be composed of graph actions with 'graphDiffs' responses",
            400
          );
        }

        const diffs = res.response.diffs;

        ({ updatedOrgGraph } = res);

        response = response
          ? (response = {
              ...response,
              diffs: [...response.diffs, ...diffs],
            })
          : res.response;

        if (res.transactionItems) {
          transactionStatements.push(
            ...objectTransactionStatements(res.transactionItems, actionStart)
          );
        }

        transactionStatements.push(res.logTransactionStatement);

        if (res.backgroundLogStatement) {
          backgroundStatements.push(res.backgroundLogStatement);
        }

        postUpdateActions = postUpdateActions
          ? postUpdateActions.concat(res.postUpdateActions ?? [])
          : res.postUpdateActions;

        clearUserSockets = clearUserSockets.concat(res.clearUserSockets ?? []);

        clearEnvkeySockets = clearEnvkeySockets.concat(
          res.clearEnvkeySockets ?? []
        );

        updatedGeneratedEnvkeyIds = R.uniq(
          updatedGeneratedEnvkeyIds.concat(res.updatedGeneratedEnvkeyIds ?? [])
        );
      }
    } else {
      if (apiActionConfig.graphAction && auth) {
        // force latest graph for all graph actions (unless they explicitly opt-out)
        if (
          !apiActionConfig.skipGraphUpdatedAtCheck &&
          (action.meta as { graphUpdatedAt: number }).graphUpdatedAt !==
            auth.org.graphUpdatedAt
        ) {
          throw new Api.ApiError("client graph outdated", 400);
        }

        if (apiActionConfig.graphScopes) {
          for (let scopeFn of apiActionConfig.graphScopes) {
            orgGraph = await getOrgGraph(
              auth.org.id,
              {
                transactionConn,
              },
              scopeFn(auth, action)(orgGraph)
            );
          }
        } else {
          orgGraph = await getOrgGraph(auth.org.id, {
            transactionConn,
          });
        }

        logWithElapsed(transactionId + " - got org graph", requestStart);

        if (apiActionConfig.reorderBlobsIfNeeded) {
          reorderBlobsIfNeeded = true;
        }
      }

      const res = await getActionRes(
        apiActionConfig,
        action,
        requestParams,
        transactionConn,
        requestStart,
        actionStart,
        transactionId,
        requestBytes,
        auth,
        orgGraph
      );

      response = res.response;
      responseBytes = res.responseBytes;
      postUpdateActions = res.postUpdateActions;
      clearUserSockets = res.clearUserSockets ?? [];
      clearEnvkeySockets = res.clearEnvkeySockets ?? [];
      updatedOrgGraph = res.updatedOrgGraph;
      handlerContext = res.handlerContext;
      updatedGeneratedEnvkeyIds = res.updatedGeneratedEnvkeyIds ?? [];

      if (res.transactionItems) {
        transactionStatements.push(
          ...objectTransactionStatements(res.transactionItems, actionStart)
        );
      }

      transactionStatements.push(res.logTransactionStatement);

      if (res.backgroundLogStatement) {
        backgroundStatements.push(res.backgroundLogStatement);
      }
    }

    logWithElapsed(transactionId + " - got action result", requestStart);

    if (!responseBytes) {
      responseBytes = Buffer.byteLength(JSON.stringify(response), "utf8");
    }

    if (!response) {
      throw new Api.ApiError("Response undefined", 500);
    }

    if (reorderBlobsIfNeeded && auth && orgGraph && updatedOrgGraph) {
      const reorderTransactionItems = getReorderEncryptedKeysTransactionItems(
        orgGraph,
        updatedOrgGraph
      );

      if (!objectTransactionItemsEmpty(reorderTransactionItems)) {
        transactionStatements.push(
          ...objectTransactionStatements(reorderTransactionItems, actionStart)
        );
      }
    }

    // if this is a graph update, do a locking read on the org object
    // and ensure we have the latest graph before proceeding, otherwise
    // throw an error to abort transaction so client can retry
    if (
      auth &&
      (action.type == Api.ActionType.BULK_GRAPH_ACTION ||
        action.meta.loggableType == "orgAction")
    ) {
      const lockedOrg = await getOrg(auth.org.id, transactionConn, true);
      if (!lockedOrg) {
        throw new Api.ApiError("couldn't obtain org write lock", 500);
      }

      if (action.type == Api.ActionType.BULK_GRAPH_ACTION) {
        for (let graphAction of action.payload) {
          const graphApiActionConfig = apiActions[graphAction.type];

          if (
            graphApiActionConfig.graphAction &&
            !graphApiActionConfig.skipGraphUpdatedAtCheck &&
            (
              (graphAction as Api.Action.RequestAction).meta as {
                graphUpdatedAt: number;
              }
            ).graphUpdatedAt !== lockedOrg.graphUpdatedAt
          ) {
            throw new Api.ApiError("client graph outdated", 400);
          }
        }
      } else if (
        apiActionConfig.graphAction &&
        !apiActionConfig.skipGraphUpdatedAtCheck &&
        (action.meta as { graphUpdatedAt: number }).graphUpdatedAt !==
          lockedOrg.graphUpdatedAt
      ) {
        throw new Api.ApiError("client graph outdated", 400);
      }
    }

    try {
      await executeTransactionStatements(
        transactionStatements,
        transactionConn
      );
    } catch (err) {
      log("transaction error:", err);
      throw new Api.ApiError("Transaction failed", 500);
    }

    logWithElapsed(transactionId + " - executed transaction", requestStart);

    if (postUpdateActions) {
      await Promise.all(postUpdateActions.map((fn) => fn()));
    }

    resolveUserSocketUpdates(apiActionConfig, action, auth, clearUserSockets);
    resolveEnvkeySocketUpdates(
      auth,
      updatedGeneratedEnvkeyIds,
      clearEnvkeySockets
    );
    logWithElapsed(transactionId + " - resolved socket updates", requestStart);

    // async s3 replication
    if (replicationFn && auth && updatedOrgGraph) {
      // don't await result, log/alert on error
      logWithElapsed(
        transactionId + " - replicating if needed asynchronously",
        requestStart
      );
      replicationFn(
        updatedOrgGraph[auth.org.id] as Api.Db.Org,
        updatedOrgGraph,
        actionStart
      ).catch((err) => {
        logStderr("Replication error", { err, orgId: auth.org.id });
      });
    }

    if (backgroundStatements.length > 0) {
      logWithElapsed("execute background SQL statements", requestStart);

      // don't await result, log/alert on error
      getNewTransactionConn().then((backgroundConn) => {
        executeTransactionStatements(backgroundStatements, backgroundConn)
          .catch((err) => {
            logStderr("error executing background SQL statements:", {
              err,
              orgId: auth?.org.id,
            });
          })
          .finally(() => backgroundConn.release());
      });
    }

    if (updateOrgStatsFn) {
      // update org stats in background (don't await)
      logWithElapsed("update org stats", requestStart);

      updateOrgStatsFn(
        auth,
        handlerContext,
        requestBytes,
        responseBytes ?? 0,
        Boolean(updatedOrgGraph),
        actionStart
      ).catch((err) => {
        logStderr("Error updating org stats", { err, orgId: auth?.org.id });
      });
    }

    logWithElapsed(transactionId + " - response:", requestStart, {
      error: "error" in response && response.error,
      errorReason: "errorReason" in response ? response.errorReason : undefined,
      status: "errorStatus" in response ? response.errorStatus : 200,
      actionType: action.type,
      responseBytes,
      timestamp: actionStart,
    });

    return response;
  },
  getApiActionForType = (type: Api.ActionType) => {
    return apiActions[type];
  };

let socketServer: Api.SocketServer | undefined;

const apiActions: {
    [type: string]: ApiActionConfig;
  } = {},
  getActionRes = async (
    apiActionConfig: ApiActionConfig,
    action: Api.Action.RequestAction,
    requestParams: Api.RequestParams,
    transactionConn: PoolConnection,
    requestStart: number,
    actionStart: number,
    transactionId: string,
    requestBytes: number,
    auth?: Auth.AuthContext,
    orgGraph?: Api.Graph.OrgGraph,
    isBulkAction?: true
  ) => {
    if (!socketServer) {
      throw new Api.ApiError("Socket server not registered", 500);
    }

    if (
      throttleRequestFn &&
      auth &&
      auth.orgStats &&
      // give enough access in throttling scenarios for the license to be updated
      !(
        action.type == Api.ActionType.UPDATE_LICENSE ||
        action.type == Api.ActionType.FETCH_ORG_STATS ||
        (action.type == Api.ActionType.GET_SESSION &&
          auth.type == "tokenAuthContext" &&
          auth.orgPermissions.has("org_manage_billing"))
      )
    ) {
      await throttleRequestFn(
        auth.orgStats,
        auth.license,
        requestBytes,
        Boolean("blobs" in action.payload && action.payload.blobs)
      );
    }

    // validate payload with zod schema
    let payloadSchema = Api.Net.getSchema(action.type);
    if (!payloadSchema) {
      throw new Api.ApiError("No schema defined for action", 500);
    }
    try {
      // keys / blobs can be large and slow to validate, and they are fully authorized elsewhere -- we will ignore errors for these props
      payloadSchema.parse(R.omit(["keys", "blobs"], action.payload));
    } catch (err) {
      let ignoredPropsOnly = true;
      if ("errors" in err && err.errors?.length) {
        for (let { path } of err.errors) {
          if (!R.equals(path, ["keys"]) && !R.equals(path, ["blobs"])) {
            ignoredPropsOnly = false;
          }
        }
      }
      if (!ignoredPropsOnly) {
        log("Payload failed validation", {
          payloadSchema,
          payload: action.payload,
          err,
        });
        let message = "Invalid payload";
        if ("errors" in err && err.errors?.length) {
          try {
            message +=
              ": " +
              err.errors
                .map(
                  (e: any) =>
                    e.unionErrors.map((u: any) => u.message ?? u) ??
                    e.message ??
                    e
                )
                ?.filter(Boolean)
                ?.join(". ");
          } catch (parseErr) {
            log("Failed simplifying validation errors", {
              payloadSchema,
              payload: action.payload,
              err,
            });
          }
        } else {
          message += ": " + err.message;
        }
        throw new Api.ApiError(message, 422);
      }
    }

    logWithElapsed(transactionId + " - validated schema", requestStart);

    const { ip } = requestParams;

    let updatedOrgGraph: Api.Graph.OrgGraph,
      userGraph: Client.Graph.UserGraph = {} as Client.Graph.UserGraph,
      updatedUserGraph: Client.Graph.UserGraph = {} as Client.Graph.UserGraph;

    if (!auth) {
      if (apiActionConfig.authenticated) {
        throw new Api.ApiError("Auth required", 400);
      }

      const {
        response,
        transactionItems,
        postUpdateActions,
        handlerContext,
        logTargetIds,
        backgroundLogTargetIds,
        responseBytes: handlerResponseBytes,
      } = await apiActionConfig.handler(
        action,
        actionStart,
        requestParams,
        transactionConn
      );

      const targetIds = Array.isArray(logTargetIds)
        ? logTargetIds
        : logTargetIds(response);

      let backgroundTargetIds: string[] | undefined;
      if (backgroundLogTargetIds) {
        backgroundTargetIds = Array.isArray(backgroundLogTargetIds)
          ? backgroundLogTargetIds
          : backgroundLogTargetIds?.(response);
      }

      const responseBytes =
        handlerResponseBytes ??
        Buffer.byteLength(JSON.stringify(response), "utf8");

      let logTransactionStatement: Api.Db.SqlStatement;
      let backgroundLogStatement: Api.Db.SqlStatement | undefined;
      try {
        ({ logTransactionStatement, backgroundLogStatement } =
          getLogTransactionStatement({
            action,
            auth,
            response,
            ip,
            transactionId,
            responseBytes,
            handlerContext,
            targetIds,
            backgroundTargetIds,
            now: actionStart,
          }));
      } catch (err) {
        const { message, code } = err as Api.ApiError;
        throw new Api.ApiError(message, code);
      }

      return {
        response,
        responseBytes,
        logTransactionStatement,
        backgroundLogStatement,
        transactionItems,
        postUpdateActions,
        handlerContext,
      };
    }

    if (!apiActionConfig.authenticated) {
      throw new Api.ApiError("Auth required", 400);
    }

    let authorized: boolean;

    let userGraphDeviceId: string | undefined;
    switch (auth.type) {
      case "tokenAuthContext":
        userGraphDeviceId = auth.orgUserDevice.id;
        break;
      case "inviteAuthContext":
        userGraphDeviceId = auth.invite.id;
        break;
      case "deviceGrantAuthContext":
        userGraphDeviceId = auth.deviceGrant.id;
        break;
      case "recoveryKeyAuthContext":
        userGraphDeviceId = auth.recoveryKey.id;
        break;
    }

    if (apiActionConfig.graphAction) {
      if (!transactionConn) {
        throw new Api.ApiError(
          "Transaction connection required for graph actions",
          500
        );
      }

      if (!orgGraph) {
        throw new Api.ApiError("org graph required for graph action", 500);
      }

      if ("user" in auth) {
        userGraph = getApiUserGraph(
          orgGraph,
          auth.org.id,
          auth.user.id,
          userGraphDeviceId,
          actionStart
        );
        logWithElapsed(transactionId + " - got user graph", requestStart);
      }

      // if there are any pending root pubkey replacements queued in this user's graph, these must be processed before user can make graph updates (enforced client-side too)
      // * only applies to actions with token or cli auth, not actions with invite, device grant, or recovery key auth
      if (
        auth.type == "tokenAuthContext" ||
        auth.type == "cliUserAuthContext"
      ) {
        const { rootPubkeyReplacements } = graphTypes(userGraph);
        if (rootPubkeyReplacements.length > 0) {
          throw new Api.ApiError(
            "root pubkey replacements are pending in client graph--these must be processed prior to graph updates",
            400
          );
        }
      }

      if (apiActionConfig.graphAuthorizer) {
        authorized = await apiActionConfig.graphAuthorizer(
          action,
          orgGraph,
          userGraph,
          auth,
          actionStart,
          requestParams,
          transactionConn
        );
        if (!authorized) {
          log("graphAuthorizer - false", {
            action: action.type,
            transactionId,
          });
        }
      } else {
        authorized = true;
      }

      logWithElapsed(transactionId + " - ran graph authorizer", requestStart);
    } else {
      if (apiActionConfig.authenticated && apiActionConfig.authorizer) {
        authorized = await apiActionConfig.authorizer(
          action,
          auth,
          transactionConn
        );
        if (!authorized) {
          log("handler unauthorized", { action: action.type, transactionId });
        }
      } else {
        authorized = true;
      }
    }

    if (!authorized) {
      throw new Api.ApiError("Unauthorized", 403);
    }

    if (!apiActionConfig.graphAction) {
      const {
          response,
          transactionItems,
          handlerContext,
          postUpdateActions,
          logTargetIds,
          backgroundLogTargetIds,
          responseBytes: handlerResponseBytes,
        } = await apiActionConfig.handler(
          action,
          auth,
          actionStart,
          requestParams,
          transactionConn
        ),
        responseBytes =
          handlerResponseBytes ??
          Buffer.byteLength(JSON.stringify(response), "utf8");

      const targetIds = Array.isArray(logTargetIds)
        ? logTargetIds
        : logTargetIds(response);

      let backgroundTargetIds: string[] | undefined;
      if (backgroundLogTargetIds) {
        backgroundTargetIds = Array.isArray(backgroundLogTargetIds)
          ? backgroundLogTargetIds
          : backgroundLogTargetIds?.(response);
      }

      let logTransactionStatement: Api.Db.SqlStatement;
      let backgroundLogStatement: Api.Db.SqlStatement | undefined;
      try {
        ({ logTransactionStatement, backgroundLogStatement } =
          getLogTransactionStatement({
            action,
            auth,
            updatedUserGraph: (
              response as {
                graph?: Client.Graph.UserGraph;
              }
            ).graph,
            response,
            transactionId,
            ip,
            targetIds,
            backgroundTargetIds,
            responseBytes,
            handlerContext,
            now: actionStart,
          }));
      } catch (err) {
        const { message, code } = err as Api.ApiError;
        throw new Api.ApiError(message, code);
      }

      return {
        response,
        responseBytes,
        logTransactionStatement,
        backgroundLogStatement,
        transactionItems,
        postUpdateActions,
        handlerContext,
      };
    }

    if (!(orgGraph && userGraph)) {
      throw new Api.ApiError("orgGraph and userGraph not loaded", 500);
    }

    let handlerContext: Api.HandlerContext | undefined,
      handlerTransactionItems: Api.Db.ObjectTransactionItems | undefined,
      handlerPostUpdateActions: Api.HandlerPostUpdateActions | undefined,
      handlerEnvs: Api.HandlerEnvsResponse | undefined,
      handlerChangesets: Api.HandlerChangesetsResponse | undefined,
      handlerSignedTrustedRootPubkey: Crypto.SignedData | undefined,
      handlerEncryptedKeysScope: Rbac.OrgAccessScope | undefined,
      handlerLogTargetIds: Api.GraphHandlerResult["logTargetIds"] | undefined,
      handlerBackgroundLogTargetIds:
        | Api.GraphHandlerResult["backgroundLogTargetIds"]
        | undefined,
      handlerUserClearSockets: Api.ClearUserSocketParams[] | undefined,
      handlerEnvkeyClearSockets: Api.ClearEnvkeySocketParams[] | undefined,
      handlerUpdatedGeneratedEnvkeyIds: string[] | undefined,
      handlerResponseBytes: number | undefined;

    if (apiActionConfig.graphHandler) {
      if (!transactionConn) {
        throw new Api.ApiError(
          "Transaction connection required for graph actions",
          500
        );
      }
      const handlerRes = await apiActionConfig.graphHandler(
        action,
        orgGraph,
        auth,
        actionStart,
        requestParams,
        transactionConn,
        socketServer
      );

      logWithElapsed(transactionId + " - ran graph handler", requestStart);

      if (handlerRes.type == "response") {
        const responseBytes =
          handlerRes.responseBytes ??
          Buffer.byteLength(JSON.stringify(handlerRes.response), "utf8");

        const targetIds = Array.isArray(handlerRes.logTargetIds)
          ? handlerRes.logTargetIds
          : handlerRes.logTargetIds(handlerRes.response);

        let backgroundTargetIds: string[] | undefined;
        if (handlerBackgroundLogTargetIds) {
          handlerBackgroundLogTargetIds = Array.isArray(
            handlerRes.backgroundLogTargetIds
          )
            ? handlerRes.backgroundLogTargetIds
            : handlerRes.backgroundLogTargetIds?.(handlerRes.response);
        }

        let logTransactionStatement: Api.Db.SqlStatement;
        let backgroundLogStatement: Api.Db.SqlStatement | undefined;
        try {
          ({ logTransactionStatement, backgroundLogStatement } =
            getLogTransactionStatement({
              action,
              auth,
              previousOrgGraph: orgGraph,
              updatedOrgGraph: orgGraph,
              updatedUserGraph: userGraph!,
              response: handlerRes.response,
              handlerContext: handlerRes.handlerContext,
              ip,
              transactionId,
              targetIds,
              backgroundTargetIds,
              responseBytes,
              now: actionStart,
            }));
        } catch (err) {
          const { message, code } = err as Api.ApiError;
          throw new Api.ApiError(message, code);
        }

        return {
          response: handlerRes.response,
          responseBytes,
          logTransactionStatement,
          backgroundLogStatement,
          transactionItems: handlerRes.transactionItems,
          postUpdateActions: handlerRes.postUpdateActions,
          handlerContext,
        };
      }

      handlerContext = handlerRes.handlerContext;
      handlerTransactionItems = handlerRes.transactionItems;
      handlerPostUpdateActions = handlerRes.postUpdateActions;
      handlerEnvs = handlerRes.envs;
      handlerChangesets = handlerRes.changesets;
      handlerSignedTrustedRootPubkey = handlerRes.signedTrustedRoot;
      handlerEncryptedKeysScope = handlerRes.encryptedKeysScope;
      handlerLogTargetIds = handlerRes.logTargetIds;
      handlerBackgroundLogTargetIds = handlerRes.backgroundLogTargetIds;
      handlerUserClearSockets = handlerRes.clearUserSockets;
      handlerEnvkeyClearSockets = handlerRes.clearEnvkeySockets;
      handlerUpdatedGeneratedEnvkeyIds = handlerRes.updatedGeneratedEnvkeyIds;
      handlerResponseBytes = handlerRes.responseBytes;

      updatedOrgGraph = handlerRes.graph;
    } else {
      updatedOrgGraph = orgGraph;
    }

    let allTransactionItems: Api.Db.ObjectTransactionItems =
      handlerTransactionItems ?? {};

    if (!apiActionConfig.graphScopes) {
      updatedOrgGraph = deleteExpiredAuthObjects(updatedOrgGraph, actionStart);

      logWithElapsed(
        transactionId + " - deletes expired auth objects",
        requestStart
      );

      updatedOrgGraph = clearOrphanedRootPubkeyReplacements(
        updatedOrgGraph,
        actionStart
      );

      logWithElapsed(
        transactionId + " - cleared orphaned pubkey replacements",
        requestStart
      );
    }

    if (
      action.meta.loggableType == "orgAction" &&
      apiActionConfig.shouldClearOrphanedLocals
    ) {
      const clearOrphanedLocalsRes = clearOrphanedLocals(
        updatedOrgGraph,
        actionStart
      );
      updatedOrgGraph = clearOrphanedLocalsRes[0];

      allTransactionItems = mergeObjectTransactionItems([
        allTransactionItems,
        clearOrphanedLocalsRes[1],
      ]);

      logWithElapsed(
        transactionId + " - cleared orphaned locals",
        requestStart
      );
    }

    logWithElapsed(transactionId + " - cleaned up org graph", requestStart);

    if ("user" in auth) {
      updatedUserGraph = getApiUserGraph(
        updatedOrgGraph,
        auth.org.id,
        auth.user.id,
        userGraphDeviceId,
        actionStart
      );
    }

    logWithElapsed(transactionId + " - got updated user graph", requestStart);

    if (
      auth.type != "provisioningBearerAuthContext" &&
      apiActionConfig.graphAuthorizer &&
      (("keys" in action.payload && action.payload.keys) ||
        ("blobs" in action.payload && action.payload.blobs))
    ) {
      authorized = await authorizeEnvsUpdate(
        updatedUserGraph,
        auth,
        action as Api.Action.GraphAction
      );
      if (!authorized) {
        log("env update unauthorized");
        throw new Api.ApiError("Unauthorized", 403);
      }
    }

    let updatedGeneratedEnvkeyIds: string[] =
      handlerUpdatedGeneratedEnvkeyIds ?? [];

    let toDeleteEncryptedKeys: Blob.KeySet | undefined;
    let beforeUpdateCurrentEncryptedKeys: Blob.KeySet | undefined;
    let updatedCurrentEncryptedKeys: Blob.KeySet | undefined;
    if (
      handlerEncryptedKeysScope &&
      orgGraph != updatedOrgGraph &&
      action.type != Api.ActionType.FETCH_ENVS
    ) {
      [beforeUpdateCurrentEncryptedKeys, updatedCurrentEncryptedKeys] =
        await Promise.all([
          asyncify("getCurrentEncryptedKeys", getCurrentEncryptedKeys)(
            orgGraph,
            handlerEncryptedKeysScope,
            actionStart,
            true
          ),
          asyncify("getCurrentEncryptedKeys", getCurrentEncryptedKeys)(
            updatedOrgGraph,
            handlerEncryptedKeysScope,
            actionStart
          ),
        ]);

      logWithElapsed(
        transactionId + " - got current encrypted keys",
        requestStart
      );

      toDeleteEncryptedKeys = keySetDifference(
        beforeUpdateCurrentEncryptedKeys,
        updatedCurrentEncryptedKeys
      );

      logWithElapsed(
        transactionId + " - resolved any encrypted keys that need deletion",
        requestStart
      );

      if (!handlerUpdatedGeneratedEnvkeyIds) {
        // add updated generatedEnvkeyIds from blockKeyableParents
        // either setting new key or deleting
        const ids = new Set<string>();

        if (
          "keys" in action.payload &&
          action.payload.keys &&
          action.payload.keys.blockKeyableParents
        ) {
          for (let blockId in action.payload.keys.blockKeyableParents) {
            for (let keyableParentId in action.payload.keys.blockKeyableParents[
              blockId
            ]) {
              for (let generatedEnvkeyId in action.payload.keys
                .blockKeyableParents[blockId][keyableParentId]) {
                ids.add(generatedEnvkeyId);
              }
            }
          }
        }

        if (toDeleteEncryptedKeys.blockKeyableParents) {
          for (let blockId in toDeleteEncryptedKeys.blockKeyableParents) {
            for (let keyableParentId in toDeleteEncryptedKeys
              .blockKeyableParents[blockId]) {
              for (let generatedEnvkeyId in toDeleteEncryptedKeys
                .blockKeyableParents[blockId][keyableParentId]) {
                ids.add(generatedEnvkeyId);
              }
            }
          }
        }

        updatedGeneratedEnvkeyIds = Array.from(ids);
      }
    }

    if (updatedGeneratedEnvkeyIds.length > 0) {
      updatedOrgGraph = produce(updatedOrgGraph, (draft) => {
        for (let generatedEnvkeyId of updatedGeneratedEnvkeyIds!) {
          (draft[generatedEnvkeyId] as Api.Db.GeneratedEnvkey).blobsUpdatedAt =
            actionStart;
        }
      });

      logWithElapsed(
        transactionId + " - set blobsUpdatedAt on updated generatedEnvkeys",
        requestStart
      );
    }

    let graphTransactionItems =
      action.type == Api.ActionType.FETCH_ENVS || orgGraph == updatedOrgGraph
        ? {}
        : getGraphTransactionItems(orgGraph, updatedOrgGraph, actionStart);

    logWithElapsed(
      transactionId + " - got graph transaction items",
      requestStart
    );

    const hasGraphTransactionItems = !objectTransactionItemsEmpty(
      graphTransactionItems
    );

    logWithElapsed(
      transactionId + " - checked transactions empty",
      requestStart
    );

    if (hasGraphTransactionItems) {
      if (toDeleteEncryptedKeys && !keySetEmpty(toDeleteEncryptedKeys)) {
        const queueBlobsForReencryptionRes =
          queueBlobsForReencryptionFromToDeleteEncryptedKeys(
            auth,
            toDeleteEncryptedKeys,
            updatedOrgGraph,
            actionStart
          );

        if (queueBlobsForReencryptionRes) {
          updatedOrgGraph = queueBlobsForReencryptionRes;
          graphTransactionItems = getGraphTransactionItems(
            orgGraph,
            updatedOrgGraph,
            actionStart
          );
        }

        const deleteEncryptedKeysTransactionItems =
          await getDeleteEncryptedKeysTransactionItems(
            auth,
            orgGraph,
            toDeleteEncryptedKeys
          );

        allTransactionItems = mergeObjectTransactionItems([
          allTransactionItems,
          deleteEncryptedKeysTransactionItems,
        ]);
      }

      if (
        env.NODE_ENV == "development" &&
        updatedCurrentEncryptedKeys &&
        beforeUpdateCurrentEncryptedKeys
      ) {
        // too slow for prod, but good for catching issues with mismatched permissions/envs in dev/testing
        const toRequireEncryptedKeys = keySetDifference(
          updatedCurrentEncryptedKeys,
          beforeUpdateCurrentEncryptedKeys
        );

        logWithElapsed(
          transactionId + " - toRequireEncryptedKeys",
          requestStart
        );

        if (!keySetEmpty(toRequireEncryptedKeys)) {
          try {
            requireEncryptedKeys(
              (action.payload as Api.Net.EnvParams).keys ?? {},
              toRequireEncryptedKeys,
              handlerContext,
              orgGraph
            );
          } catch (err) {
            const { message, code } = err as Api.ApiError;
            throw new Api.ApiError(message, code);
          }
        }
      }

      allTransactionItems = mergeObjectTransactionItems([
        allTransactionItems,
        graphTransactionItems,
      ]);

      logWithElapsed(
        transactionId + " - merged transaction items",
        requestStart
      );

      const toUpdateOrg = updatedOrgGraph[auth.org.id] as Api.Db.Org;

      const updatedOrg = {
        ...toUpdateOrg,
        deviceLikeCount: apiActionConfig.graphScopes
          ? toUpdateOrg.deviceLikeCount
          : getNumActiveDeviceLike(updatedOrgGraph, actionStart),
        graphUpdatedAt: actionStart,
        rbacUpdatedAt: apiActionConfig.rbacUpdate
          ? actionStart
          : auth.org.rbacUpdatedAt,
        updatedAt: actionStart,
      } as Api.Db.Org;

      updatedOrgGraph = { ...updatedOrgGraph, [auth.org.id]: updatedOrg };

      logWithElapsed(transactionId + " - set updated org graph", requestStart);

      allTransactionItems = mergeObjectTransactionItems([
        allTransactionItems,
        {
          updates: [[pick(["pkey", "skey"], updatedOrg), updatedOrg]],
        },
      ]);

      if ("user" in auth) {
        updatedUserGraph = getApiUserGraph(
          updatedOrgGraph,
          auth.org.id,
          auth.user.id,
          userGraphDeviceId,
          actionStart
        );
      }

      logWithElapsed(transactionId + " - got updated user graph", requestStart);

      if (
        auth.type != "provisioningBearerAuthContext" &&
        (("keys" in action.payload && action.payload.keys) ||
          ("blobs" in action.payload && action.payload.blobs))
      ) {
        const envParamsTransactionItems = getEnvParamsTransactionItems(
          auth,
          orgGraph,
          updatedOrgGraph,
          action,
          actionStart,
          handlerContext
        );

        allTransactionItems = mergeObjectTransactionItems([
          allTransactionItems,
          envParamsTransactionItems,
        ]);
      }
    }

    let responseType: Api.GraphResponseType =
        apiActionConfig.graphResponse ?? "diffs",
      deviceId: string;

    if (auth.type == "inviteAuthContext") {
      deviceId = auth.invite.id;
    } else if (auth.type == "deviceGrantAuthContext") {
      deviceId = auth.deviceGrant.id;
    } else if (auth.type == "recoveryKeyAuthContext") {
      deviceId = auth.recoveryKey.id;
    } else if (auth.type == "cliUserAuthContext") {
      deviceId = "cli";
    } else if (auth.type == "tokenAuthContext") {
      deviceId = auth.orgUserDevice.id;
    }

    let response: Api.Net.ApiResult | undefined;
    const graphUpdatedAt = hasGraphTransactionItems
      ? actionStart
      : auth.org.graphUpdatedAt;

    switch (responseType) {
      case "diffs":
        response = {
          type: "graphDiffs",
          diffs: hasGraphTransactionItems
            ? createPatch(userGraph, updatedUserGraph)
            : [],
          graphUpdatedAt,
          timestamp: actionStart,
        };

        break;

      case "graph":
        response = {
          type: "graph",
          graph: updatedUserGraph,
          graphUpdatedAt,
          signedTrustedRoot: handlerSignedTrustedRootPubkey,
          timestamp: actionStart,
        };
        break;

      case "ok":
        response = {
          type: "success",
        };
        break;

      case "scimUserCandidate":
        const { status, scimUserResponse } = handlerContext as Extract<
          Api.HandlerContext,
          { type: Api.ActionType.GET_SCIM_USER }
        >;
        response = {
          status,
          ...scimUserResponse,
        };
        break;

      case "loadedInvite":
      case "loadedDeviceGrant":
      case "loadedRecoveryKey":
      case "envsAndOrChangesets":
        let envEncryptedKeys: Blob.UserEncryptedKeysByEnvironmentIdOrComposite =
            {},
          envBlobs: Blob.UserEncryptedBlobsByComposite = {},
          changesetEncryptedKeys: Blob.UserEncryptedChangesetKeysByEnvironmentId =
            {},
          changesetBlobs: Blob.UserEncryptedBlobsByEnvironmentId = {};

        if (auth.type != "provisioningBearerAuthContext") {
          if (handlerEnvs) {
            if (handlerEnvs.all) {
              [envEncryptedKeys, changesetEncryptedKeys, envBlobs] =
                await Promise.all([
                  getEnvEncryptedKeys(
                    {
                      orgId: auth.org.id,
                      userId: auth.user.id,
                      deviceId: deviceId!,
                      blobType: "env",
                    },
                    { transactionConn }
                  ),
                  getChangesetEncryptedKeys(
                    {
                      orgId: auth.org.id,
                      userId: auth.user.id,
                      deviceId: deviceId!,
                    },
                    { transactionConn }
                  ),
                  getEnvEncryptedBlobs(
                    {
                      orgId: auth.org.id,
                      blobType: "env",
                    },
                    { transactionConn }
                  ),
                ]);
            } else if (handlerEnvs.scopes) {
              [envEncryptedKeys, changesetEncryptedKeys, envBlobs] =
                await Promise.all([
                  Promise.all(
                    handlerEnvs.scopes.map((scope) =>
                      getEnvEncryptedKeys(
                        {
                          orgId: auth.org.id,
                          userId: auth.user.id,
                          deviceId: deviceId!,
                          ...scope,
                        },
                        { transactionConn }
                      )
                    )
                  ).then((encryptedKeys) =>
                    encryptedKeys.reduce(R.mergeDeepRight, {})
                  ),
                  Promise.all(
                    handlerEnvs.scopes.map((scope) =>
                      getChangesetEncryptedKeys(
                        {
                          orgId: auth.org.id,
                          userId: auth.user.id,
                          deviceId: deviceId!,
                          ...scope,
                        },
                        { transactionConn }
                      )
                    )
                  ).then((encryptedKeys) => {
                    return encryptedKeys.reduce(R.mergeDeepRight, {});
                  }),
                  Promise.all(
                    handlerEnvs.scopes.map((scope) =>
                      getEnvEncryptedBlobs(
                        {
                          orgId: auth.org.id,
                          ...scope,
                        },
                        { transactionConn }
                      )
                    )
                  ).then((blobs) => blobs.reduce(R.mergeDeepRight, {})),
                ]);
            }

            envBlobs = pick(Object.keys(envEncryptedKeys), envBlobs);
          }

          if (handlerChangesets) {
            if (handlerChangesets.all) {
              [changesetEncryptedKeys, changesetBlobs] = await Promise.all([
                handlerEnvs && handlerEnvs.all
                  ? changesetEncryptedKeys
                  : getChangesetEncryptedKeys(
                      {
                        orgId: auth.org.id,
                        userId: auth.user.id,
                        deviceId: deviceId!,
                      },
                      { transactionConn }
                    ),
                getChangesetEncryptedBlobs(
                  {
                    orgId: auth.org.id,
                    createdAfter: handlerChangesets.createdAfter,
                  },
                  { transactionConn }
                ),
              ]);
            } else if (handlerChangesets.scopes) {
              [changesetEncryptedKeys, changesetBlobs] = await Promise.all([
                Promise.all(
                  handlerChangesets.scopes.map((scope) =>
                    getChangesetEncryptedKeys(
                      {
                        orgId: auth.org.id,
                        userId: auth.user.id,
                        deviceId: deviceId!,
                        ...scope,
                      },
                      { transactionConn }
                    )
                  )
                ).then((encryptedKeys) => {
                  return encryptedKeys.reduce(
                    R.mergeDeepRight,
                    changesetEncryptedKeys ?? {}
                  );
                }),
                Promise.all(
                  handlerChangesets.scopes.map((scope) =>
                    getChangesetEncryptedBlobs(
                      {
                        orgId: auth.org.id,
                        ...scope,
                      },
                      { transactionConn }
                    )
                  )
                ).then((blobs) => {
                  return blobs.reduce(R.mergeDeepRight, {});
                }),
              ]);
            }
          }
        }

        if (responseType == "envsAndOrChangesets") {
          response = {
            type: "envsAndOrChangesets",
            envs: { keys: envEncryptedKeys, blobs: envBlobs },
            changesets: { keys: changesetEncryptedKeys, blobs: changesetBlobs },
            timestamp: actionStart,
          };
        } else {
          const baseGraphWithEnvsResponse = {
            graph: updatedUserGraph,
            graphUpdatedAt,
            envs: { keys: envEncryptedKeys, blobs: envBlobs },
            changesets: { keys: changesetEncryptedKeys, blobs: changesetBlobs },
            signedTrustedRoot: handlerSignedTrustedRootPubkey,
            timestamp: actionStart,
          };

          if (responseType == "loadedInvite") {
            if (auth.type != "inviteAuthContext") {
              throw new Api.ApiError("Missing invite authentication", 400);
            }

            response = {
              ...baseGraphWithEnvsResponse,
              type: "loadedInvite",
              orgId: auth.org.id,
              invite: pick(
                [
                  "id",
                  "encryptedPrivkey",
                  "pubkey",
                  "invitedByDeviceId",
                  "invitedByUserId",
                  "inviteeId",
                  "deviceId",
                ],
                auth.invite
              ),
            };
          } else if (responseType == "loadedDeviceGrant") {
            if (auth.type != "deviceGrantAuthContext") {
              throw new Api.ApiError(
                "Missing device grant authentication",
                500
              );
            }

            response = {
              ...baseGraphWithEnvsResponse,
              type: "loadedDeviceGrant",
              orgId: auth.org.id,
              deviceGrant: pick(
                [
                  "id",
                  "encryptedPrivkey",
                  "pubkey",
                  "grantedByDeviceId",
                  "grantedByUserId",
                  "granteeId",
                  "deviceId",
                ],
                auth.deviceGrant
              ),
            };
          } else if (
            responseType == "loadedRecoveryKey" &&
            handlerContext &&
            handlerContext.type == Api.ActionType.LOAD_RECOVERY_KEY
          ) {
            response = {
              ...baseGraphWithEnvsResponse,
              type: "loadedRecoveryKey",
              orgId: auth.org.id,
              recoveryKey: pick(
                [
                  "pubkey",
                  "encryptedPrivkey",
                  "userId",
                  "deviceId",
                  "creatorDeviceId",
                ],
                handlerContext.recoveryKey
              ),
            };
          }
        }

        break;

      case "session":
        switch (auth.type) {
          case "tokenAuthContext":
            response = {
              type: "tokenSession",
              token: auth.authToken.token,
              provider: auth.authToken.provider,
              ...pick(["uid", "email", "firstName", "lastName"], auth.user),
              userId: auth.user.id,
              orgId: auth.org.id,
              deviceId: auth.orgUserDevice.id,
              graph: updatedUserGraph,
              graphUpdatedAt,
              signedTrustedRoot: auth.orgUserDevice.signedTrustedRoot,
              timestamp: actionStart,
              ...(env.IS_CLOUD
                ? {
                    hostType: <const>"cloud",
                  }
                : {
                    hostType: <const>"self-hosted",
                    deploymentTag: env.DEPLOYMENT_TAG!,
                  }),
            };
            break;

          case "inviteAuthContext":
          case "deviceGrantAuthContext":
          case "recoveryKeyAuthContext":
            if (
              handlerContext &&
              (handlerContext.type == Api.ActionType.ACCEPT_INVITE ||
                handlerContext.type == Api.ActionType.ACCEPT_DEVICE_GRANT ||
                handlerContext.type == Api.ActionType.REDEEM_RECOVERY_KEY)
            ) {
              response = {
                type: "tokenSession",
                token: handlerContext.authToken.token,
                provider: handlerContext.authToken.provider,
                ...pick(["uid", "email", "firstName", "lastName"], auth.user),
                userId: auth.user.id,
                orgId: auth.org.id,
                deviceId: handlerContext.orgUserDevice.id,
                graph: updatedUserGraph,
                graphUpdatedAt,
                envs: {
                  keys: {},
                  blobs: {},
                },
                timestamp: actionStart,
                ...(env.IS_CLOUD
                  ? {
                      hostType: <const>"cloud",
                    }
                  : {
                      hostType: <const>"self-hosted",
                      deploymentTag: env.DEPLOYMENT_TAG!,
                    }),
              };
            }
            break;
        }
    }
    if (!response) {
      throw new Api.ApiError("response is undefined", 500);
    }

    logWithElapsed(transactionId + " - got response", requestStart);

    const responseBytes =
      handlerResponseBytes ??
      Buffer.byteLength(JSON.stringify(response), "utf8");
    if (
      throttleResponseFn &&
      auth &&
      auth.orgStats &&
      // give enough access in throttling scenarios for the license to be updated
      !(
        action.type == Api.ActionType.UPDATE_LICENSE ||
        action.type == Api.ActionType.FETCH_ORG_STATS ||
        (action.type == Api.ActionType.GET_SESSION &&
          auth.type == "tokenAuthContext" &&
          auth.orgPermissions.has("org_manage_billing"))
      )
    ) {
      await throttleResponseFn(auth.orgStats, auth.license, responseBytes);
    }

    logWithElapsed(transactionId + " - got access updated", requestStart);

    const targetIds = Array.isArray(handlerLogTargetIds)
      ? handlerLogTargetIds
      : handlerLogTargetIds!(response);

    let backgroundTargetIds: string[] | undefined;
    if (handlerBackgroundLogTargetIds) {
      backgroundTargetIds = Array.isArray(handlerBackgroundLogTargetIds)
        ? handlerBackgroundLogTargetIds
        : handlerBackgroundLogTargetIds?.(response);
    }

    let logTransactionStatement: Api.Db.SqlStatement;
    let backgroundLogStatement: Api.Db.SqlStatement | undefined;
    try {
      ({ logTransactionStatement, backgroundLogStatement } =
        getLogTransactionStatement({
          action,
          auth,
          previousOrgGraph: orgGraph,
          updatedOrgGraph,
          updatedUserGraph,
          response: response,
          handlerContext,
          transactionId,
          targetIds,
          backgroundTargetIds,
          ip,
          responseBytes,
          now: actionStart,
        }));
    } catch (err) {
      const { message, code } = err as Api.ApiError;
      throw new Api.ApiError(message, code);
    }

    logWithElapsed(
      transactionId + " - got log transaction items",
      requestStart
    );

    return {
      response,
      responseBytes,
      logTransactionStatement,
      backgroundLogStatement,
      transactionItems: allTransactionItems,
      postUpdateActions: handlerPostUpdateActions,
      clearUserSockets: handlerUserClearSockets,
      clearEnvkeySockets: handlerEnvkeyClearSockets,
      updatedGeneratedEnvkeyIds,
      updatedOrgGraph,
      updatedUserGraph,
      handlerContext,
    };
  },
  resolveUserSocketUpdates = (
    apiActionConfig: ApiActionConfig | undefined,
    action: Api.Action.RequestAction,
    auth: Auth.AuthContext | undefined,
    handlerUserClearSockets: Api.ClearUserSocketParams[]
  ) => {
    if (!auth || !socketServer) {
      return;
    }

    let shouldSendSocketUpdate = false,
      actionTypes: Api.ActionType[],
      userIds: string[] | undefined,
      deviceIds: string[] | undefined;

    if (action.meta.loggableType == "orgAction") {
      shouldSendSocketUpdate = true;
      actionTypes = [action.type];
    } else if (action.type == Api.ActionType.BULK_GRAPH_ACTION) {
      shouldSendSocketUpdate = true;
      actionTypes = action.payload.map(R.prop("type"));
    } else if (
      apiActionConfig &&
      "broadcastOrgSocket" in apiActionConfig &&
      apiActionConfig.broadcastOrgSocket
    ) {
      if (apiActionConfig.broadcastOrgSocket === true) {
        shouldSendSocketUpdate = true;
        actionTypes = [action.type];
      } else {
        const broadcastRes = apiActionConfig.broadcastOrgSocket(action);
        if (typeof broadcastRes == "object") {
          actionTypes = [action.type];
          shouldSendSocketUpdate = true;

          if ("userIds" in broadcastRes) {
            userIds = broadcastRes.userIds;
          } else {
            deviceIds = broadcastRes.deviceIds;
          }
        } else if (broadcastRes === true) {
          actionTypes = [action.type];
          shouldSendSocketUpdate = true;
        }
      }
    }

    let broadcastAdditionalOrgSocketIds: string[] = [];
    if (action.type == Api.ActionType.BULK_GRAPH_ACTION) {
      for (let subAction of action.payload) {
        const subApiActionConfig = apiActions[subAction.type];

        if (
          "broadcastAdditionalOrgSocketIds" in subApiActionConfig &&
          subApiActionConfig.broadcastAdditionalOrgSocketIds
        ) {
          broadcastAdditionalOrgSocketIds =
            broadcastAdditionalOrgSocketIds.concat(
              subApiActionConfig.broadcastAdditionalOrgSocketIds
            );
        }
      }
    } else {
      if (
        apiActionConfig &&
        "broadcastAdditionalOrgSocketIds" in apiActionConfig &&
        apiActionConfig.broadcastAdditionalOrgSocketIds
      ) {
        broadcastAdditionalOrgSocketIds =
          apiActionConfig.broadcastAdditionalOrgSocketIds;
      }
    }

    if (shouldSendSocketUpdate || handlerUserClearSockets.length > 0) {
      // defer these until after response
      setImmediate(() => {
        if (shouldSendSocketUpdate) {
          socketServer!.sendOrgUpdate(
            auth.org.id,
            {
              actionTypes,
              actorId:
                auth.type == "provisioningBearerAuthContext"
                  ? auth.provisioningProvider.id
                  : auth.user.id,
            },
            "orgUserDevice" in auth ? auth.orgUserDevice.id : undefined,
            { userIds, deviceIds }
          );

          if (broadcastAdditionalOrgSocketIds) {
            for (let orgId of broadcastAdditionalOrgSocketIds) {
              socketServer!.sendOrgUpdate(orgId, { actionTypes });
            }
          }
        }
        handlerUserClearSockets.forEach(clearUserSockets);
      });
    }
  },
  resolveEnvkeySocketUpdates = (
    auth: Auth.AuthContext | undefined,
    handlerUpdatedGeneratedEnvkeyIds: string[],
    handlerEnvkeyClearSockets: Api.ClearEnvkeySocketParams[]
  ) => {
    if (!auth || !socketServer) {
      return;
    }

    if (
      handlerUpdatedGeneratedEnvkeyIds.length > 0 ||
      handlerEnvkeyClearSockets.length > 0
    ) {
      setImmediate(() => {
        handlerUpdatedGeneratedEnvkeyIds.forEach((generatedEnvkeyId) =>
          socketServer!.sendEnvkeyUpdate(auth.org.id, generatedEnvkeyId, {
            type: "env_updated",
          })
        );

        handlerEnvkeyClearSockets.forEach(clearEnvkeySockets);
      });
    }
  },
  clearUserSockets = (params: Api.ClearUserSocketParams) => {
    if ("deviceId" in params) {
      socketServer!.clearDeviceSocket(
        params.orgId,
        params.userId,
        params.deviceId
      );
    } else if ("userId" in params) {
      socketServer!.clearUserSockets(params.orgId, params.userId);
    } else {
      socketServer!.clearOrgSockets(params.orgId);
    }
  },
  clearEnvkeySockets = (params: Api.ClearEnvkeySocketParams) => {
    if ("generatedEnvkeyId" in params) {
      socketServer!.clearEnvkeySockets(params.orgId, params.generatedEnvkeyId);
    } else {
      socketServer!.clearOrgEnvkeySockets(params.orgId);
    }
  };

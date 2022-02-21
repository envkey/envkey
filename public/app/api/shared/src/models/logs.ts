import stableStringify from "fast-json-stable-stringify";
import { v4 as uuid } from "uuid";
import * as R from "ramda";
import { Model, Auth, Api, Client, Logs, Rbac } from "@core/types";
import { encryptedBlobParamsToBlobSet } from "../blob";
import { getDeletedOrgGraph } from "../graph";
import {
  getEnvironmentPermissions,
  getUserGraph,
  environmentCompositeId,
  getGroupObjectTypeLabel,
} from "@core/lib/graph";
import { poolQuery } from "../db";
import { objectPaths, pick } from "@core/lib/utils/object";
import moment from "moment";
import { PoolConnection } from "mysql2/promise";
import { log } from "@core/lib/utils/logger";

const MAX_IP_RESULTS = 1000;

type AuthActionProps = {
  orgId: string | undefined;
  actorId: string | undefined;
  deviceId: string | undefined;
};

type ScimActionProps = {
  orgId: string;
  actorId: string;
  deviceId: undefined;
};

type NonAuthActionIdProps = {
  orgId: string;
  actorId: string;
  deviceId: string | undefined;
};

type LogActionParams = {
  action: Api.Action.RequestAction;
  auth?: Auth.AuthContext;
  previousOrgGraph?: Api.Graph.OrgGraph;
  updatedOrgGraph?: Api.Graph.OrgGraph;
  previousUserGraph?: Client.Graph.UserGraph;
  updatedUserGraph?: Client.Graph.UserGraph;
  // accessUpdatedPromise?: Promise<Rbac.OrgAccessUpdated>;
  response: Api.Net.ApiResult;
  handlerContext?: Api.HandlerContext;
  transactionId: string;
  targetIds: string[];
  backgroundTargetIds?: string[];
  ip: string;
  responseBytes: number;
  now: number;
};

export const fetchLogs = async (
    auth: Auth.DefaultAuthContext,
    orgGraph: Api.Graph.OrgGraph,
    params: Logs.FetchLogParams,
    transactionConn: PoolConnection | undefined
  ): Promise<Api.Net.ApiResultTypes["FetchLogs"]> => {
    const pageSize = Math.min(parseInt(params.pageSize as any) ?? 100, 500);
    const startsAt = params.startsAt ?? 0;
    const endsAt = params.endsAt ?? Date.now();
    const sortDir = params.sortDesc ? "DESC" : "ASC";

    if (params.userIds && params.deviceIds) {
      throw new Api.ApiError(
        "only one of userIds and deviceIds can be included in params",
        400
      );
    }

    const promises: ReturnType<typeof getFetchLogsTransactionIdsResults>[] = [];

    if (params.userIds || params.deviceIds) {
      promises.push(
        getFetchLogsTransactionIdsResults(
          auth.org.id,
          params,
          startsAt,
          endsAt,
          pageSize,
          sortDir,
          "actor"
        ),
        getFetchLogsTransactionIdsResults(
          auth.org.id,
          params,
          startsAt,
          endsAt,
          pageSize,
          sortDir,
          "target"
        )
      );
    } else {
      promises.push(
        getFetchLogsTransactionIdsResults(
          auth.org.id,
          params,
          startsAt,
          endsAt,
          pageSize,
          sortDir
        )
      );
    }

    const results = await Promise.all(promises);

    let transactionIds: string[];
    let totalCount: number | undefined;
    let countReachedLimit: boolean | undefined;

    if (results.length > 1) {
      transactionIds = R.sortBy(
        ({ createdAt }) => createdAt * (sortDir == "DESC" ? -1 : 1),
        [...results[0].rows, ...results[1].rows]
      ).map(R.prop("transactionId"));

      totalCount =
        params.pageNum == 0
          ? results[0].totalCount! + results[1].totalCount!
          : undefined;
      countReachedLimit =
        params.pageNum == 0
          ? results[0].countReachedLimit! || results[1].countReachedLimit!
          : undefined;
    } else {
      const [result] = results;
      transactionIds = result.rows.map(R.prop("transactionId")) as string[];
      totalCount = params.pageNum == 0 ? result.totalCount! : undefined;
      countReachedLimit =
        params.pageNum == 0 ? result.countReachedLimit! : undefined;
    }

    if (params.targetIds || params.userIds || params.deviceIds) {
      transactionIds = R.uniq(transactionIds);
      if (transactionIds.length > pageSize) {
        transactionIds = transactionIds.slice(0, pageSize);
      }
    }

    const [logs, deletedGraph, ips] = await Promise.all([
      getLogsWithTransactionIds(transactionIds, sortDir),
      params.pageNum == 0
        ? getDeletedGraph(auth, orgGraph, startsAt, endsAt, transactionConn)
        : Promise.resolve(undefined),
      params.pageNum == 0
        ? getIps(auth.org.id, startsAt, endsAt)
        : Promise.resolve(undefined),
    ]);

    return {
      type: "logs",
      logs,
      totalCount,
      countReachedLimit,
      ips,
      deletedGraph,
    };
  },
  getDeletedGraph = async (
    auth: Auth.DefaultAuthContext,
    orgGraph: Api.Graph.OrgGraph,
    startsAt: number,
    endsAt: number,
    transactionConn: PoolConnection | undefined
  ): Promise<Client.Graph.UserGraph> => {
    const deletedOrgGraph = await getDeletedOrgGraph(
        auth.org.id,
        startsAt,
        endsAt,
        transactionConn
      ),
      mergedOrgGraph = { ...orgGraph, ...deletedOrgGraph },
      mergedUserGraph = getUserGraph(
        mergedOrgGraph,
        auth.user.id,
        auth.type == "tokenAuthContext" ? auth.orgUserDevice.id : undefined,
        true
      );

    return pick(Object.keys(deletedOrgGraph), mergedUserGraph);
  },
  getDeletedGraphForRange = async (
    auth: Auth.DefaultAuthContext,
    orgGraph: Api.Graph.OrgGraph,
    range: { startsAt?: number; endsAt?: number },
    transactionConn: PoolConnection | undefined
  ): Promise<Client.Graph.UserGraph> => {
    const startsAt = range.startsAt ?? 0;
    const endsAt = range.endsAt ?? Date.now();

    return getDeletedGraph(auth, orgGraph, startsAt, endsAt, transactionConn);
  },
  getLogsWithTransactionIds = async (
    transactionIds: string[],
    sortDir: "ASC" | "DESC" = "DESC"
  ) => {
    let logs: Logs.LoggedAction[] = [];
    if (transactionIds.length) {
      const [logRows] = (await poolQuery(
        `SELECT * FROM logs WHERE transactionId IN (?) ORDER BY createdAt ${sortDir};`,
        [transactionIds]
      )) as any[][];
      logs = logRows.map((row) => ({
        ...R.omit(["body"], row),
        ...JSON.parse(row.body),
      }));
    }

    return logs;
  };

const getIps = async (orgId: string, startsAt: number, endsAt: number) => {
    const [rows] = (await poolQuery(
      `SELECT ip FROM ips WHERE orgId = ? AND createdAt <= ? AND lastRequestAt >= ? ORDER BY ip LIMIT ${MAX_IP_RESULTS}`,
      [orgId, endsAt, startsAt]
    )) as [{ ip: string }[], any];

    return rows.map(R.prop("ip"));
  },
  getFetchLogsTransactionIdsResults = async (
    orgId: string,
    params: Logs.FetchLogParams,
    startsAt: number,
    endsAt: number,
    pageSize: number,
    sortDir: "ASC" | "DESC",
    actorOrTarget?: "actor" | "target"
  ) => {
    const table =
      params.targetIds ||
      (actorOrTarget == "target" && (params.userIds || params.deviceIds))
        ? "transaction_ids_by_target_id"
        : "transaction_ids";

    let qs = `SELECT transactionId, createdAt FROM ${table} t`;

    let targetUserDeviceConditions: string[] = [];
    let targetUserDeviceQargs: any[] = [];
    let targetUserDeviceIds: string[] | undefined;

    if (params.userIds) {
      if (actorOrTarget == "actor") {
        targetUserDeviceConditions.push("t.actorId IN (?)");
        targetUserDeviceQargs.push(params.userIds);
      } else if (actorOrTarget == "target") {
        targetUserDeviceConditions.push("t.actorId NOT IN (?)");
        targetUserDeviceQargs.push(params.userIds);
      }
    } else if (params.deviceIds) {
      if (actorOrTarget == "actor") {
        targetUserDeviceConditions.push("t.deviceId IN (?)");
        targetUserDeviceQargs.push(params.deviceIds);
      } else if (actorOrTarget == "target") {
        targetUserDeviceConditions.push("t.deviceId NOT IN (?)");
        targetUserDeviceQargs.push(params.deviceIds);
      }
    }

    if (params.targetIds) {
      if (params.userIds && actorOrTarget == "target") {
        targetUserDeviceConditions.push("t.targetId IN (?)");
        const compoundIds: string[] = [];

        for (let userId of params.userIds) {
          for (let targetId of params.targetIds) {
            // don't use compound id for local override target ids
            const split = targetId.split("|");
            if (split.length == 2) {
              compoundIds.push(targetId);
              continue;
            }
            compoundIds.push(userId + "||" + targetId);
          }
        }
        targetUserDeviceIds = compoundIds;
        targetUserDeviceQargs.push(compoundIds);
      } else if (params.deviceIds && actorOrTarget == "target") {
        targetUserDeviceConditions.push("t.targetId IN (?)");

        const compoundIds: string[] = [];
        for (let deviceId of params.deviceIds) {
          for (let targetId of params.targetIds) {
            compoundIds.push(deviceId + "||" + targetId);
          }
        }
        targetUserDeviceIds = compoundIds;
        targetUserDeviceQargs.push(compoundIds);
      } else {
        targetUserDeviceConditions.push("t.targetId IN (?)");
        targetUserDeviceIds = params.targetIds;
        targetUserDeviceQargs.push(params.targetIds);
      }
    } else if (params.userIds && actorOrTarget == "target") {
      targetUserDeviceConditions.push("t.targetId IN (?)");
      targetUserDeviceIds = params.userIds;
      targetUserDeviceQargs.push(params.userIds);
    } else if (params.deviceIds && actorOrTarget == "target") {
      targetUserDeviceConditions.push("t.targetId IN (?)");
      targetUserDeviceIds = params.deviceIds;
      targetUserDeviceQargs.push(params.deviceIds);
    }

    const { whereClause, qargs } = getFetchLogsWhereClause(
      orgId,
      params,
      startsAt,
      endsAt,
      targetUserDeviceConditions,
      targetUserDeviceQargs
    );

    qs += whereClause + ` ORDER BY createdAt ${sortDir}`;

    const limit =
      table == "transaction_ids_by_target_id" && targetUserDeviceIds
        ? pageSize * targetUserDeviceIds.length
        : pageSize;

    const offset = limit * parseInt(params.pageNum as any);
    const countLimit = Logs.TOTAL_COUNT_LIMIT * (params.targetIds?.length ?? 1);

    qs += ` LIMIT ${limit} OFFSET ${offset}`;

    let countQs = `SELECT COUNT(Distinct sub.transactionId) as totalCount, COUNT(sub.transactionId) >= ${countLimit} as countReachedLimit FROM (SELECT transactionId FROM ${table} t ${whereClause} LIMIT ${countLimit}) AS sub;`;

    const [[rows], [[{ totalCount, countReachedLimit }]]] = (await Promise.all([
      poolQuery(qs, qargs),
      params.pageNum == 0
        ? poolQuery(countQs, qargs)
        : Promise.resolve([[{}]] as any),
    ])) as [any[][], any];

    return {
      rows: rows as { transactionId: string; createdAt: number }[],
      totalCount:
        params.pageNum == 0
          ? Math.min(Logs.TOTAL_COUNT_LIMIT, parseInt(totalCount))
          : undefined,
      countReachedLimit:
        params.pageNum == 0 ? parseInt(countReachedLimit) == 1 : undefined,
    };
  },
  getFetchLogsWhereClause = (
    orgId: string,
    params: Logs.FetchLogParams,
    startsAt: number,
    endsAt: number,
    targetActorDeviceConditions?: string[],
    targetActorDeviceQargs?: any[]
  ) => {
    const conditions: string[] = [];
    const qargs: any[] = [];

    const loggableTypes = params.loggableTypes ?? Logs.ALL_LOGGABLE_TYPES;

    conditions.push(
      "t.loggableType IN (?) OR t.loggableType2 IN (?) OR t.loggableType3 IN (?) OR t.loggableType4 IN (?)"
    );
    qargs.push(loggableTypes, loggableTypes, loggableTypes, loggableTypes);

    const orgIds = params.scope == "host" ? params.orgIds : [orgId];
    let orgCondition = "t.orgId IN (?)";
    if (params.scope == "host") {
      orgCondition += " OR t.orgId IS NULL";
    }
    conditions.push(orgCondition);
    qargs.push(orgIds);

    if (params.actionTypes) {
      conditions.push("t.actionType IN (?)");
      qargs.push(params.actionTypes);
    }

    if (params.clientNames) {
      conditions.push("t.clientName IN (?)");
      qargs.push(params.clientNames);
    }

    if (params.error === true) {
      conditions.push("t.error IS TRUE");
    } else if (params.error === false) {
      conditions.push("t.error IS FALSE");
    }

    if (targetActorDeviceConditions && targetActorDeviceQargs) {
      conditions.push(...targetActorDeviceConditions);
      qargs.push(...targetActorDeviceQargs);
    }

    if (params.ips) {
      conditions.push("t.ip IN (?)");
      qargs.push(params.ips);
    }

    conditions.push("t.createdAt >= ?");
    qargs.push(startsAt);

    conditions.push("t.createdAt <= ?");
    qargs.push(endsAt);

    const whereClause = ` WHERE ${conditions
      .map((cond) => `(${cond})`)
      .join(" AND ")}`;

    return { whereClause, qargs };
  };

const sharedFields = <const>[
    "transactionId",
    "orgId",
    "actorId",
    "deviceId",
    "loggableType",
    "loggableType2",
    "loggableType3",
    "loggableType4",
    "actionType",
    "clientName",
    "ip",
    "createdAt",
  ],
  mainFields = <const>[...sharedFields, "id", "body"],
  transactionIdFields = sharedFields,
  byTargetIdFields = <const>[...sharedFields, "targetId"];

export const getLogTransactionStatement = ({
  action,
  auth,
  previousOrgGraph,
  updatedOrgGraph,
  updatedUserGraph,
  // accessUpdatedPromise,
  response,
  handlerContext,
  targetIds,
  backgroundTargetIds,
  transactionId,
  ip,
  responseBytes,
  now,
}: LogActionParams): {
  logTransactionStatement: Api.Db.SqlStatement;
  backgroundLogStatement?: Api.Db.SqlStatement;
} => {
  let mainQs = "",
    mainQargs: any[] = [],
    bgQs = "",
    bgQargs: any[] = [];

  const loggedActionBase = {
    type: <const>"loggedAction",
    id: uuid(),
    transactionId,
    ip,
    responseBytes,
    responseType: response.type,
    error: "error" in response ? response.error : undefined,
    errorStatus: "errorStatus" in response ? response.errorStatus : undefined,
    errorReason: "errorReason" in response ? response.errorReason : undefined,
    clientName: action.meta.client?.clientName,
    loggableType: action.meta.loggableType,
    createdAt: now,
    updatedAt: now,
  };

  let loggedAction: Logs.LoggedAction | undefined;

  let mainTargetIds = targetIds;
  let bgTargetIds = backgroundTargetIds ? backgroundTargetIds : [];

  if (action.meta.loggableType === "hostAction") {
    loggedAction = {
      actionType: action.type,
      ...loggedActionBase,
      loggableType: <const>"hostAction",
      orgId: undefined,
      actorId: undefined,
      deviceId: undefined,
    };
  } else if (action.meta.loggableType == "authAction") {
    loggedAction = {
      ...loggedActionBase,
      loggableType: <const>"authAction",
      loggableType2:
        "loggableType2" in action.meta ? action.meta.loggableType2 : undefined,
      actionType: (action as Api.Action.AuthAction).type,
      ...authActionProps(
        action as Api.Action.AuthAction,
        response,
        auth as Auth.DefaultAuthContext,
        handlerContext
      ),
    };
  } else if (action.meta.loggableType == "scimAction") {
    loggedAction = {
      ...loggedActionBase,
      loggableType: <const>"scimAction",
      actionType: (action as Api.Action.AuthAction).type,
      ...scimActionProps(auth as Auth.ProvisioningBearerAuthContext),
    };
  } else if (action.meta.loggableType == "fetchEnvkeyAction") {
    if (!handlerContext || handlerContext.type != Api.ActionType.FETCH_ENVKEY) {
      throw new Api.ApiError(
        "handlerContext required for logging fetchEnvkeyAction",
        500
      );
    }

    loggedAction = {
      ...loggedActionBase,
      actionType: Api.ActionType.FETCH_ENVKEY,
      loggableType: <const>"fetchEnvkeyAction",
      orgId: handlerContext.orgId,
      deviceId: handlerContext.deviceId,
      actorId: handlerContext.actorId,
      generatedEnvkeyId: handlerContext.generatedEnvkey.id,
      fetchServiceVersion: parseInt(
        (action as Api.Action.RequestActions["FetchEnvkey"]).meta
          .fetchServiceVersion
      ),
    };
  } else if (action.meta.loggableType == "checkEnvkeyAction") {
    if (!handlerContext || handlerContext.type != Api.ActionType.CHECK_ENVKEY) {
      throw new Api.ApiError(
        "handlerContext required for logging fetchEnvkeyAction",
        500
      );
    }

    loggedAction = {
      ...loggedActionBase,
      actionType: Api.ActionType.CHECK_ENVKEY,
      loggableType: <const>"checkEnvkeyAction",
      loggableType2: <const>"authAction",
      orgId: handlerContext.orgId,
      deviceId: handlerContext.deviceId,
      actorId: handlerContext.actorId,
      generatedEnvkeyId: handlerContext.generatedEnvkey.id,
      fetchServiceVersion: parseInt(
        (action as Api.Action.RequestActions["FetchEnvkey"]).meta
          .fetchServiceVersion
      ),
    };
  } else {
    if (!auth) {
      throw new Api.ApiError("auth required", 500);
    }

    const actionIdProps = nonAuthActionIdProps(auth, handlerContext);

    switch (action.meta.loggableType) {
      case "orgAction":
        if (!(previousOrgGraph && updatedOrgGraph)) {
          throw new Api.ApiError(
            "graph data required for logging graph orgAction",
            500
          );
        }
        let blobsUpdated =
          "blobs" in action.payload
            ? encryptedBlobParamsToBlobSet(
                (action.payload as Api.Net.EnvParams).blobs
              )
            : undefined;

        if (blobsUpdated && Object.keys(blobsUpdated).length == 0) {
          blobsUpdated = undefined;
        }

        loggedAction = {
          ...loggedActionBase,
          ...actionIdProps,
          loggableType: <const>"orgAction",
          loggableType2:
            "loggableType2" in action.meta
              ? action.meta.loggableType2
              : undefined,
          actionType: (action as Api.Action.GraphAction).type,
          blobsUpdated,
        };

        break;

      case "fetchMetaAction":
      case "fetchLogsAction":
        if (!updatedUserGraph) {
          throw new Api.ApiError(
            "graph data required for logging graph fetch actions",
            500
          );
        }
        loggedAction = {
          ...loggedActionBase,
          loggableType2:
            "loggableType2" in action.meta
              ? action.meta.loggableType2
              : undefined,
          ...actionIdProps,
          ...fetchActionProps(
            action as Api.Action.FetchAction,
            auth as Auth.DefaultAuthContext,
            response,
            updatedUserGraph,
            targetIds,
            handlerContext
          ),
        };

        if (
          ("envs" in response && response.envs) ||
          ("changesets" in response && response.changesets)
        ) {
          addLoggableType(loggedAction, "fetchEnvsAction");
        }

        break;
    }
  }

  if (!loggedAction) {
    log(`loggedAction null; action type '${action.type}' not handled`);
    throw new Api.ApiError("action type not handled", 500);
  }

  loggedAction.summary =
    getSummary(
      auth,
      action,
      loggedAction,
      now,
      previousOrgGraph,
      updatedOrgGraph,
      handlerContext
    ) || undefined;

  if (previousOrgGraph && updatedOrgGraph) {
    const compoundTargetIds = getCompoundTargetIds(
      previousOrgGraph,
      updatedOrgGraph,
      mainTargetIds.concat(bgTargetIds)
    );

    if (compoundTargetIds.length > 10) {
      bgTargetIds = bgTargetIds.concat(compoundTargetIds);
    } else {
      mainTargetIds = mainTargetIds.concat(compoundTargetIds);
    }
  }

  mainQs += `INSERT INTO logs (${mainFields.join(", ")}) VALUES (${R.repeat(
    "?",
    mainFields.length
  ).join(", ")});`;

  for (let field of mainFields) {
    if (field == "body") {
      mainQargs.push(JSON.stringify(R.omit(mainFields, loggedAction)));
    } else {
      mainQargs.push(loggedAction[field] ?? null);
    }
  }

  mainQs += `SET ${transactionIdFields
    .map((field) => `@${field} = ?`)
    .join(", ")}; INSERT INTO transaction_ids (${transactionIdFields.join(
    ", "
  )}) VALUES (${transactionIdFields
    .map((field) => `@${field}`)
    .join(", ")}) ON DUPLICATE KEY UPDATE ${transactionIdFields
    .map((field) => `${field} = @${field}`)
    .join(", ")};`;

  for (let field of transactionIdFields) {
    mainQargs.push(loggedAction[field] ?? null);
  }

  const targetQs = `SET ${byTargetIdFields
    .map((field) => `@${field} = ?`)
    .join(
      ", "
    )}; INSERT INTO transaction_ids_by_target_id (${byTargetIdFields.join(
    ", "
  )}) VALUES (${byTargetIdFields
    .map((field) => `@${field}`)
    .join(", ")}) ON DUPLICATE KEY UPDATE ${byTargetIdFields
    .map((field) => `${field} = @${field}`)
    .join(", ")};`;

  for (let targetId of mainTargetIds) {
    mainQs += targetQs;
    for (let field of byTargetIdFields) {
      if (field == "targetId") {
        mainQargs.push(targetId);
      } else {
        mainQargs.push(loggedAction[field] ?? null);
      }
    }
  }

  for (let targetId of bgTargetIds) {
    bgQs += targetQs;
    for (let field of byTargetIdFields) {
      if (field == "targetId") {
        bgQargs.push(targetId);
      } else {
        bgQargs.push(loggedAction[field] ?? null);
      }
    }
  }

  mainQs += `SET @now = ?; INSERT INTO ips (ip, orgId, createdAt, lastRequestAt) VALUES (?, ?, @now, @now) ON DUPLICATE KEY UPDATE lastRequestAt = @now;`;
  mainQargs.push(now, loggedAction.ip, auth?.org.id ?? "");

  return {
    logTransactionStatement: { qs: mainQs, qargs: mainQargs },
    backgroundLogStatement: bgQs ? { qs: bgQs, qargs: bgQargs } : undefined,
  };
};

const fetchActionProps = (
    action: Api.Action.FetchAction,
    auth: Auth.UserAuthContext,
    response: Api.Net.ApiResult,
    updatedUserGraph: Client.Graph.UserGraph,
    targetIds: string[],
    handlerContext?: Api.HandlerContext
  ): Logs.LoggedFetchActionProps => {
    const baseRes = {
      orgId: auth.org.id,
      actorId: auth.user.id,
    };

    let environmentIds: string[] | undefined,
      res: Logs.LoggedFetchActionProps | undefined;

    if (action.type == Api.ActionType.GET_SESSION) {
      res = {
        ...baseRes,
        loggableType: <const>"fetchMetaAction",
        actionType: action.type,
        deviceId:
          auth.type == "tokenAuthContext" ? auth.orgUserDevice.id : undefined,
      };
    } else if (
      action.type == Api.ActionType.LOAD_INVITE ||
      action.type == Api.ActionType.LOAD_DEVICE_GRANT ||
      action.type == Api.ActionType.LOAD_RECOVERY_KEY
    ) {
      if (
        action.type == Api.ActionType.LOAD_INVITE &&
        auth.type == "inviteAuthContext"
      ) {
        res = {
          ...baseRes,
          loggableType: <const>"fetchMetaAction",
          loggableType2: <const>"authAction",
          deviceId: auth.invite.deviceId,
          actionType: action.type,
          inviteId: auth.invite.id,
        };
      } else if (
        action.type == Api.ActionType.LOAD_DEVICE_GRANT &&
        auth.type == "deviceGrantAuthContext"
      ) {
        res = {
          ...baseRes,
          loggableType: <const>"fetchMetaAction",
          loggableType2: <const>"authAction",
          deviceId: auth.deviceGrant.deviceId,
          actionType: action.type,
          deviceGrantId: auth.deviceGrant.id,
        };
      } else if (
        action.type == Api.ActionType.LOAD_RECOVERY_KEY &&
        auth.type == "recoveryKeyAuthContext"
      ) {
        res = {
          ...baseRes,
          loggableType: <const>"fetchMetaAction",
          loggableType2: <const>"authAction",
          deviceId: auth.recoveryKey.deviceId,
          actionType: action.type,
          recoveryKeyId: auth.recoveryKey.id,
        };
      }
    } else if (action.type == Api.ActionType.FETCH_ENVS) {
      res = {
        ...baseRes,
        loggableType: <const>"fetchMetaAction",
        actionType: action.type,
        deviceId:
          auth.type == "tokenAuthContext" ? auth.orgUserDevice.id : undefined,
      };
    } else if (
      action.type == Api.ActionType.FETCH_LOGS ||
      action.type == Api.ActionType.FETCH_DELETED_GRAPH
    ) {
      res = {
        ...baseRes,
        loggableType: <const>"fetchLogsAction",
        actionType: action.type,
        deviceId:
          auth.type == "tokenAuthContext" ? auth.orgUserDevice.id : undefined,
      };
    }

    if (!res) {
      throw new Api.ApiError("fetch action logging action not handled", 500);
    }

    if (environmentIds && environmentIds.length > 0) {
      res.environmentReadPermissions = environmentIds.reduce(
        (agg, environmentId) => {
          const readPermissions = R.intersection(
            ["read", "read_inherits", "read_meta", "read_history"],
            Array.from(
              getEnvironmentPermissions(
                updatedUserGraph,
                environmentId,
                auth.user.id
              )
            )
          ) as Rbac.EnvironmentReadPermission[];

          return readPermissions.length > 0
            ? {
                ...agg,
                [environmentId]: readPermissions,
              }
            : agg;
        },
        {} as Rbac.EnvironmentReadPermissions
      );
    }

    return res;
  },
  nonAuthActionIdProps = (
    auth: Auth.AuthContext,
    handlerContext?: Api.HandlerContext
  ): NonAuthActionIdProps => {
    switch (auth.type) {
      case "tokenAuthContext":
        return {
          orgId: auth.org.id,
          actorId: auth.user.id,
          deviceId: auth.orgUserDevice.id,
        };
      case "cliUserAuthContext":
        return {
          orgId: auth.org.id,
          actorId: auth.user.id,
          deviceId: undefined,
        };
      case "inviteAuthContext":
        return {
          orgId: auth.org.id,
          actorId: auth.user.id,
          deviceId: auth.invite.deviceId,
        };
      case "deviceGrantAuthContext":
        return {
          orgId: auth.org.id,
          actorId: auth.user.id,
          deviceId: auth.deviceGrant.deviceId,
        };
      case "recoveryKeyAuthContext":
        return {
          orgId: auth.org.id,
          actorId: auth.user.id,
          deviceId: auth.recoveryKey.deviceId,
        };
      case "provisioningBearerAuthContext":
        return {
          orgId: auth.provisioningProvider.orgId,
          actorId: auth.provisioningProvider.id,
          deviceId: undefined,
        };
    }
  },
  authActionProps = (
    action: Api.Action.AuthAction,
    response: Api.Net.ApiResult,
    auth?: Auth.DefaultAuthContext,
    handlerContext?: Api.HandlerContext
  ): AuthActionProps => {
    if (action.type == Api.ActionType.REGISTER) {
      const { orgId, deviceId, userId } = response as Api.Net.RegisterResult;
      return {
        orgId,
        deviceId,
        actorId: userId,
      };
    } else if (action.type == Api.ActionType.CREATE_SESSION) {
      const { deviceId, userId } =
        response as Api.Net.ApiResultTypes["CreateSession"];
      return {
        orgId: action.payload.orgId,
        deviceId,
        actorId: userId,
      };
    } else if (action.type == Api.ActionType.AUTHENTICATE_CLI_KEY) {
      const { orgId, userId } =
        response as Api.Net.ApiResultTypes["AuthenticateCliKey"];
      return {
        orgId,
        deviceId: undefined,
        actorId: userId,
      };
    } else if (
      action.type == Api.ActionType.ENVKEY_FETCH_UPDATE_TRUSTED_ROOT_PUBKEY &&
      handlerContext?.type == action.type
    ) {
      return {
        orgId: action.payload.orgId,
        deviceId: undefined,
        actorId: handlerContext.actorId,
      };
    } else if (
      action.type == Api.ActionType.LIST_INVITABLE_SCIM_USERS &&
      auth
    ) {
      return {
        orgId: auth.org.id,
        deviceId:
          auth.type == "tokenAuthContext" ? auth.orgUserDevice.id : undefined,
        actorId: auth.user.id,
      };
    } else if (auth) {
      return {
        orgId: auth.org.id,
        deviceId:
          auth.type == "tokenAuthContext" ? auth.orgUserDevice.id : undefined,
        actorId: auth.user.id,
      };
    }

    throw new Api.ApiError("logging for action type not handled", 500);
  },
  scimActionProps = (
    auth: Auth.ProvisioningBearerAuthContext
  ): ScimActionProps => {
    return {
      orgId: auth.org.id,
      actorId: auth.provisioningProvider.id,
      deviceId: undefined,
    };
  };

const addLoggableType = (
  loggedAction: Logs.LoggedAction,
  loggableType: Logs.LoggableType
) => {
  if (!loggedAction.loggableType2) {
    loggedAction.loggableType2 = loggableType;
    return;
  }
  if (!loggedAction.loggableType3) {
    loggedAction.loggableType3 = loggableType;
    return;
  }
  if (!loggedAction.loggableType4) {
    loggedAction.loggableType4 = loggableType;
    return;
  }

  throw new Error(
    "Limited to a maximum of 4 loggableTypes for index efficiency"
  );
};

const getCompoundTargetIds = (
  previousOrgGraph: Api.Graph.OrgGraph,
  updatedOrgGraph: Api.Graph.OrgGraph,
  targetIds: string[]
): string[] => {
  if (targetIds.length == 0) {
    return [];
  }

  const res: string[] = [];

  const userTargetIds: string[] = [];
  const deviceTargetIds: string[] = [];
  const localsTargetIds: string[] = [];
  const otherTargetIds: string[] = [];

  for (let targetId of targetIds) {
    const split = targetId.split("|");
    if (split.length == 2) {
      localsTargetIds.push(targetId);
      continue;
    }

    const target = updatedOrgGraph[targetId] ?? previousOrgGraph[targetId];
    if (!target) {
      otherTargetIds.push(targetId);
      continue;
    }

    switch (target.type) {
      case "orgUserDevice":
        deviceTargetIds.push(targetId);
        break;
      case "orgUser":
      case "cliUser":
        userTargetIds.push(targetId);
        break;
      default:
        otherTargetIds.push(targetId);
    }
  }

  for (let userTargetId of userTargetIds) {
    for (let otherTargetId of otherTargetIds) {
      res.push(userTargetId + "||" + otherTargetId);
    }
  }

  for (let deviceTargetId of deviceTargetIds) {
    for (let otherTargetId of [...otherTargetIds, ...localsTargetIds]) {
      res.push(deviceTargetId + "||" + otherTargetId);
    }
  }

  return res;
};

const getSummary = (
  auth: Auth.AuthContext | undefined,
  action: Api.Action.RequestAction,
  loggedAction: Logs.LoggedAction,
  now: number,
  previousOrgGraph?: Api.Graph.OrgGraph,
  updatedOrgGraph?: Api.Graph.OrgGraph,
  handlerContext?: Api.HandlerContext
): string | null => {
  /*
    summary string format:

    +verb+ -> converted into past tense when needed (like when action is a success)
    *word* -> bold
    %uuid% -> converted to name of object in graph
  */

  let deviceGrant: Api.Db.DeviceGrant;
  let currentUserId: string;
  let generatedEnvkey: Api.Db.GeneratedEnvkey;
  let keyableParent: Api.Db.KeyableParent;
  let environment: Api.Db.Environment;
  let envParent: Api.Db.EnvParent;
  let paths: string[][];
  let settingsProps: string[];
  let res: string;

  switch (action.type) {
    case Api.ActionType.REGISTER:
      return `+create+ organization *${action.payload.org.name}*`;
    case Api.ActionType.INIT_SELF_HOSTED:
      return "+initialize+ Self-Hosted EnvKey";
    case Api.ActionType.UPGRADE_SELF_HOSTED:
      return "+start+ a Self-Hosted EnvKey upgrade";
    case Api.ActionType.UPGRADE_SELF_HOSTED_FORCE_CLEAR:
      return "+clear+ Self-Hosted EnvKey upgrade state";
    case Api.ActionType.UPDATE_LICENSE:
      return "+update+ the organization's license";
    case Api.ActionType.CREATE_SESSION:
      return "+sign+ in";
    case Api.ActionType.GET_SESSION:
      return "+fetch+ the org graph";
    case Api.ActionType.DELETE_ORG:
      return "+delete+ the organization";
    case Api.ActionType.RENAME_ORG:
      return `+rename+ the organization to *${action.payload.name}*`;
    case Api.ActionType.RENAME_USER:
      return `+rename+ %${action.payload.id}% to *${action.payload.firstName} ${action.payload.lastName}*`;
    case Api.ActionType.CREATE_EXTERNAL_AUTH_SESSION:
    case Api.ActionType.CREATE_EXTERNAL_AUTH_INVITE_SESSION:
      return `+start+ a ${
        Auth.AUTH_PROVIDERS[action.payload.provider]
      } authentication session in order to ${
        Auth.AUTH_TYPE_ACTION_NAMES[action.payload.authType]
      }`;
    case Api.ActionType.GET_EXTERNAL_AUTH_SESSION:
      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }
      return `+check+ the status of a ${
        Auth.AUTH_PROVIDERS[handlerContext.externalAuthSession.provider]
      } while attempting to ${
        Auth.AUTH_TYPE_ACTION_NAMES[handlerContext.externalAuthSession.authType]
      }`;
    case Api.ActionType.GET_EXTERNAL_AUTH_PROVIDERS:
      return `+fetch+ external authentication providers`;
    case Api.ActionType.DELETE_EXTERNAL_AUTH_PROVIDER:
      return `+delete+ external auth provider %${action.payload.id}%`;
    case Api.ActionType.GET_EXTERNAL_AUTH_USERS:
      return null;
    case Api.ActionType.GET_EXTERNAL_AUTH_ORGS:
      return null;
    case Api.ActionType.OAUTH_CALLBACK:
      return null;
    case Api.ActionType.SAML_ACS_CALLBACK:
      return `+process+ SAML authentication callback`;
    case Api.ActionType.CREATE_SCIM_PROVISIONING_PROVIDER:
      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }

      return `+establish+ SCIM connection %${handlerContext.createdId}%`;
    case Api.ActionType.UPDATE_SCIM_PROVISIONING_PROVIDER:
      return `+update+ SCIM connection %${action.payload.id}%`;
    case Api.ActionType.DELETE_SCIM_PROVISIONING_PROVIDER:
      return `+delete+ SCIM connection %${action.payload.id}%`;
    case Api.ActionType.LIST_INVITABLE_SCIM_USERS:
      return `+list+ invitable users from SCIM connection %${action.payload.id}%`;
    case Api.ActionType.CHECK_SCIM_PROVIDER:
      return null;
    case Api.ActionType.CREATE_SCIM_USER:
    case Api.ActionType.UPDATE_SCIM_USER:
      if (!handlerContext) {
        return `+sync+ SCIM connection invitable user`;
      }

      if (handlerContext.type != action.type) {
        throw new Error("invalid handler context");
      }

      return `+sync+ *${[
        handlerContext.scimUserCandidate.firstName,
        handlerContext.scimUserCandidate.lastName,
      ].join(" ")}* from SCIM connection as an invitable user`;

    case Api.ActionType.GET_SCIM_USER:
      if (!handlerContext) {
        return `+fetch+ SCIM connection invitable user`;
      }

      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }

      return `+fetch+ SCIM invitable user ${[
        handlerContext.scimUserCandidate.firstName,
        handlerContext.scimUserCandidate.lastName,
      ].join(" ")}`;
    case Api.ActionType.LIST_SCIM_USERS:
      return `+list+ invitable SCIM users`;

    case Api.ActionType.DELETE_SCIM_USER:
      if (!handlerContext) {
        return `+sync+ SCIM connection invitable user`;
      }

      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }

      if (handlerContext.orgUser) {
        return `+sync+ with SCIM connection and +remove+ %${handlerContext.orgUser.id}% from organization`;
      } else {
        const fullName = [
          handlerContext.scimUserCandidate.firstName,
          handlerContext.scimUserCandidate.lastName,
        ].join(" ");

        return `+sync+ with SCIM connection and +remove+ invitable user *${fullName}*`;
      }
    case Api.ActionType.CREATE_EMAIL_VERIFICATION:
      return `+send+ an email verification code`;
    case Api.ActionType.CHECK_EMAIL_TOKEN_VALID:
      return `+validate+ an email verification code`;
    case Api.ActionType.CLEAR_TOKEN:
      return `+sign+ out`;
    case Api.ActionType.CLEAR_USER_TOKENS:
      return `+sign+ out %${action.payload.userId}% on all devices`;
    case Api.ActionType.CLEAR_ORG_TOKENS:
      return `+sign+ out all users`;
    case Api.ActionType.FORGET_DEVICE:
      return `+forget+ device %${
        (auth as Extract<Auth.AuthContext, { type: "tokenAuthContext" }>)
          .orgUserDevice.id
      }%`;
    case Api.ActionType.CREATE_INVITE:
      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }
      return `+invite+ %${handlerContext.inviteeId}% to the organization with role %${action.payload.user.orgRoleId}%`;
    case Api.ActionType.LOAD_INVITE:
      return `+load+ an invitation sent by %${
        (auth as Extract<Auth.AuthContext, { type: "inviteAuthContext" }>)
          .invite.invitedByUserId
      }%`;
    case Api.ActionType.REVOKE_INVITE:
      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }

      return `+revoke+ an invitation sent by %${handlerContext.invite.invitedByUserId}% to %${handlerContext.invite.inviteeId}%`;
    case Api.ActionType.ACCEPT_INVITE:
      return `+accept+ an invitation sent by %${
        (auth as Extract<Auth.AuthContext, { type: "inviteAuthContext" }>)
          .invite.invitedByUserId
      }%`;
    case Api.ActionType.CREATE_DEVICE_GRANT:
      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }

      currentUserId = (
        auth as Extract<
          Auth.AuthContext,
          { type: "tokenAuthContext" | "cliUserAuthContext" }
        >
      ).user.id;

      return `+generate+ a device invitation ${
        currentUserId == handlerContext.granteeId
          ? "for themself"
          : `for %${handlerContext.granteeId}%`
      }`;
    case Api.ActionType.LOAD_DEVICE_GRANT:
      ({
        user: { id: currentUserId },
        deviceGrant,
      } = auth as Extract<
        Auth.AuthContext,
        { type: "deviceGrantAuthContext" }
      >);

      return `+load+ a device invitation sent by ${
        currentUserId == deviceGrant.grantedByUserId
          ? "themself"
          : `%${deviceGrant.grantedByUserId}%`
      }`;

    case Api.ActionType.REVOKE_DEVICE_GRANT:
      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }

      currentUserId = (
        auth as Extract<
          Auth.AuthContext,
          { type: "tokenAuthContext" | "cliUserAuthContext" }
        >
      ).user.id;

      return `+revoke+ a device invitation sent by %${
        currentUserId == handlerContext.deviceGrant.grantedByUserId
          ? "themself"
          : `%${handlerContext.deviceGrant.grantedByUserId}%`
      }% to ${
        currentUserId == handlerContext.deviceGrant.grantedByUserId
          ? "themself"
          : `%${handlerContext.deviceGrant.grantedByUserId}%`
      }`;

    case Api.ActionType.ACCEPT_DEVICE_GRANT:
      ({
        user: { id: currentUserId },
        deviceGrant,
      } = auth as Extract<
        Auth.AuthContext,
        { type: "deviceGrantAuthContext" }
      >);

      return `+accept+ a device invitation sent by ${
        currentUserId == deviceGrant.grantedByUserId
          ? "themself"
          : `%${deviceGrant.grantedByUserId}%`
      }`;
    case Api.ActionType.REVOKE_DEVICE:
      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }

      currentUserId = (
        auth as Extract<
          Auth.AuthContext,
          { type: "tokenAuthContext" | "cliUserAuthContext" }
        >
      ).user.id;

      return `+revoke+ ${
        currentUserId == handlerContext.device.userId
          ? "their own"
          : `%${handlerContext.device.userId}%'s`
      } device: %${handlerContext.device.id}%`;

    case Api.ActionType.UPDATE_ORG_SETTINGS:
      res = `+update+ org setting `;

      const previousOrgSettings = (previousOrgGraph![auth!.org.id] as Model.Org)
        .settings;

      const newOrgSettings = (updatedOrgGraph![auth!.org.id] as Model.Org)
        .settings;

      paths = R.uniqBy(stableStringify, [
        ...objectPaths(previousOrgSettings),
        ...objectPaths(newOrgSettings),
      ]);

      settingsProps = [];
      for (let path of paths) {
        let previousVal = R.path(path, previousOrgSettings);
        let newVal = R.path(path, newOrgSettings);

        if (newVal != previousVal) {
          settingsProps.push(`*${path.join(".")}* to *${newVal}*`);
        }
      }

      return res + settingsProps.join(", ");

    case Api.ActionType.CREATE_ORG_SAML_PROVIDER:
      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }
      return `+create+ %${handlerContext.createdId}%`;

    case Api.ActionType.UPDATE_ORG_SAML_SETTINGS:
      return `+updated+ %${action.payload.id}%`;

    case Api.ActionType.UPDATE_USER_ROLE:
      return `+change+ %${action.payload.id}%'s org role to %${action.payload.orgRoleId}%`;

    case Api.ActionType.REMOVE_FROM_ORG:
      return `+remove+ %${action.payload.id}% from the organization`;

    case Api.ActionType.CREATE_CLI_USER:
      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }
      return `+generate+ CLI Key %${handlerContext.createdId}% with org role %${action.payload.orgRoleId}%`;

    case Api.ActionType.RENAME_CLI_USER:
      return `+rename+ CLI Key %${action.payload.id}% to *${action.payload.name}*`;

    case Api.ActionType.DELETE_CLI_USER:
      return `+revoke+ CLI Key %${action.payload.id}%`;

    case Api.ActionType.AUTHENTICATE_CLI_KEY:
      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }
      return `+authenticate+ with CLI Key %${handlerContext.cliUser.id}%`;

    case Api.ActionType.CREATE_RECOVERY_KEY:
      return `+generate+ a new recovery key`;

    case Api.ActionType.LOAD_RECOVERY_KEY:
      return `+load+ a recovery key`;

    case Api.ActionType.REDEEM_RECOVERY_KEY:
      return `+redeem+ a recovery key`;

    case Api.ActionType.UPDATE_TRUSTED_ROOT_PUBKEY:
    case Api.ActionType.ENVKEY_FETCH_UPDATE_TRUSTED_ROOT_PUBKEY:
      return `+updated+ trusted root public key`;

    case Api.ActionType.REVOKE_TRUSTED_PUBKEYS:
      return `+revoke+ trusted public keys`;

    case Api.ActionType.CREATE_APP:
      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }

      return `+create+ app %${handlerContext.createdId}%`;

    case Api.ActionType.RENAME_APP:
      return `+rename+ app %${action.payload.id}% to *${action.payload.name}*`;

    case Api.ActionType.UPDATE_APP_SETTINGS:
      res = `+update+ app %${action.payload.id}% setting `;

      const previousAppSettings = (
        previousOrgGraph![action.payload.id] as Model.App
      ).settings;

      const newAppSettings = (updatedOrgGraph![action.payload.id] as Model.App)
        .settings;

      paths = R.uniqBy(JSON.stringify, [
        ...objectPaths(previousAppSettings),
        ...objectPaths(newAppSettings),
      ]);

      settingsProps = [];
      for (let path of paths) {
        let previousVal = R.path(path, previousAppSettings);
        let newVal = R.path(path, newAppSettings);

        if (newVal != previousVal) {
          settingsProps.push(`*${path.join(".")}* to *${newVal}*`);
        }
      }

      return res + settingsProps.join(", ");

    case Api.ActionType.DELETE_APP:
      return `+delete+ app %${action.payload.id}%`;

    case Api.ActionType.GRANT_APP_ACCESS:
      return `+grant+ %${action.payload.userId}% access to app %${action.payload.appId}% with role %${action.payload.appRoleId}%`;

    case Api.ActionType.REMOVE_APP_ACCESS:
      const appUserGrant = previousOrgGraph![
        action.payload.id
      ] as Model.AppUserGrant;

      return `+remove+ %${appUserGrant.userId}%'s access to app %${appUserGrant.appId}%`;

    case Api.ActionType.CREATE_BLOCK:
      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }

      return `+create+ block %${handlerContext.createdId}%`;

    case Api.ActionType.RENAME_BLOCK:
      return `+rename+ block %${action.payload.id}% to *${action.payload.name}*`;

    case Api.ActionType.UPDATE_BLOCK_SETTINGS:
      res = `+update+ block %${action.payload.id}% setting `;

      const previousBlockSettings = (
        previousOrgGraph![action.payload.id] as Model.Block
      ).settings;

      const newBlockSettings = (
        updatedOrgGraph![action.payload.id] as Model.Block
      ).settings;

      paths = R.uniqBy(JSON.stringify, [
        ...objectPaths(previousBlockSettings),
        ...objectPaths(newBlockSettings),
      ]);

      settingsProps = [];
      for (let path of paths) {
        let previousVal = R.path(path, previousBlockSettings);
        let newVal = R.path(path, newBlockSettings);

        if (newVal != previousVal) {
          settingsProps.push(`*${path.join(".")}* to *${newVal}*`);
        }
      }

      return res + settingsProps.join(", ");

    case Api.ActionType.DELETE_BLOCK:
      return `+delete+ block %${action.payload.id}%`;

    case Api.ActionType.CONNECT_BLOCK:
      return `+connect+ block %${action.payload.blockId}% to app %${action.payload.appId}%`;

    case Api.ActionType.DISCONNECT_BLOCK:
      const appBlock = previousOrgGraph![action.payload.id] as Model.AppBlock;

      return `+disconnect+ block %${appBlock.blockId}% from app %${appBlock.appId}%`;

    case Api.ActionType.REORDER_BLOCKS:
      return `+reorder+ blocks for app %${action.payload.appId}%`;

    case Api.ActionType.FETCH_ENVS:
      const envParentIdsByFetchType: Record<string, string[]> = {
        "environments and changesets": [],
        environments: [],
        changesets: [],
      };

      for (let envParentId in action.payload.byEnvParentId) {
        let envs = false;
        let changesets = false;
        if (action.payload.byEnvParentId[envParentId].envs) {
          envs = true;
        }
        if (action.payload.byEnvParentId[envParentId].changesets) {
          changesets = true;
        }
        if (envs && changesets) {
          envParentIdsByFetchType["environments and changesets"].push(
            envParentId
          );
        } else if (envs) {
          envParentIdsByFetchType["environments"].push(envParentId);
        } else if (changesets) {
          envParentIdsByFetchType["changesets"].push(envParentId);
        }
      }

      return `+fetch+ ${Object.keys(envParentIdsByFetchType)
        .map((fetchType) => {
          const envParentIds = envParentIdsByFetchType[fetchType];
          if (envParentIds.length == 0) {
            return "";
          }

          return envParentIds
            .map((id) => {
              const envParent = previousOrgGraph![id] as Model.EnvParent;
              return `${envParent.type} %${id}%`;
            })
            .join(", ");
        })
        .filter(Boolean)
        .join(", ")}`;

    case Api.ActionType.FETCH_ENVKEY:
      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }

      return `+fetch+ %${handlerContext.generatedEnvkey.appId}% > %${handlerContext.generatedEnvkey.environmentId}%`;

    case Api.ActionType.CHECK_ENVKEY:
      return `+look+ up org and app based on ENVKEY auto-detected by the EnvKey CLI`;

    case Api.ActionType.CREATE_VARIABLE_GROUP:
      return null;
    case Api.ActionType.DELETE_VARIABLE_GROUP:
      return null;

    case Api.ActionType.CREATE_SERVER:
      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }
      return `+create+ server %${handlerContext.createdId}%`;

    case Api.ActionType.DELETE_SERVER:
      return `+delete+ server %${action.payload.id}%`;

    case Api.ActionType.CREATE_LOCAL_KEY:
      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }
      return `+create+ local key %${handlerContext.createdId}%`;
    case Api.ActionType.DELETE_LOCAL_KEY:
      return `+delete+ local key %${action.payload.id}%`;

    case Api.ActionType.GENERATE_KEY:
      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }

      generatedEnvkey = updatedOrgGraph![
        handlerContext.createdId
      ] as Api.Db.GeneratedEnvkey;

      keyableParent = updatedOrgGraph![
        generatedEnvkey.keyableParentId
      ] as Api.Db.KeyableParent;

      return `+generate+ ${
        { server: "server", localKey: "local development" }[
          generatedEnvkey.keyableParentType
        ]
      } ENVKEY %${generatedEnvkey.id}% for app %${
        keyableParent.appId
      }%, environment %${keyableParent.environmentId}%`;

    case Api.ActionType.REVOKE_KEY:
      generatedEnvkey = updatedOrgGraph![
        action.payload.id
      ] as Api.Db.GeneratedEnvkey;

      keyableParent = updatedOrgGraph![
        generatedEnvkey.keyableParentId
      ] as Api.Db.KeyableParent;

      return `+revoke+ ${
        { server: "server", localKey: "local development" }[
          generatedEnvkey.keyableParentType
        ]
      } ENVKEY %${generatedEnvkey.id}% for app %${
        keyableParent.appId
      }%, environment %${keyableParent.environmentId}%`;

    case Api.ActionType.FETCH_LOGS:
      return `+fetch+ logs`;

    case Api.ActionType.FETCH_DELETED_GRAPH:
      res = `+fetch+ deleted graph`;
      if (action.payload.startsAt) {
        res += ` for time period: *${moment(action.payload.startsAt).format(
          "MMM D YYYY h:mm:ss.SSS A"
        )}* to *${moment(action.payload.endsAt ?? now).format(
          "MMM D YYYY h:mm:ss.SSS A"
        )}*`;
      }

      return res;

    case Api.ActionType.CREATE_ENVIRONMENT:
      envParent = updatedOrgGraph![
        action.payload.envParentId
      ] as Api.Db.EnvParent;

      return action.payload.isSub
        ? `+create+ branch %${action.payload.subName}% in ${envParent.type} %${envParent.id}%`
        : `+include+ environment %${action.payload.environmentRoleId}% in ${envParent.type} %${envParent.id}%`;

    case Api.ActionType.DELETE_ENVIRONMENT:
      environment = previousOrgGraph![action.payload.id] as Api.Db.Environment;
      envParent = previousOrgGraph![
        environment.envParentId
      ] as Api.Db.EnvParent;

      return environment.isSub
        ? `+delete+ branch %${environment.subName}% from ${envParent.type} %${envParent.id}%`
        : `+remove+ environment %${environment.environmentRoleId}% from ${envParent.type} %${envParent.id}%`;

    case Api.ActionType.UPDATE_ENVIRONMENT_SETTINGS:
      environment = previousOrgGraph![action.payload.id] as Api.Db.Environment;
      envParent = previousOrgGraph![
        environment.envParentId
      ] as Api.Db.EnvParent;

      res = `+update+ ${envParent.type} %${environment.envParentId}% %${environment.id}% setting `;

      const previousEnvironmentSettings = (
        previousOrgGraph![environment.id] as {
          settings: Model.EnvironmentSettings;
        }
      ).settings;

      const newEnvironmentSettings = (
        updatedOrgGraph![environment.id] as {
          settings: Model.EnvironmentSettings;
        }
      ).settings;

      paths = R.uniqBy(stableStringify, [
        ...objectPaths(previousEnvironmentSettings),
        ...objectPaths(newEnvironmentSettings),
      ]);
      settingsProps = [];

      for (let path of paths) {
        let previousVal = R.path(path, previousEnvironmentSettings);
        let newVal = R.path(path, newEnvironmentSettings);

        if (newVal != previousVal) {
          settingsProps.push(`*${path.join(".")}* to *${newVal}*`);
        }
      }

      return res + settingsProps.join(", ");

    case Api.ActionType.RBAC_UPDATE_ENVIRONMENT_ROLE_SETTINGS:
      const environmentRole = previousOrgGraph![
        action.payload.id
      ] as Api.Db.EnvironmentRole;

      res = `+update+ environment role %${environmentRole.id}% setting `;

      const previousEnvironmentRoleSettings = (
        previousOrgGraph![environmentRole.id] as {
          settings: Rbac.EnvironmentRole["settings"];
        }
      ).settings;

      const newEnvironmentRoleSettings = (
        updatedOrgGraph![environmentRole.id] as {
          settings: Rbac.EnvironmentRole["settings"];
        }
      ).settings;

      paths = R.uniqBy(stableStringify, [
        ...objectPaths(previousEnvironmentRoleSettings),
        ...objectPaths(newEnvironmentRoleSettings),
      ]);
      settingsProps = [];

      for (let path of paths) {
        let previousVal = R.path(path, previousEnvironmentRoleSettings);
        let newVal = R.path(path, newEnvironmentRoleSettings);

        if (newVal != previousVal) {
          settingsProps.push(`*${path.join(".")}* to *${newVal}*`);
        }
      }

      return res + settingsProps.join(", ");

    case Api.ActionType.FETCH_ORG_STATS:
      return `+refresh+ cloud resource usage stats`;

    case Api.ActionType.CREATE_GROUP:
      if (handlerContext?.type != action.type) {
        throw new Error("invalid handler context");
      }
      return `+create+ ${getGroupObjectTypeLabel(
        updatedOrgGraph!,
        handlerContext.createdId
      )} %${handlerContext.createdId}%`;
    case Api.ActionType.DELETE_GROUP:
      return `+delete+ ${getGroupObjectTypeLabel(
        updatedOrgGraph!,
        action.payload.id
      )} %${action.payload.id}%`;
    case Api.ActionType.RENAME_GROUP:
      return `+rename+ ${getGroupObjectTypeLabel(
        updatedOrgGraph!,
        action.payload.id
      )} %${action.payload.id}%`;
    case Api.ActionType.CREATE_GROUP_MEMBERSHIP:
      return `+add+ %${action.payload.objectId}% to ${getGroupObjectTypeLabel(
        updatedOrgGraph!,
        action.payload.groupId
      )} %${action.payload.groupId}%`;

    case Api.ActionType.DELETE_GROUP_MEMBERSHIP:
      const membership = previousOrgGraph![
        action.payload.id
      ] as Model.GroupMembership;

      return `+remove+ %${membership.objectId}% from ${getGroupObjectTypeLabel(
        updatedOrgGraph!,
        membership.groupId
      )} %${membership.groupId}%`;

    case Api.ActionType.REORDER_GROUP_MEMBERSHIPS:
      return `+reorder+ block group %${action.payload.blockGroupId}% memberships`;

    case Api.ActionType.CREATE_APP_USER_GROUP:
      return `+add+ team %${action.payload.userGroupId}% to app %${action.payload.appId}%`;
    case Api.ActionType.DELETE_APP_USER_GROUP:
      const appUserGroup = previousOrgGraph![
        action.payload.id
      ] as Model.AppUserGroup;

      return `+remove+ team %${appUserGroup.userGroupId}% to app %${appUserGroup.appId}%`;

    case Api.ActionType.SELF_HOSTED_RESYNC_FAILOVER:
      return `+resynchronize+ failover S3 buckets`;

    case Api.ActionType.UPDATE_ENVS:
      return null; // handled by LogEnvsUpdated component

    case Api.ActionType.REENCRYPT_ENVS:
      return null; // handled by LogEnvsUpdated component

    case Api.ActionType.RBAC_CREATE_ORG_ROLE:
      return null;
    case Api.ActionType.RBAC_DELETE_ORG_ROLE:
      return null;
    case Api.ActionType.RBAC_UPDATE_ORG_ROLE:
      return null;

    case Api.ActionType.RBAC_CREATE_ENVIRONMENT_ROLE:
      return null;
    case Api.ActionType.RBAC_DELETE_ENVIRONMENT_ROLE:
      return null;
    case Api.ActionType.RBAC_UPDATE_ENVIRONMENT_ROLE:
      return null;
    case Api.ActionType.RBAC_REORDER_ENVIRONMENT_ROLES:
      return null;
    case Api.ActionType.RBAC_CREATE_APP_ROLE:
      return null;
    case Api.ActionType.RBAC_DELETE_APP_ROLE:
      return null;
    case Api.ActionType.RBAC_UPDATE_APP_ROLE:
      return null;
    case Api.ActionType.RBAC_CREATE_INCLUDED_APP_ROLE:
      return null;
    case Api.ActionType.DELETE_INCLUDED_APP_ROLE:
      return null;

    case Api.ActionType.CREATE_APP_GROUP_USER_GROUP:
      return null;
    case Api.ActionType.DELETE_APP_GROUP_USER_GROUP:
      return null;
    case Api.ActionType.CREATE_APP_GROUP_USER:
      return null;
    case Api.ActionType.DELETE_APP_GROUP_USER:
      return null;
    case Api.ActionType.CREATE_APP_BLOCK_GROUP:
      return null;
    case Api.ActionType.DELETE_APP_BLOCK_GROUP:
      return null;
    case Api.ActionType.REORDER_APP_BLOCK_GROUPS:
      return null;
    case Api.ActionType.CREATE_APP_GROUP_BLOCK:
      return null;
    case Api.ActionType.DELETE_APP_GROUP_BLOCK:
      return null;
    case Api.ActionType.REORDER_APP_GROUP_BLOCKS:
      return null;
    case Api.ActionType.CREATE_APP_GROUP_BLOCK_GROUP:
      return null;
    case Api.ActionType.DELETE_APP_GROUP_BLOCK_GROUP:
      return null;
    case Api.ActionType.REORDER_APP_GROUP_BLOCK_GROUPS:
      return null;

    case Api.ActionType.BULK_GRAPH_ACTION:
      return null;
  }
};

export const getFetchActionLogTargetIdsFn =
  (orgGraph: Api.Graph.OrgGraph) => (response: Api.Net.ApiResult) => {
    const { envs, changesets } = response as Api.Net.EnvsAndOrChangesetsResult;

    const ids = new Set<string>();
    for (let environmentId of Object.keys(envs.blobs).concat(
      Object.keys(changesets.blobs)
    )) {
      const environment = orgGraph[environmentId] as
        | Model.Environment
        | undefined;

      if (environment) {
        ids.add(environment.envParentId);
      } else {
        const [envParentId, localsUserId] = environmentId.split("|");
        ids.add(envParentId);
      }
    }
    return Array.from(ids);
  };

export const getFetchActionBackgroundLogTargetIdsFn =
  (orgGraph: Api.Graph.OrgGraph) => (response: Api.Net.ApiResult) => {
    const { envs, changesets } = response as Api.Net.EnvsAndOrChangesetsResult;

    const ids = new Set<string>();
    for (let environmentId of Object.keys(envs.blobs).concat(
      Object.keys(changesets.blobs)
    )) {
      const environment = orgGraph[environmentId] as
        | Model.Environment
        | undefined;

      if (environment) {
        ids.add(environment.environmentRoleId);
        if (environment.isSub) {
          ids.add(environmentCompositeId(environment));
        }
      } else {
        const [envParentId, localsUserId] = environmentId.split("|");
        ids.add("locals");
        ids.add(localsUserId);
      }
    }
    return Array.from(ids);
  };

import { apiAction } from "../handler";
import { Api, Logs } from "@core/types";
import { fetchLogs, getDeletedGraphForRange } from "../models/logs";
import { authz } from "@core/lib/graph";

apiAction<
  Api.Action.RequestActions["FetchLogs"],
  Api.Net.ApiResultTypes["FetchLogs"]
>({
  type: Api.ActionType.FETCH_LOGS,
  authenticated: true,
  graphAction: true,
  skipGraphUpdatedAtCheck: true,
  graphAuthorizer: async ({ payload }, orgGraph, userGraph, auth) =>
    authz.canFetchLogs(userGraph, auth.user.id, auth.org.id, payload),
  graphHandler: async (
    action,
    orgGraph,
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    const response = await fetchLogs(
      auth,
      orgGraph,
      action.payload,
      transactionConn,
      now
    );

    const targetIds = [
      ...(action.payload.targetIds ?? []),
      ...(action.payload.userIds ?? []),
    ];

    return {
      type: "response",
      response,
      logTargetIds: targetIds.length < 5 ? targetIds : [],
      backgroundLogTargetIds: targetIds.length < 5 ? undefined : targetIds,
    };
  },
});

apiAction<
  Api.Action.RequestActions["FetchDeletedGraph"],
  Api.Net.ApiResultTypes["FetchDeletedGraph"]
>({
  type: Api.ActionType.FETCH_DELETED_GRAPH,
  authenticated: true,
  graphAction: true,
  skipGraphUpdatedAtCheck: true,
  graphAuthorizer: async ({ payload }, orgGraph, userGraph, auth) => {
    // graph is filtered for permitted objects
    return true;
  },
  graphHandler: async (
    { payload },
    orgGraph,
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    const deletedGraph = await getDeletedGraphForRange(
      auth,
      orgGraph,
      payload,
      transactionConn
    );

    return {
      type: "response",
      response: {
        type: "deletedGraph",
        deletedGraph,
      },
      logTargetIds: [],
    };
  },
});

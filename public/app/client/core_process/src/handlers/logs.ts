import * as R from "ramda";
import { Client, Api } from "@core/types";
import { clientAction } from "../handler";
import { log } from "@core/lib/utils/logger";

clientAction<Client.Action.ClientActions["ClearLogs"]>({
  type: "clientAction",
  actionType: Client.ActionType.CLEAR_LOGS,
  stateProducer: (draft) => {
    draft.loggedActionsWithTransactionIds = [];
    draft.deletedGraph = {};
    draft.logIps = [];
    delete draft.fetchLogParams;
    delete draft.fetchLogsError;
    delete draft.logsTotalCount;
  },
});

clientAction<
  Api.Action.RequestActions["FetchLogs"],
  Api.Net.ApiResultTypes["FetchLogs"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.FETCH_LOGS,
  authenticated: true,
  loggableType: "fetchLogsAction",
  stateProducer: (draft, { payload }) => {
    draft.isFetchingLogs = true;
    delete draft.fetchLogsError;
    const params = R.omit(["pageNum"], payload);

    if (
      payload.pageNum == 0 &&
      draft.fetchLogParams &&
      !R.equals(draft.fetchLogParams, params)
    ) {
      draft.loggedActionsWithTransactionIds = [];
      delete draft.logsTotalCount;
      delete draft.logsCountReachedLimit;
    }
  },
  successStateProducer: (
    draft,
    {
      payload,
      meta: {
        rootAction: { payload: rootPayload },
      },
    }
  ) => {
    draft.loggedActionsWithTransactionIds = [
      ...draft.loggedActionsWithTransactionIds,
      ...R.toPairs(R.groupBy(R.prop("transactionId"), payload.logs)),
    ];

    if (rootPayload.pageNum == 0) {
      const params = R.omit(["pageNum"], rootPayload);

      draft.logsTotalCount = payload.totalCount;
      draft.logsCountReachedLimit = payload.countReachedLimit;

      draft.deletedGraph = payload.deletedGraph ?? {};
      draft.logIps = payload.ips ?? [];
      draft.fetchLogParams = params;
    }
  },
  failureStateProducer: (draft, { payload }) => {
    draft.fetchLogsError = payload;
    draft.deletedGraph = {};
    draft.logIps = [];
  },
  endStateProducer: (draft) => {
    delete draft.isFetchingLogs;
  },
});

clientAction<
  Api.Action.RequestActions["FetchDeletedGraph"],
  Api.Net.ApiResultTypes["FetchDeletedGraph"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.FETCH_DELETED_GRAPH,
  authenticated: true,
  loggableType: "fetchLogsAction",
  stateProducer: (draft, { payload }) => {
    draft.isFetchingDeletedGraph = true;
    delete draft.fetchDeletedGraphError;
  },
  successStateProducer: (draft, { payload }) => {
    draft.deletedGraph = { ...draft.deletedGraph, ...payload.deletedGraph };
  },
  failureStateProducer: (draft, { payload }) => {
    draft.fetchDeletedGraphError = payload;
  },
  endStateProducer: (draft) => {
    delete draft.isFetchingDeletedGraph;
  },
});

import { sha256 } from "@core/lib/crypto/utils";
import { clearOrphanedEnvUpdatesProducer } from "@core/lib/client/blob";
import { getEnvironmentsQueuedForReencryptionIds } from "@core/lib/graph";
import {
  getBlobParamsEnvParentIds,
  getBlobParamsEnvironmentAndLocalIds,
} from "@core/lib/blob";
import { v4 as uuid } from "uuid";
import { postApiAction } from "./lib/actions";
import { Client, Auth, Api, Blob } from "@core/types";
import * as R from "ramda";
import produce from "immer";
import { Reducer } from "redux";
import { getDefaultStore } from "./redux_store";
import { pick } from "@core/lib/utils/pick";
import { applyPatch } from "rfc6902";
import { log } from "@core/lib/utils/logger";
import { wait } from "@core/lib/utils/wait";
import { getState, waitForStateCondition } from "./lib/state";
import {
  clearRevokedOrOutdatedSessionPubkeys,
  processRevocationRequestsIfNeeded,
  processRootPubkeyReplacementsIfNeeded,
  verifyCurrentUser,
  verifyOrgKeyable,
} from "./lib/trust";
import {
  keySetForGraphProposal,
  requiredEnvsForKeySet,
  fetchRequiredEnvs,
  encryptedKeyParamsForKeySet,
} from "./lib/envs";
import {
  getAuth,
  getApiAuthParams,
  hasPendingConflicts,
} from "@core/lib/client";
import { env } from "../../shared/src/env";
import { inspect } from "util";

const OUTDATED_GRAPH_REFRESH_MAX_JITTER_MS = 200;

const actions: {
  [type: string]: Client.ActionParams;
} = {};

export const clientAction = <
    ActionType extends Client.Action.EnvkeyAction = Client.Action.EnvkeyAction,
    SuccessType = any,
    FailureType = Client.ClientError,
    DispatchContextType = any,
    RootActionType extends Client.Action.EnvkeyAction = ActionType
  >(
    params: Client.ActionParams<
      ActionType,
      SuccessType,
      FailureType,
      DispatchContextType,
      RootActionType
    >
  ) => {
    if (actions[params.actionType]) {
      throw new Error("A client action with this type was already defined");
    }

    actions[params.actionType] = params as Client.ActionParams;
  },
  getActionParams = (type: Client.Action.EnvkeyAction["type"]) => {
    const params = actions[type as string];
    if (!params) {
      throw new TypeError(
        `Unexpected Client Action when fetching Action Params! This probably means a configuration error has occurred.`
      );
    }
    return params;
  },
  dispatch = async <
    ActionType extends Client.Action.EnvkeyAction,
    DispatchContextType = any
  >(
    action: Client.Action.DispatchAction<ActionType>,
    context: Client.Context<DispatchContextType>
  ): Promise<Client.DispatchResult> => {
    const store = context.store ?? getDefaultStore(),
      actionParams = actions[action.type],
      tempId = uuid();

    let accountState = getState(store, context);

    if (env.ENVKEY_CORE_DISPATCH_DEBUG_ENABLED === "1") {
      log(`debug:dispatch(${inspect(action, { depth: 2 })})`);
    }
    if (!actionParams) {
      log(
        "WARNING: no actionParams for action - did you forget to add a clientAction<>?",
        action
      );
    }

    if (
      actionParams &&
      "serialAction" in actionParams &&
      actionParams.serialAction &&
      !context.skipWaitForSerialAction &&
      accountState.isDispatchingSerialAction
    ) {
      await waitForStateCondition(
        store,
        context,
        (state) => !state.isDispatchingSerialAction
      );
    }

    const handleSuccess = getHandleSuccess(actionParams, action, store, tempId),
      handleFailure = getHandleFailure(actionParams, action, store, tempId);

    if (actionParams.type == "clientAction") {
      const clientAction = action as Client.Action.ClientAction;

      dispatchStore<DispatchContextType>(clientAction, context, tempId, store);

      accountState = getState(store, context);

      if (actionParams.handler) {
        await (actionParams.handler as Client.ActionHandler)(
          accountState,
          clientAction,
          context
        );
      }

      return {
        success: true,
        resultAction: clientAction,
        state: getState(store, context),
      };
    } else if (actionParams.type == "asyncClientAction") {
      const clientAction = action as Client.Action.ClientAction;

      dispatchStore<DispatchContextType>(clientAction, context, tempId, store);

      accountState = getState(store, context);

      const dispatchSuccess: Parameters<Client.AsyncActionHandler>[2]["dispatchSuccess"] =
          async (successPayload, handlerOpts) => {
            try {
              const handleSuccessRes = await handleSuccess(
                clientAction,
                successPayload,
                handlerOpts
              );
              return handleSuccessRes;
            } catch (error) {
              return handleFailure(clientAction, error, handlerOpts);
            }
          },
        dispatchFailure: Parameters<Client.AsyncActionHandler>[2]["dispatchFailure"] =
          async (failurePayload, handlerOpts) => {
            return handleFailure(clientAction, failurePayload, handlerOpts);
          };

      if (actionParams.apiActionCreator) {
        if (actionParams.bulkApiDispatcher) {
          let error: Client.ClientError | Error | undefined;

          const now = Date.now(),
            clientParams = (action as any).payload as any[],
            apiActions = await Promise.all(
              clientParams.map((params) =>
                actionParams.apiActionCreator!(params, accountState, context)
              )
            ).then((a) => a.map(R.prop("action"))),
            fullKeySet = apiActions
              .map((apiAction) => {
                const apiActionParams = actions[apiAction.type];

                if (
                  !apiActionParams ||
                  !("graphProposer" in apiActionParams) ||
                  !apiActionParams.graphProposer
                ) {
                  return { type: "keySet" } as Blob.KeySet;
                }

                return keySetForGraphProposal(
                  accountState.graph,
                  now,
                  (graphDraft) => {
                    if (
                      !apiActionParams ||
                      !("graphProposer" in apiActionParams) ||
                      !apiActionParams.graphProposer
                    ) {
                      return;
                    }
                    apiActionParams.graphProposer(
                      apiAction as Api.Action.RequestAction,
                      accountState,
                      context
                    )(graphDraft);
                  },
                  apiActionParams.encryptedKeysScopeFn?.(
                    accountState.graph,
                    apiAction as Api.Action.RequestAction
                  )
                );
              })
              .reduce(R.mergeDeepRight, { type: "keySet" } as Blob.KeySet),
            { requiredEnvs, requiredChangesets } = requiredEnvsForKeySet(
              accountState.graph,
              fullKeySet
            ),
            fetchRes = await fetchRequiredEnvs(
              accountState,
              requiredEnvs,
              requiredChangesets,
              context
            );

          let stateWithFetched: Client.State | undefined;
          if (fetchRes) {
            if (fetchRes.success) {
              stateWithFetched = fetchRes.state;
            } else {
              error = (fetchRes.resultAction as Client.Action.FailureAction)
                .payload;
            }
          } else {
            stateWithFetched = accountState;
          }

          if (!error) {
            try {
              let promises: Promise<Api.Action.RequestAction>[] = [];

              for (let apiAction of apiActions) {
                const apiActionParams = actions[apiAction.type];
                if (
                  !apiActionParams ||
                  !("graphProposer" in apiActionParams) ||
                  !apiActionParams.graphProposer
                ) {
                  promises.push(
                    Promise.resolve(apiAction as Api.Action.RequestAction)
                  );
                  continue;
                }

                const graphProducer = apiActionParams.graphProposer(
                    apiAction as Api.Action.RequestAction,
                    stateWithFetched!,
                    context
                  ),
                  toSet = keySetForGraphProposal(
                    stateWithFetched!.graph,
                    now,
                    graphProducer,
                    apiActionParams.encryptedKeysScopeFn?.(
                      accountState.graph,
                      apiAction as Api.Action.RequestAction
                    )
                  );

                promises.push(
                  encryptedKeyParamsForKeySet({
                    state: {
                      ...stateWithFetched!,
                      graph: produce(stateWithFetched!.graph, graphProducer),
                    },
                    context,
                    toSet,
                  }).then((envParams) => {
                    const res = {
                      ...apiAction,
                      payload: {
                        ...apiAction.payload,
                        ...envParams,
                      },
                    } as Api.Action.RequestAction;

                    return res;
                  })
                );
              }

              const withEnvs = await Promise.all(promises);

              const res = await dispatch<Api.Action.BulkGraphAction>(
                {
                  type: Api.ActionType.BULK_GRAPH_ACTION,
                  payload: withEnvs.map((apiAction) => ({
                    ...apiAction,
                    meta: {
                      loggableType: "orgAction",
                      graphUpdatedAt: stateWithFetched!.graphUpdatedAt,
                    },
                  })) as Api.Action.BulkGraphAction["payload"],
                },
                {
                  ...context,
                  rootClientAction: action as Client.Action.ClientAction,
                }
              );

              if (res.success && res.retriedWithUpdatedGraph) {
                return res;
              }

              if (res.success) {
                const successPayload = actionParams.apiSuccessPayloadCreator
                  ? await actionParams.apiSuccessPayloadCreator(res)
                  : (res.resultAction as any).payload;
                return dispatchSuccess(successPayload, context);
              } else {
                return dispatchFailure(
                  (res.resultAction as any).payload,
                  context
                );
              }
            } catch (err) {
              error = err;
            }
          }

          if (error) {
            const failurePayload =
              error instanceof Error
                ? {
                    type: <const>"clientError",
                    error,
                  }
                : error;

            return dispatchFailure(failurePayload, context);
          }
        } else {
          const { action: apiAction, dispatchContext } =
              await actionParams.apiActionCreator(
                (action as Api.Action.RequestAction).payload,
                accountState,
                context
              ),
            apiRes = await dispatch(apiAction as Api.Action.RequestAction, {
              ...context,
              ...(dispatchContext ? { dispatchContext } : {}),
              rootClientAction: action as Client.Action.ClientAction,
            });

          if (apiRes.success && apiRes.retriedWithUpdatedGraph) {
            return apiRes;
          }

          if (apiRes.success) {
            const successPayload = actionParams.apiSuccessPayloadCreator
              ? await actionParams.apiSuccessPayloadCreator(
                  apiRes,
                  dispatchContext
                )
              : (apiRes.resultAction as any).payload;

            return dispatchSuccess(successPayload, context);
          } else {
            const failureAction =
              apiRes.resultAction as Client.Action.FailureAction;
            return dispatchFailure(
              failureAction.payload as Api.Net.ErrorResult,
              context
            );
          }
        }
      } else if (actionParams.handler) {
        const handlerRes = await (
          actionParams.handler as Client.AsyncActionHandler
        )(accountState, clientAction, {
          context,
          dispatchSuccess,
          dispatchFailure,
        });

        return handlerRes;
      } else {
        return {
          success: true,
          resultAction: clientAction,
          state: getState(store, context),
        };
      }
    } else if (actionParams.type == "apiRequestAction") {
      if (actionParams.bulkDispatchOnly) {
        throw new Error(
          "Cannot be dispatched directly, only as part of BULK_GRAPH_ACTION"
        );
      }

      if (!context) {
        throw new Error("clientContext required for apiRequestAction");
      }

      accountState = getState(store, context);

      let apiAuthParams: Auth.ApiAuthParams | undefined = context.auth,
        accountIdOrCliKey = context.accountIdOrCliKey,
        accountAuth = getAuth(accountState, accountIdOrCliKey);

      const hostUrl = context.hostUrl ?? accountAuth?.hostUrl;

      if (actionParams.authenticated && !apiAuthParams) {
        if (!accountAuth) {
          log("CORE PROC HANDLER  - Action requires authentication err.", {
            actionParams,
            apiAuthParams,
          });
          throw new Error("Action requires authentication.");
        }
        apiAuthParams = getApiAuthParams(accountAuth);
      }

      const meta = {
        ...pick(
          ["loggableType", "loggableType2", "loggableType3", "loggableType4"],
          actionParams
        ),
        auth: apiAuthParams,
        client: context.client,
        graphUpdatedAt: actionParams.graphAction
          ? accountState.graphUpdatedAt
          : undefined,
      } as Api.Action.RequestAction["meta"];

      let payload = (
          action as Client.Action.DispatchAction<Api.Action.RequestAction>
        ).payload,
        requestAction = {
          ...(action as Client.Action.DispatchAction<Api.Action.RequestAction>),
          payload,
          meta,
        } as Api.Action.RequestAction;

      dispatchStore<DispatchContextType>(requestAction, context, tempId, store);

      accountState = getState(store, context);
      (requestAction.meta as any).graphUpdatedAt = accountState.graphUpdatedAt!;

      let error: Client.ClientError | Error | undefined;
      const now = Date.now();

      if (actionParams.graphProposer) {
        const graphProducer = actionParams.graphProposer(
            action as Api.Action.RequestAction,
            accountState,
            context
          ),
          proposedGraph = produce(accountState.graph, graphProducer),
          toSet = keySetForGraphProposal(
            accountState.graph,
            now,
            graphProducer,
            actionParams.encryptedKeysScopeFn?.(
              accountState.graph,
              action as Api.Action.RequestAction
            )
          );

        let stateWithFetched: Client.State | undefined;

        const { requiredEnvs, requiredChangesets } = requiredEnvsForKeySet(
            accountState.graph,
            toSet
          ),
          fetchRes = await fetchRequiredEnvs(
            accountState,
            requiredEnvs,
            requiredChangesets,
            context
          );

        if (fetchRes) {
          if (fetchRes.success) {
            stateWithFetched = fetchRes.state;
          } else {
            error = (fetchRes.resultAction as Client.Action.FailureAction)
              .payload;
          }
        } else {
          stateWithFetched = accountState;
        }

        if (stateWithFetched && !error) {
          const envParams = await encryptedKeyParamsForKeySet({
            state: {
              ...stateWithFetched!,
              graph: proposedGraph,
            },
            context,
            toSet,
          });

          payload = { ...payload, ...envParams };
        }
      }

      requestAction = { ...requestAction, payload } as Api.Action.RequestAction;

      if (!error) {
        let res: Api.Net.ApiResult;

        const sanitizedRequestAction = R.evolve(
          {
            meta: R.omit(["clientContext", "dispatchContext", "hostUrl"]),
          },
          requestAction
        ) as Api.Action.RequestAction;

        try {
          res = await postApiAction(
            sanitizedRequestAction,
            hostUrl,
            context.ipTestOverride
          );
          const handleSuccessRes = await handleSuccess(
            requestAction,
            res,
            context
          );
          return handleSuccessRes;
        } catch (err) {
          error = err;
        }
      }

      if (error) {
        const nodeFetchErr = error as Client.FetchError;
        const graphOutdated =
          nodeFetchErr.error?.message == "client graph outdated";

        if (nodeFetchErr.error?.code == 400 && graphOutdated) {
          const delay = Math.random() * OUTDATED_GRAPH_REFRESH_MAX_JITTER_MS;
          await wait(delay);

          let refreshAction: Client.Action.EnvkeyAction | undefined;
          if (actionParams.refreshActionCreator) {
            refreshAction = actionParams.refreshActionCreator(
              context.rootClientAction ?? requestAction
            );
          } else if (accountAuth && accountAuth.type == "clientUserAuth") {
            refreshAction = {
              type: Client.ActionType.GET_SESSION,
              payload: {
                skipWaitForReencryption:
                  action.type == Api.ActionType.REENCRYPT_ENVS || undefined,
              },
            };
          } else if (accountAuth && accountAuth.type == "clientCliAuth") {
            refreshAction = {
              type: Client.ActionType.AUTHENTICATE_CLI_KEY,
              payload: { cliKey: context.accountIdOrCliKey! },
            };
          }

          if (!refreshAction) {
            return handleFailure(requestAction, error, context);
          }

          const refreshRes = await dispatch(refreshAction, context);
          if (!refreshRes.success) {
            return handleFailure(
              requestAction,
              (refreshRes.resultAction as any).payload as Api.Net.ErrorResult,
              context
            );
          }

          if (
            action.type == Api.ActionType.UPDATE_ENVS ||
            action.type == Api.ActionType.REENCRYPT_ENVS
          ) {
            const blobs = (
              action as Api.Action.RequestActions[
                | "UpdateEnvs"
                | "ReencryptEnvs"]
            ).payload.blobs;
            const envParentIds = getBlobParamsEnvParentIds(blobs),
              environmentAndLocalIds =
                getBlobParamsEnvironmentAndLocalIds(blobs);
            try {
              await fetchRequiredEnvs(
                refreshRes.state,
                envParentIds,
                new Set<string>(),
                context,
                action.type == Api.ActionType.REENCRYPT_ENVS || undefined
              );

              // If there are conflicts after fetching outdated envs,
              // the user must confirm before submitting env update.
              // So for now just pass through outdated error.
              if (
                hasPendingConflicts(
                  getState(store, context),
                  undefined,
                  Array.from(environmentAndLocalIds)
                )
              ) {
                return handleFailure(requestAction, error, context);
              }
            } catch (err) {
              return handleFailure(requestAction, err, context);
            }
          }

          let promise: Promise<Client.DispatchResult>;

          if (context.rootClientAction) {
            promise = dispatch(context.rootClientAction, {
              ...context,
              skipWaitForSerialAction: true,
            });
          } else {
            promise = dispatch(action, {
              ...context,
              skipWaitForSerialAction: true,
            });
          }
          return promise.then((res) => ({
            ...res,
            retriedWithUpdatedGraph: true,
          }));
        }

        return handleFailure(requestAction, error, context);
      }
    }

    log("ActionParams type not handled", { actionParams, action });

    throw new Error("ActionParams type not handled");
  },
  clientReducer: () => Reducer<
    Client.ProcState,
    Client.ActionTypeWithContextMeta<Client.Action.EnvkeyAction>
  > = () => {
    const reducers = R.flatten<any>(
      Object.values(actions)
        .map((params) => {
          const reducers: Reducer<
            Client.ProcState,
            Client.ActionTypeWithContextMeta<Client.Action.EnvkeyAction>
          >[] = [];

          for (let k of <const>[
            "stateProducer",
            "successStateProducer",
            "failureStateProducer",
            "endStateProducer",
          ]) {
            if ((params as any)[k]) {
              const stateProducer = (params as any)[k] as Client.StateProducer;

              reducers.push(
                (
                  procState: Client.ProcState = Client.defaultProcState,
                  action: Client.ActionTypeWithContextMeta<Client.Action.EnvkeyAction>
                ) => {
                  const isStartAction = action.type === params.actionType;
                  const isSuccessAction =
                    action.type == params.actionType + "_SUCCESS";
                  const isFailureAction =
                    action.type == params.actionType + "_FAILURE";

                  if (
                    (k == "stateProducer" && isStartAction) ||
                    (k == "successStateProducer" && isSuccessAction) ||
                    (k == "failureStateProducer" && isFailureAction) ||
                    (k == "endStateProducer" &&
                      (isSuccessAction || isFailureAction))
                  ) {
                    const clientState = getState(procState, action.meta);

                    const updated = produce(clientState, (draft) =>
                        stateProducer(draft, action)
                      ),
                      accountId = action.meta.accountIdOrCliKey;

                    const res = {
                      ...procState,
                      ...pick(Client.CLIENT_PROC_STATE_KEYS, updated),
                      clientStates: {
                        ...procState.clientStates,
                        [action.meta.clientId]: pick(
                          Client.CLIENT_STATE_KEYS,
                          updated
                        ),
                      },
                      accountStates: accountId
                        ? {
                            ...procState.accountStates,
                            [accountId]: pick(
                              Client.ACCOUNT_STATE_KEYS,
                              updated
                            ),
                          }
                        : procState.accountStates,
                    };

                    return res;
                  }
                  return procState;
                }
              );
            }
          }

          if ("procStateProducer" in params) {
            reducers.push(
              (
                procState: Client.ProcState = Client.defaultProcState,
                action: Client.ActionTypeWithContextMeta<Client.Action.EnvkeyAction>
              ) => {
                if (action.type === params.actionType) {
                  return produce(procState, (draft) =>
                    params.procStateProducer!(draft, action)
                  );
                } else {
                  return procState;
                }
              }
            );
          }

          if (params.type == "apiRequestAction" && params.graphAction) {
            reducers.push(
              (
                procState: Client.ProcState = Client.defaultProcState,
                action: Client.ActionTypeWithContextMeta<Client.Action.EnvkeyAction>
              ) => {
                if (
                  action.type == params.actionType + "_SUCCESS" &&
                  action.meta.accountIdOrCliKey
                ) {
                  const accountIdOrCliKey = action.meta.accountIdOrCliKey;
                  const payload = (action as Api.Action.RequestAction)
                      .payload as Api.Net.ApiResult,
                    accountState = getState(procState, action.meta);

                  let updatedAccountState:
                    | Client.PartialAccountState
                    | undefined;

                  let graphUpdated = false;
                  if ("graph" in payload) {
                    graphUpdated = true;
                    updatedAccountState = {
                      ...accountState,
                      graph: payload.graph,
                      graphUpdatedAt: payload.graphUpdatedAt,
                    };
                  } else if ("diffs" in payload) {
                    graphUpdated = true;
                    const graphWithDiffs = produce(
                      accountState.graph,
                      (graphDraft) => {
                        applyPatch(graphDraft, payload.diffs);
                      }
                    );

                    updatedAccountState = {
                      ...accountState,
                      graph: graphWithDiffs,
                      graphUpdatedAt: payload.graphUpdatedAt,
                    };
                  }

                  if (graphUpdated && updatedAccountState) {
                    const auth =
                      procState.orgUserAccounts[accountIdOrCliKey] ??
                      procState.cliKeyAccounts[sha256(accountIdOrCliKey)];

                    if (auth) {
                      const { userId: currentUserId } = auth;
                      // clear out updates for any environments that no longer exist or that user is no longer permitted to write to
                      updatedAccountState = produce(
                        updatedAccountState,
                        (draft) =>
                          clearOrphanedEnvUpdatesProducer(draft, currentUserId)
                      );
                    }
                  }

                  const res =
                    updatedAccountState && accountIdOrCliKey
                      ? {
                          ...procState,
                          accountStates: {
                            ...procState.accountStates,
                            [accountIdOrCliKey]: updatedAccountState,
                          },
                        }
                      : procState;

                  return res;
                }

                return procState;
              }
            );
          }

          // store throttling error so we can notify user
          if (params.type == "apiRequestAction") {
            reducers.push(
              (
                procState: Client.ProcState = Client.defaultProcState,
                action: Client.ActionTypeWithContextMeta<Client.Action.EnvkeyAction>
              ) => {
                if (
                  action.meta?.clientId &&
                  procState.clientStates[action.meta.clientId] &&
                  action.type == params.actionType + "_FAILURE"
                ) {
                  const resAction = (<any>action) as {
                    payload: Client.FetchError;
                  };
                  if ([413, 429].includes(resAction.payload.error.code)) {
                    return {
                      ...procState,
                      clientStates: {
                        ...procState.clientStates,
                        [action.meta.clientId]: {
                          ...procState.clientStates[action.meta.clientId]!,
                          throttleError: resAction.payload,
                        },
                      },
                    };
                  }
                }

                return procState;
              }
            );
          }

          if ("serialAction" in params && params.serialAction) {
            reducers.push(
              (
                procState: Client.ProcState = Client.defaultProcState,
                action: Client.ActionTypeWithContextMeta<Client.Action.EnvkeyAction>
              ) => {
                const isStartAction = action.type === params.actionType;
                const isSuccessAction =
                  action.type == params.actionType + "_SUCCESS";
                const isFailureAction =
                  action.type == params.actionType + "_FAILURE";

                if (isStartAction || isSuccessAction || isFailureAction) {
                  const clientState = getState(procState, action.meta);

                  const updated = produce(clientState, (draft) => {
                      if (isStartAction) {
                        draft.isDispatchingSerialAction = true;
                      } else if (isSuccessAction || isFailureAction) {
                        delete draft.isDispatchingSerialAction;
                      }
                    }),
                    accountId = action.meta.accountIdOrCliKey;

                  const res = {
                    ...procState,
                    accountStates: accountId
                      ? {
                          ...procState.accountStates,
                          [accountId]: pick(Client.ACCOUNT_STATE_KEYS, updated),
                        }
                      : procState.accountStates,
                  };

                  return res;
                }

                return procState;
              }
            );
          }

          reducers.push(
            (
              procState: Client.ProcState = Client.defaultProcState,
              action: Client.ActionTypeWithContextMeta<Client.Action.EnvkeyAction>
            ) => {
              if (
                action.meta &&
                action.meta.accountIdOrCliKey &&
                action.meta.clientId &&
                action.meta.clientId != "core" &&
                procState.accountStates[action.meta.accountIdOrCliKey]
              ) {
                return {
                  ...procState,
                  accountStates: {
                    ...procState.accountStates,
                    [action.meta.accountIdOrCliKey]: {
                      ...procState.accountStates[
                        action.meta.accountIdOrCliKey
                      ]!,
                      accountLastActiveAt: Date.now(),
                    },
                  },
                };
              }

              return procState;
            }
          );

          reducers.push(
            (
              procState: Client.ProcState = Client.defaultProcState,
              action: Client.ActionTypeWithContextMeta<Client.Action.EnvkeyAction>
            ) =>
              action.type.startsWith("envkey/client/")
                ? {
                    ...procState,
                    lastActiveAt: Date.now(),
                  }
                : procState
          );

          return reducers;
        })
        .filter(Boolean)
    );
    return (
      state: Client.ProcState = Client.defaultProcState,
      action: Client.ActionTypeWithContextMeta<Client.Action.EnvkeyAction>
    ) => {
      let reduced = state;
      for (let reducer of reducers) {
        reduced = reducer(reduced, action);
      }
      return reduced;
    };
  },
  dispatchStore = <DispatchContextType>(
    action:
      | Client.Action.EnvkeyAction
      | Client.Action.SuccessAction
      | Client.Action.FailureAction,
    contextMeta: Client.Context<DispatchContextType> | undefined,
    tempId: string,
    storeArg?: Client.ReduxStore
  ) => {
    const reduxAction = {
      ...action,
      meta: {
        ...("meta" in action ? action.meta : {}),
        ...(contextMeta ?? {}),
        tempId,
      } as any,
    };

    const store = storeArg ?? getDefaultStore();

    // log(reduxAction.type);

    // log("dispatching " + reduxAction.type);
    // const start = Date.now();

    store.dispatch(reduxAction);

    // log(
    //   "dispatched " + reduxAction.type + ": " + (Date.now() - start).toString()
    // );
  };

const getHandleSuccess =
  <ActionType extends Client.Action.EnvkeyAction, DispatchContextType = any>(
    actionParams: Client.ActionParams,
    action: Client.Action.DispatchAction<ActionType>,
    store: Client.ReduxStore,
    tempId: string
  ) =>
  async (
    rootAction: Client.Action.EnvkeyAction,
    payload: any,
    apiSuccessContext: Client.Context
  ) => {
    let successAccountId: string | undefined;
    if (
      "successAccountIdFn" in actionParams &&
      actionParams.successAccountIdFn
    ) {
      successAccountId = actionParams.successAccountIdFn(payload);
    }

    const successAction = {
        type: action.type + "_SUCCESS",
        meta: { rootAction },
        payload,
      },
      contextParams = successAccountId
        ? {
            ...apiSuccessContext,
            accountIdOrCliKey: successAccountId,
          }
        : apiSuccessContext;

    dispatchStore<DispatchContextType>(
      successAction,
      contextParams,
      tempId,
      store
    );

    let updatedState = getState(store, contextParams);

    // clear any newly revoked session keys
    if (
      updatedState.trustedRoot &&
      !R.isEmpty(updatedState.trustedSessionPubkeys)
    ) {
      clearRevokedOrOutdatedSessionPubkeys(updatedState, contextParams);
      updatedState = getState(store, contextParams);
    }

    if ("verifyCurrentUser" in actionParams && actionParams.verifyCurrentUser) {
      const res = await verifyCurrentUser(updatedState, contextParams);
      if (res) {
        updatedState = getState(store, contextParams);
      } else {
        throw new Error("Couldn't verify current user");
      }
    } else {
      // process queued root pubkey replacements for successful api actions
      if (
        actionParams.type == "apiRequestAction" &&
        !actionParams.skipProcessRootPubkeyReplacements
      ) {
        await processRootPubkeyReplacementsIfNeeded(
          updatedState,
          contextParams,
          true
        );
        updatedState = getState(store, contextParams);
      }

      if (updatedState.trustedRoot && contextParams.accountIdOrCliKey) {
        // ensure current user's trust chain is still valid
        const auth = getAuth(updatedState, contextParams.accountIdOrCliKey);
        if (auth && auth.privkey) {
          const res = await verifyOrgKeyable(
            updatedState,
            "deviceId" in auth ? auth.deviceId : auth.userId,
            contextParams
          );
          if (res) {
            updatedState = getState(store, contextParams);
          } else {
            throw new Error("Updated graph broke current user's trust chain");
          }
        }
      }
    }

    if ("successHandler" in actionParams && actionParams.successHandler) {
      await (actionParams.successHandler as Client.SuccessHandler)(
        updatedState,
        rootAction,
        payload,
        contextParams
      );
      updatedState = getState(store, contextParams);
    }

    const auth = getAuth(updatedState, contextParams.accountIdOrCliKey);

    // clear any blobs orphaned by a graph action
    // runs in background on worker thread
    if (
      auth &&
      auth.privkey &&
      actionParams.type == "apiRequestAction" &&
      actionParams.graphAction
    ) {
      dispatch(
        {
          type: Client.ActionType.CLEAR_ORPHANED_BLOBS,
        },
        contextParams
      );
    }

    // reencrypt any environments that require it
    let toReencryptIds: string[] | undefined;

    if (auth) {
      toReencryptIds = getEnvironmentsQueuedForReencryptionIds(
        updatedState.graph,
        auth.userId
      );
    }

    if (
      auth &&
      auth.privkey &&
      actionParams.type == "apiRequestAction" &&
      !actionParams.skipReencryptPermitted &&
      !updatedState.isReencrypting &&
      toReencryptIds &&
      toReencryptIds.length > 0
    ) {
      dispatch(
        {
          type: Client.ActionType.REENCRYPT_PERMITTED_LOOP,
        },
        contextParams
      );
      updatedState = getState(store, contextParams);
    } else if (
      auth &&
      auth.privkey &&
      actionParams.type == "apiRequestAction" &&
      !actionParams.skipProcessRevocationRequests &&
      !contextParams.skipProcessRevocationRequests &&
      !(toReencryptIds && toReencryptIds.length > 0)
    ) {
      // trigger processing any queued revocation requests
      const revocationRes = await processRevocationRequestsIfNeeded(
        updatedState,
        contextParams
      );
      if (revocationRes && !revocationRes.success) {
        return revocationRes;
      }

      updatedState = getState(store, contextParams);
    }

    return {
      success: true,
      resultAction: successAction,
      state: updatedState,
    };
  };

const getHandleFailure =
  <ActionType extends Client.Action.EnvkeyAction, DispatchContextType = any>(
    actionParams: Client.ActionParams,
    action: Client.Action.DispatchAction<ActionType>,
    store: Client.ReduxStore,
    tempId: string
  ) =>
  async (
    rootAction: Client.Action.EnvkeyAction,
    error: Error | Client.ClientError,
    failureContext: Client.Context
  ) => {
    const failurePayload =
        error instanceof Error
          ? {
              type: <const>"clientError",
              error,
            }
          : error,
      failureAction = {
        type: action.type + "_FAILURE",
        meta: { rootAction: rootAction },
        payload: failurePayload,
      };

    // log("", failurePayload);

    dispatchStore<DispatchContextType>(
      failureAction,
      failureContext,
      tempId,
      store
    );

    const updatedState = getState(store, failureContext);

    if ("failureHandler" in actionParams && actionParams.failureHandler) {
      await (actionParams.failureHandler as Client.FailureHandler)(
        updatedState,
        rootAction,
        failurePayload,
        failureContext
      );
    }

    return {
      success: false,
      resultAction: failureAction,
      state: updatedState,
    };
  };

export type DispatchFn = typeof dispatch;

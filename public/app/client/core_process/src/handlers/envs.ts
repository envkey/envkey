import { waitForStateCondition } from "./../lib/state/index";
import { stripEmptyRecursive, pick } from "@core/lib/utils/object";
import produce from "immer";
import * as R from "ramda";
import * as async from "@core/lib/async";
import { Operation, createPatch } from "rfc6902";
import {
  getEnvWithMetaForVersion,
  getAuth,
  getPendingEnvironmentIds,
  getPendingEnvWithMeta,
  getEnvWithMeta,
  getEnvWithMetaForActions,
  getEarliestEnvUpdatePendingAt,
  getTrustChain,
  envsNeedFetch,
  getPendingKeyableEnv,
  getPendingEnvMeta,
  getPendingInherits,
  getPendingInheritingEnvironmentIds,
  getInheritanceOverrides,
  clearOrphanedBlobPaths,
} from "@core/lib/client";
import {
  getUserEncryptedKeyOrBlobComposite,
  parseUserEncryptedKeyOrBlobComposite,
} from "@core/lib/blob";
import {
  getEnvironmentsByEnvParentId,
  getEnvironmentPermissions,
  getDeleteEnvironmentProducer,
  getEnvironmentOrLocalsAutoCommitEnabled,
  getConnectedBlockEnvironmentsForApp,
  getSubEnvironmentsByParentEnvironmentId,
  graphTypes,
  getEnvironmentName,
  getObjectName,
  authz,
  getConnectedBlocksForApp,
} from "@core/lib/graph";
import { Client, Api, Model } from "@core/types";
import { clientAction, dispatch } from "../handler";
import {
  decryptEnvs,
  decryptChangesets,
  decryptedEnvsStateProducer,
  envUpdateAction,
  envParamsForEnvironments,
  clearVoidedPendingEnvUpdatesProducer,
  recalcReverseDiffsProducer,
  fetchRequiredEnvs,
} from "../lib/envs";
import { removeObjectProducers, updateSettingsProducers } from "../lib/status";
import { signJson } from "@core/lib/crypto/proxy";
import { log } from "@core/lib/utils/logger";
import { getDefaultStore } from "@core_proc/redux_store";
import unset from "lodash.unset";
import { updateLocalSocketEnvActionStatusIfNeeded } from "@core_proc/lib/envs/status";

envUpdateAction<Client.Action.ClientActions["CreateEntry"]>({
  actionType: Client.ActionType.CREATE_ENTRY,
  updateFn: (state, envWithMeta, { payload }) =>
    produce(envWithMeta, (draft) => {
      draft.variables[payload.entryKey] = payload.val;
    }),
});

envUpdateAction<Client.Action.ClientActions["UpdateEntry"]>({
  actionType: Client.ActionType.UPDATE_ENTRY,
  updateFn: (state, envWithMeta, { payload }) =>
    produce(envWithMeta, (draft) => {
      draft.variables[payload.newEntryKey] = draft.variables[payload.entryKey];
      delete draft.variables[payload.entryKey];
    }),
});

envUpdateAction<Client.Action.ClientActions["RemoveEntry"]>({
  actionType: Client.ActionType.REMOVE_ENTRY,
  updateFn: (state, envWithMeta, { payload }) =>
    produce(envWithMeta, (draft) => {
      delete draft.variables[payload.entryKey];
    }),
});

envUpdateAction<Client.Action.ClientActions["UpdateEntryVal"]>({
  actionType: Client.ActionType.UPDATE_ENTRY_VAL,
  updateFn: (state, envWithMeta, { payload }) => {
    // ensure we can't set a circular inheritance value. infinite loops are bad mm'kay
    if (payload.update.inheritsEnvironmentId) {
      const inheriting = getPendingInheritingEnvironmentIds(state, payload);
      if (inheriting.has(payload.update.inheritsEnvironmentId)) {
        return envWithMeta;
      }
    }

    const res = produce(envWithMeta, (draft) => {
      draft.variables[payload.entryKey] = payload.update;
    });

    return res;
  },
});

envUpdateAction<Client.Action.ClientActions["RevertEnvironment"]>({
  actionType: Client.ActionType.REVERT_ENVIRONMENT,
  updateFn: (state, envWithMeta, { payload }) =>
    getEnvWithMetaForVersion(state, payload),
});

envUpdateAction<Client.Action.ClientActions["ImportEnvironment"]>({
  actionType: Client.ActionType.IMPORT_ENVIRONMENT,
  updateFn: (state, envWithMeta, { payload }) =>
    produce(envWithMeta, (draft) => {
      for (let k in payload.parsed) {
        let val = payload.parsed[k] as string | undefined;
        let inheritsEnvironmentId: string | undefined;

        if (val) {
          const inheritsMatch = val.match(
            /^inherits:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
          );

          if (inheritsMatch) {
            inheritsEnvironmentId = inheritsMatch[1];

            const inheriting = getPendingInheritingEnvironmentIds(state, {
              ...payload,
              entryKey: k,
            });

            if (inheriting.has(inheritsEnvironmentId)) {
              continue;
            }

            val = undefined;

            const environment = state.graph[inheritsEnvironmentId] as
              | Model.Environment
              | undefined;

            if (
              !environment ||
              environment.type !== "environment" ||
              environment.envParentId !== payload.envParentId
            ) {
              continue;
            }
          }
        }

        if (inheritsEnvironmentId) {
          draft.variables[k] = { inheritsEnvironmentId };
        } else if (typeof val == "undefined") {
          draft.variables[k] = { isUndefined: true };
        } else {
          draft.variables[k] = val === "" ? { val, isEmpty: true } : { val };
        }
      }
    }),
});

clientAction<Client.Action.ClientActions["CreateEntryRow"]>({
  type: "clientAction",
  actionType: Client.ActionType.CREATE_ENTRY_ROW,
  handler: async (
    state,
    { payload: { vals, envParentId, entryKey } },
    context
  ) => {
    const auth = getAuth(state, context.accountIdOrCliKey);

    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }

    await Promise.all(
      R.toPairs(vals).map(([environmentId, update]) => {
        let canUpdate: boolean;
        const environment = state.graph[environmentId] as
          | Model.Environment
          | undefined;
        if (environment) {
          const permissions = getEnvironmentPermissions(
            state.graph,
            environmentId,
            auth!.userId
          );

          canUpdate = permissions.has("write");
        } else {
          const [envParentId, localsUserId] = environmentId.split("|");
          canUpdate = authz.canUpdateLocals(
            state.graph,
            auth.userId,
            envParentId,
            localsUserId
          );
        }

        if (!canUpdate) {
          throw new Error(
            "User must have write permissions for all environments to update an entry"
          );
        }

        return dispatch<Client.Action.ClientActions["CreateEntry"]>(
          {
            type: Client.ActionType.CREATE_ENTRY,
            payload: {
              envParentId,
              entryKey,
              environmentId,
              val: update ?? { isUndefined: true },
            },
          },
          context
        );
      })
    );
  },
});

clientAction<Client.Action.ClientActions["UpdateEntryRow"]>({
  type: "clientAction",
  actionType: Client.ActionType.UPDATE_ENTRY_ROW,
  handler: async (
    state,
    { payload: { envParentId, entryKey, newEntryKey } },
    context
  ) => {
    const environments = (
        getEnvironmentsByEnvParentId(state.graph)[envParentId] ?? []
      ).filter((environment) => !environment.isSub),
      auth = getAuth(state, context.accountIdOrCliKey);

    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }

    await Promise.all(
      environments
        .map((environment) => {
          const permissions = getEnvironmentPermissions(
            state.graph,
            environment.id,
            auth!.userId
          );

          if (!permissions.has("write")) {
            throw new Error(
              "User must have write permissions for all environments to update an entry"
            );
          }

          const envWithMeta = getPendingEnvWithMeta(state, {
            envParentId,
            environmentId: environment.id,
          });
          if (!envWithMeta || !(entryKey in envWithMeta.variables)) {
            return;
          }

          return dispatch<Client.Action.ClientActions["UpdateEntry"]>(
            {
              type: Client.ActionType.UPDATE_ENTRY,
              payload: {
                envParentId,
                environmentId: environment.id,
                entryKey,
                newEntryKey,
              },
            },
            context
          );
        })
        .filter(Boolean) as Promise<any>[]
    );
  },
});

clientAction<Client.Action.ClientActions["RemoveEntryRow"]>({
  type: "clientAction",
  actionType: Client.ActionType.REMOVE_ENTRY_ROW,
  handler: async (state, { payload: { envParentId, entryKey } }, context) => {
    const environments =
        getEnvironmentsByEnvParentId(state.graph)[envParentId] || [],
      auth = getAuth(state, context.accountIdOrCliKey);

    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    await Promise.all(
      environments.map((environment) => {
        const permissions = getEnvironmentPermissions(
          state.graph,
          environment.id,
          auth.userId
        );

        if (!permissions.has("write")) {
          throw new Error(
            "User must have write permissions for all environments to remove an entry"
          );
        }

        return dispatch<Client.Action.ClientActions["RemoveEntry"]>(
          {
            type: Client.ActionType.REMOVE_ENTRY,
            payload: {
              envParentId,
              entryKey,
              environmentId: environment.id,
            },
          },
          context
        );
      })
    );
  },
});

clientAction<Client.Action.ClientActions["ResetEnvs"]>({
  type: "clientAction",
  actionType: Client.ActionType.RESET_ENVS,
  stateProducer: (draft, { payload }) => {
    let pendingIds: Set<string>;

    if (payload.pendingEnvironmentIds) {
      pendingIds = new Set(
        R.intersection(
          payload.pendingEnvironmentIds,
          getPendingEnvironmentIds(draft)
        )
      );
    } else {
      pendingIds = new Set(getPendingEnvironmentIds(draft));
    }

    const filterImportDiffs = ({ path }: Operation) => {
      return !R.any(
        (entryKey) => Boolean(path.match(new RegExp(`\/${entryKey}(\/|$)`))),
        payload.entryKeys!
      );
    };

    draft.pendingEnvUpdates = draft.pendingEnvUpdates
      .map((action) =>
        payload.entryKeys && action.type == Client.ActionType.IMPORT_ENVIRONMENT
          ? {
              ...action,
              payload: {
                ...action.payload,
                diffs: action.payload.diffs.filter(filterImportDiffs),
              },
              meta: {
                ...action.meta,
                entryKeys: R.difference(
                  action.meta.entryKeys,
                  payload.entryKeys
                ),
              },
            }
          : action
      )
      .filter((action) => {
        const { meta } = action;

        if (action.payload.diffs.length == 0 || meta.entryKeys.length == 0) {
          return false;
        }

        if (!pendingIds.has(meta.environmentId)) {
          return true;
        }

        if (payload.entryKeys) {
          if (R.intersection(payload.entryKeys, meta.entryKeys).length == 0) {
            return true;
          }
        }

        return false;
      });

    // this is slow with many pending actions -- removing for now
    // clearVoidedPendingEnvUpdatesProducer(draft);

    // recalculate reverse diffs
    recalcReverseDiffsProducer(draft);

    draft.pendingEnvsUpdatedAt = Date.now();
  },
});

// clientAction<
//   Client.AsyncClientActionParams<Client.Action.ClientActions["RevertToVersion"]>
// >({
//   type: "asyncClientAction",
//   actionType: Client.ActionType.REVERT_TO_VERSION,
//   handler: async (
//     state,
//     { payload },
//     { dispatchSuccess, dispatchFailure }
//   ) => {}
// });

clientAction<
  Client.Action.ClientActions["CommitEnvs"],
  null,
  Client.ClientError,
  Pick<Client.State, "pendingEnvUpdates" | "envs" | "changesets"> & {
    pendingEnvironmentIds: string[];
  }
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.COMMIT_ENVS,
  serialAction: true,
  stateProducer: (draft, { payload }) => {
    let pendingIds: string[];

    if (payload.pendingEnvironmentIds) {
      pendingIds =
        payload.initEnvs || payload.upgradeCrypto
          ? payload.pendingEnvironmentIds
          : R.intersection(
              payload.pendingEnvironmentIds,
              getPendingEnvironmentIds(draft)
            );
    } else {
      pendingIds = getPendingEnvironmentIds(draft);
    }

    for (let environmentId of pendingIds) {
      draft.isUpdatingEnvs[environmentId] = true;
      delete draft.updateEnvsErrors[environmentId];
    }
  },
  successStateProducer: (draft, { meta: { dispatchContext } }) => {
    draft.pendingEnvUpdates = R.without(
      dispatchContext!.pendingEnvUpdates,
      draft.pendingEnvUpdates
    );

    for (let environmentId of dispatchContext!.pendingEnvironmentIds) {
      let envParentId: string;
      const environment = draft.graph[environmentId] as
        | Model.Environment
        | undefined;
      if (environment) {
        envParentId = environment.envParentId;
      } else {
        [envParentId] = environmentId.split("|");
      }
      const envParent = draft.graph[envParentId] as Model.EnvParent;

      if (!envParent) {
        continue;
      }

      draft.envsFetchedAt[envParentId] = envParent.envsOrLocalsUpdatedAt!;
    }

    draft.envs = {
      ...draft.envs,
      ...dispatchContext!.envs,
    };

    draft.changesets = {
      ...draft.changesets,
      ...dispatchContext!.changesets,
    };

    draft.pendingEnvsUpdatedAt = Date.now();
  },
  failureStateProducer: (draft, { meta: { dispatchContext }, payload }) => {
    for (let environmentId of dispatchContext!.pendingEnvironmentIds) {
      draft.updateEnvsErrors[environmentId] = payload;
    }
  },
  endStateProducer: (draft, { meta: { dispatchContext } }) => {
    for (let environmentId of dispatchContext!.pendingEnvironmentIds) {
      delete draft.isUpdatingEnvs[environmentId];
    }
  },
  handler: async (
    initialState,
    action,
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    const { payload } = action;
    let state = initialState;

    const currentAuth = getAuth(state, context.accountIdOrCliKey);
    if (!currentAuth || !currentAuth.privkey) {
      throw new Error("Authentication and decrypted privkey required");
    }
    const privkey = currentAuth.privkey;

    const message = payload.message;
    let pendingEnvironmentIds: string[];

    if (payload.pendingEnvironmentIds) {
      pendingEnvironmentIds =
        payload.initEnvs || payload.upgradeCrypto
          ? payload.pendingEnvironmentIds
          : R.intersection(
              payload.pendingEnvironmentIds,
              getPendingEnvironmentIds(state)
            );
    } else {
      pendingEnvironmentIds = getPendingEnvironmentIds(state);
    }

    const pendingEnvironmentIdsSet = new Set(pendingEnvironmentIds);

    const pendingEnvUpdates =
      payload.initEnvs || payload.upgradeCrypto
        ? []
        : R.clone(state.pendingEnvUpdates).filter(({ meta }) =>
            pendingEnvironmentIdsSet.has(meta.environmentId)
          );

    const needsFetchEnvParentIds = new Set<string>();
    for (let pendingEnvironmentId of pendingEnvironmentIds) {
      let envParentId: string;
      const pendingEnvironment = state.graph[pendingEnvironmentId] as
        | Model.Environment
        | undefined;
      if (pendingEnvironment) {
        envParentId = pendingEnvironment.envParentId;
      } else {
        envParentId = pendingEnvironmentId.split("|")[0];
      }

      if (envsNeedFetch(state, envParentId)) {
        needsFetchEnvParentIds.add(envParentId);
      }
    }

    const fetchRes = await fetchRequiredEnvs(
      state,
      needsFetchEnvParentIds,
      new Set(),
      context
    );

    if (fetchRes) {
      if (!fetchRes.success) {
        return dispatchFailure(
          (fetchRes.resultAction as Client.Action.FailureAction)
            .payload as Api.Net.ErrorResult,
          {
            ...context,
            dispatchContext: {
              pendingEnvironmentIds,
              pendingEnvUpdates,
              envs: {},
              changesets: {},
            },
          }
        );
      }
      state = fetchRes.state;
    }

    const {
      keys,
      blobs,
      environmentKeysByComposite,
      changesetKeysByEnvironmentId,
    } = await envParamsForEnvironments({
      state,
      environmentIds: pendingEnvironmentIds,
      context,
      pending: payload.initEnvs || payload.upgradeCrypto ? undefined : true,
      initEnvs: payload.initEnvs,
      message,
    });

    let encryptedByTrustChain: string | undefined;
    const hasKeyables =
      Object.keys(keys.keyableParents ?? {}).length +
        Object.keys(keys.blockKeyableParents ?? {}).length >
      0;
    if (hasKeyables) {
      const trustChain = getTrustChain(
        state,
        currentAuth.type == "clientUserAuth"
          ? currentAuth.deviceId
          : currentAuth.userId
      );

      encryptedByTrustChain = await signJson({
        data: trustChain,
        privkey,
      });
    }

    const apiRes = await dispatch<Api.Action.RequestActions["UpdateEnvs"]>(
      {
        type: Api.ActionType.UPDATE_ENVS,
        payload: {
          keys,
          blobs,
          encryptedByTrustChain: encryptedByTrustChain
            ? { data: encryptedByTrustChain }
            : undefined,
          upgradeCrypto: payload.upgradeCrypto,
        },
      },
      { ...context, rootClientAction: action }
    );

    if (apiRes.success && apiRes.retriedWithUpdatedGraph) {
      return apiRes;
    }

    const dispatchContext = {
      pendingEnvUpdates,
      pendingEnvironmentIds,
      envs: pendingEnvironmentIds.reduce((agg, environmentId) => {
        const environment = state.graph[environmentId] as
            | Model.Environment
            | undefined,
          envParentId = environment
            ? environment.envParentId
            : environmentId.split("|")[0];

        const envComposite = getUserEncryptedKeyOrBlobComposite({
          environmentId,
        });
        const metaComposite = getUserEncryptedKeyOrBlobComposite({
          environmentId,
          envPart: "meta",
        });
        const inheritsComposite = getUserEncryptedKeyOrBlobComposite({
          environmentId,
          envPart: "inherits",
        });

        const res = {
          ...agg,
          [envComposite]: {
            env: getPendingKeyableEnv(state, {
              envParentId,
              environmentId,
            }),
            key: environmentKeysByComposite[envComposite],
          },
          [metaComposite]: {
            env: getPendingEnvMeta(state, {
              envParentId,
              environmentId,
            }),
            key: environmentKeysByComposite[metaComposite],
          },
          [inheritsComposite]: {
            env: getPendingInherits(state, {
              envParentId,
              environmentId,
            }),
            key: environmentKeysByComposite[inheritsComposite],
          },
        };

        if (environment && !environment.isSub) {
          let inheritingEnvironmentIds = new Set(
            (
              getEnvironmentsByEnvParentId(state.graph)[
                environment.envParentId
              ] ?? []
            )
              .filter(
                (sibling) =>
                  sibling.id != environment.id &&
                  !(
                    sibling.isSub &&
                    sibling.parentEnvironmentId == environment.id
                  )
              )
              .map(R.prop("id"))
          );

          for (let inheritingEnvironmentId of inheritingEnvironmentIds) {
            const inheritingEnvironment = state.graph[
              inheritingEnvironmentId
            ] as Model.Environment;

            const composite = getUserEncryptedKeyOrBlobComposite({
              environmentId: inheritingEnvironmentId,
              inheritsEnvironmentId: environment.id,
            });

            let overrides =
              getInheritanceOverrides(
                state,
                {
                  envParentId: environment.envParentId,
                  environmentId: inheritingEnvironmentId,
                  forInheritsEnvironmentId: environmentId,
                },
                true
              )[environmentId] ?? {};

            if (inheritingEnvironment.isSub) {
              const parentOverrides =
                getInheritanceOverrides(
                  state,
                  {
                    envParentId: environment.envParentId,
                    environmentId: inheritingEnvironment.parentEnvironmentId,
                    forInheritsEnvironmentId: environmentId,
                  },
                  true
                )[environmentId] ?? {};

              overrides = {
                ...parentOverrides,
                ...overrides,
              };
            }
            let key = environmentKeysByComposite[composite];
            res[composite] = { env: overrides, key };
          }
        }

        if (environment) {
          const siblingBaseEnvironmentIds = (
            getEnvironmentsByEnvParentId(state.graph)[
              environment.envParentId
            ] ?? []
          )
            .filter(
              (sibling) =>
                !sibling.isSub &&
                sibling.id != environment.id &&
                !(
                  environment.isSub &&
                  environment.parentEnvironmentId == sibling.id
                )
            )
            .map(R.prop("id"));

          for (let siblingBaseEnvironmentId of siblingBaseEnvironmentIds) {
            const siblingEnvironment = state.graph[
              siblingBaseEnvironmentId
            ] as Model.Environment;

            const composite = getUserEncryptedKeyOrBlobComposite({
              environmentId: environment.id,
              inheritsEnvironmentId: siblingBaseEnvironmentId,
            });

            let overrides =
              getInheritanceOverrides(
                state,
                {
                  envParentId: environment.envParentId,
                  environmentId: environmentId,
                  forInheritsEnvironmentId: siblingBaseEnvironmentId,
                },
                true
              )[environmentId] ?? {};

            if (siblingEnvironment.isSub) {
              const parentOverrides =
                getInheritanceOverrides(
                  state,
                  {
                    envParentId: environment.envParentId,
                    environmentId: siblingEnvironment.parentEnvironmentId,
                    forInheritsEnvironmentId: environmentId,
                  },
                  true
                )[environmentId] ?? {};

              overrides = {
                ...parentOverrides,
                ...overrides,
              };
            }
            let key =
              environmentKeysByComposite[composite] ??
              state.envs[composite]?.key;
            res[composite] = { env: overrides, key };
          }
        }

        return res;
      }, {} as Client.State["envs"]),
      changesets: payload.upgradeCrypto
        ? ({} as Client.State["changesets"])
        : pendingEnvironmentIds.reduce(
            (agg, environmentId) => ({
              ...agg,
              [environmentId]: {
                key: changesetKeysByEnvironmentId[environmentId],
                changesets: state.changesets[environmentId]?.changesets ?? [],
              },
            }),
            {} as Client.State["changesets"]
          ),
    };

    if (apiRes.success) {
      return dispatchSuccess(null, {
        ...context,
        dispatchContext,
      });
    } else {
      return dispatchFailure(
        (apiRes.resultAction as Client.Action.FailureAction)
          .payload as Api.Net.ErrorResult,
        {
          ...context,
          dispatchContext,
        }
      );
    }
  },
  successHandler: async (state, action, payload, context) => {
    const pendingIds = getPendingEnvironmentIds(state);

    // if there are newly pending environments that should be auto-committed, dispatch another COMMIT_ENVS action
    const autoCommitPendingIds = pendingIds.filter((environmentId) =>
      getEnvironmentOrLocalsAutoCommitEnabled(state.graph, environmentId)
    );

    if (autoCommitPendingIds.length > 0) {
      await dispatch(
        {
          type: Client.ActionType.COMMIT_ENVS,
          payload: {
            pendingEnvironmentIds: autoCommitPendingIds,
            autoCommit: true,
          },
        },
        context
      );
    }
  },
});

clientAction<
  Api.Action.RequestActions["UpdateEnvs"],
  Api.Net.ApiResultTypes["UpdateEnvs"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.UPDATE_ENVS,
  loggableType: "orgAction",
  loggableType2: "updateEnvsAction",
  authenticated: true,
  graphAction: true,
});

type ClientFetchResult = Partial<Pick<Client.State, "envs" | "changesets">> & {
  timestamp: number;
};
clientAction<Client.Action.ClientActions["FetchEnvs"], ClientFetchResult>({
  type: "asyncClientAction",
  actionType: Client.ActionType.FETCH_ENVS,
  stateProducer: (draft, { payload }) => {
    for (let envParentId in payload.byEnvParentId) {
      const { envs, changesets } = payload.byEnvParentId[envParentId];
      if (envs) {
        draft.isFetchingEnvs[envParentId] = true;
        delete draft.fetchEnvsErrors[envParentId];
      }

      if (changesets) {
        draft.isFetchingChangesets[envParentId] = true;
        delete draft.fetchChangesetsErrors[envParentId];
      }
    }
  },
  failureStateProducer: (draft, { meta: { rootAction }, payload }) => {
    for (let envParentId in rootAction.payload.byEnvParentId) {
      const { envs, changesets } =
        rootAction.payload.byEnvParentId[envParentId];

      if (envs) {
        draft.fetchEnvsErrors[envParentId] = payload;
      }

      if (changesets) {
        draft.fetchChangesetsErrors[envParentId] = payload;
      }
    }
  },
  endStateProducer: (draft, { meta: { rootAction } }) => {
    for (let envParentId in rootAction.payload.byEnvParentId) {
      const { envs, changesets } =
        rootAction.payload.byEnvParentId[envParentId];

      if (envs) {
        delete draft.isFetchingEnvs[envParentId];
      }

      if (changesets) {
        delete draft.isFetchingChangesets[envParentId];
      }
    }
  },
  successStateProducer: (draft, action) => {
    const start = Date.now();

    const {
      payload: { timestamp },
      meta: {
        rootAction: {
          payload: { byEnvParentId },
        },
      },
    } = action;

    const toClearEnvs = new Set<string>(),
      toClearChangesets = new Set<string>();

    for (let envParentId in byEnvParentId) {
      const { envs, changesets } = byEnvParentId[envParentId];

      const environments =
          getEnvironmentsByEnvParentId(draft.graph)[envParentId] ?? [],
        environmentIds = new Set(environments.map(R.prop("id")));

      if (envs && timestamp > (draft.envsFetchedAt[envParentId] ?? 0)) {
        for (let composite in draft.envs) {
          const { environmentId } =
            parseUserEncryptedKeyOrBlobComposite(composite);

          if (
            environmentIds.has(environmentId) ||
            environmentId.startsWith(envParentId)
          ) {
            toClearEnvs.add(composite);
          }
        }
      }

      if (
        changesets &&
        timestamp > (draft.changesetsFetchedAt[envParentId] ?? 0)
      ) {
        for (let environmentId in draft.changesets) {
          if (
            environmentIds.has(environmentId) ||
            environmentId.startsWith(envParentId)
          ) {
            toClearChangesets.add(environmentId);
          }
        }
      }
    }

    for (let composite of toClearEnvs) {
      delete draft.envs[composite];
    }

    for (let environmentId of toClearChangesets) {
      delete draft.changesets[environmentId];
    }

    decryptedEnvsStateProducer(draft, action, action.meta.rootAction);
  },
  handler: async (
    initialState,
    action,
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    let state = initialState;

    const { payload } = action;
    const auth = getAuth(state, context.accountIdOrCliKey);
    if (!auth || !auth.privkey) {
      throw new Error(
        "Authentication and decrypted privkey required to decrypt envs"
      );
    }

    updateLocalSocketEnvActionStatusIfNeeded(state, context);

    /*
     * if we're currently re-encrypting an environment belonging
     * to an env parent that we're about to fetch, then wait for
     * the re-encryption to finish before proceeding
     */
    if (!payload.skipWaitForReencryption) {
      await waitForStateCondition(
        context.store ?? getDefaultStore(),
        context,
        (state) => {
          const reencryptingEnvironmentIds = Object.keys(
            state.isReencryptingEnvs
          );

          if (reencryptingEnvironmentIds.length == 0) {
            return true;
          }

          const reencryptingEnvParentIds = new Set<string>();
          for (let environmentId of reencryptingEnvironmentIds) {
            let envParentId: string;
            const environment = state.graph[environmentId] as
              | Model.Environment
              | undefined;
            if (environment) {
              envParentId = environment.envParentId;
            } else {
              envParentId = environmentId.split("|")[0];
            }
            reencryptingEnvParentIds.add(envParentId);
          }

          const fetchEnvParentIds = Object.keys(payload.byEnvParentId);

          return !fetchEnvParentIds.find((envParentId) =>
            reencryptingEnvParentIds.has(envParentId)
          );
        }
      );
    }

    /*
     if we are just fetching envs (not changesets) and this is a refresh (not initial fetch),
     then include recent changesets alongside envs so we can notify the user
     about updates.
     to determine how many changesets to fetch, start from whichever is earliest:
     - envsFetchedAt for the included envParentIds
     - earliest pending action if there are any
    */

    let fetchParams = produce(payload, (draft) => {
      for (let envParentId in payload.byEnvParentId) {
        const { envs, changesets } = payload.byEnvParentId[envParentId];
        let createdAfter: number | undefined = state.graphUpdatedAt;

        if (envs && !changesets) {
          const envsFetchedAt = state.envsFetchedAt[envParentId];

          if (
            envsFetchedAt &&
            (!createdAfter || envsFetchedAt < createdAfter)
          ) {
            createdAfter = envsFetchedAt;
          }

          const earliestPendingAt = getEarliestEnvUpdatePendingAt(
            state,
            envParentId
          );
          if (
            earliestPendingAt &&
            (!createdAfter || earliestPendingAt < createdAfter)
          ) {
            createdAfter = earliestPendingAt;
          }

          if (typeof createdAfter == "number") {
            draft.byEnvParentId[envParentId].changesets = true;
            draft.byEnvParentId[envParentId].changesetOptions = {
              createdAfter,
            };
          }
        }
      }
    });

    // const start = Date.now();
    // log("Fetching envs");

    const apiRes = await dispatch(
      {
        type: Api.ActionType.FETCH_ENVS,
        payload: R.omit(
          ["skipWaitForReencryption"],
          fetchParams
        ) as Api.Net.FetchEnvsParams,
      },
      { ...context, rootClientAction: action }
    );

    if (apiRes.success && apiRes.retriedWithUpdatedGraph) {
      return apiRes;
    }

    if (!apiRes.success) {
      return dispatchFailure((apiRes.resultAction as any).payload, context);
    }

    const apiPayload = (
      apiRes.resultAction as Client.Action.SuccessAction<
        Api.Action.RequestActions["FetchEnvs"],
        Api.Net.ApiResultTypes["FetchEnvs"]
      >
    ).payload;

    state = apiRes.state;

    // log("FETCH_ENVS - get result, starting decryption");

    await dispatch(
      {
        type: Client.ActionType.SET_CRYPTO_STATUS,
        payload: {
          processed: 0,
          total:
            Object.keys(
              apiPayload.envs[payload.keysOnly ? "keys" : "blobs"] ?? {}
            ).length +
            Object.keys(
              apiPayload.changesets[payload.keysOnly ? "keys" : "blobs"] ?? {}
            ).length,
          op: "decrypt",
          dataType: payload.keysOnly ? "keys" : "keys_and_blobs",
        },
      },
      context
    );

    // log("FETCH_ENVS - set crypto status");

    const [decryptedEnvs, decryptedChangesets] = await Promise.all([
      decryptEnvs(
        state,
        apiPayload.envs.keys ?? {},
        apiPayload.envs.blobs ?? {},
        auth.privkey,
        context,
        payload.keysOnly
      ),
      decryptChangesets(
        state,
        apiPayload.changesets.keys ?? {},
        apiPayload.changesets.blobs ?? {},
        auth.privkey,
        context,
        payload.keysOnly
      ),
    ]);

    await dispatch(
      {
        type: Client.ActionType.SET_CRYPTO_STATUS,
        payload: undefined,
      },
      context
    );

    // log("FETCH_ENVS - cleared crypto status");

    // log("FETCH_ENVS - decrypted");

    // log("FETCH_ENVS decrypted " + (Date.now() - start).toString());

    // if any changesets were created by deleted user devices / cli keys
    // fetch the deleted graph for the appropriate time period so we can reference
    // them in the versions list
    let earliestDeleted: number | undefined;
    let latestDeleted: number | undefined;
    for (let { changesets } of Object.values(decryptedChangesets)) {
      for (let { createdAt, createdById } of changesets) {
        if (!(state.graph[createdById] ?? state.deletedGraph[createdById])) {
          if (!earliestDeleted || createdAt < earliestDeleted) {
            earliestDeleted = createdAt;
          }
          if (!latestDeleted || createdAt > latestDeleted) {
            latestDeleted = createdAt;
          }
        }
      }
    }

    if (earliestDeleted && latestDeleted) {
      await dispatch(
        {
          type: Api.ActionType.FETCH_DELETED_GRAPH,
          payload: { startsAt: earliestDeleted, endsAt: latestDeleted },
        },
        context
      );
    }

    // log("FETCH_ENVS - dispatching success");
    const res = dispatchSuccess(
      {
        envs: decryptedEnvs,
        changesets: decryptedChangesets,
        timestamp: (
          (apiRes.resultAction as any)
            .payload as Api.Net.ApiResultTypes["FetchEnvs"]
        ).timestamp,
      },
      context
    );
    // log("FETCH_ENVS - dispatched success");
    return res;
  },

  successHandler: async (state, action, payload, context) => {
    updateLocalSocketEnvActionStatusIfNeeded(state, context);
  },
});

clientAction<
  Api.Action.RequestActions["FetchEnvs"],
  Api.Net.ApiResultTypes["FetchEnvs"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.FETCH_ENVS,
  loggableType: "fetchMetaAction",
  authenticated: true,
  graphAction: true,
});

clientAction<
  Api.Action.RequestActions["CreateEnvironment"],
  Api.Net.ApiResultTypes["CreateEnvironment"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_ENVIRONMENT,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  stateProducer: (draft, { payload: { envParentId, environmentRoleId } }) => {
    const path = [envParentId, environmentRoleId];
    draft.isCreatingEnvironment = R.assocPath(
      path,
      true,
      draft.isCreatingEnvironment
    );

    draft.createEnvironmentErrors = stripEmptyRecursive(
      R.dissocPath(path, draft.createEnvironmentErrors)
    );
  },
  failureStateProducer: (draft, { meta: { rootAction }, payload }) => {
    const { envParentId, environmentRoleId } = rootAction.payload;
    draft.createEnvironmentErrors = R.assocPath(
      [envParentId, environmentRoleId],
      payload,
      draft.createEnvironmentErrors
    );
  },
  endStateProducer: (draft, { meta: { rootAction } }) => {
    const { envParentId, environmentRoleId } = rootAction.payload;
    draft.isCreatingEnvironment = stripEmptyRecursive(
      R.dissocPath(
        [envParentId, environmentRoleId],
        draft.isCreatingEnvironment
      )
    );
  },
  graphProposer:
    ({ payload }) =>
    (graphDraft) => {
      const now = Date.now(),
        proposalId = [
          payload.envParentId,
          payload.environmentRoleId,
          payload.parentEnvironmentId,
          payload.subName,
        ]
          .filter(Boolean)
          .join("|");

      graphDraft[proposalId] = {
        type: "environment",
        id: proposalId,
        ...payload,
        createdAt: now,
        updatedAt: now,
      } as Model.Environment;
    },

  encryptedKeysScopeFn: (graph, { payload }) => {
    const envParent = graph[payload.envParentId] as Model.EnvParent;

    const scopeEnvironments =
      envParent.type == "app"
        ? getConnectedBlockEnvironmentsForApp(
            graph,
            envParent.id,
            undefined,
            undefined,
            payload.environmentRoleId
          )
        : [];

    return {
      userIds: "all",
      envParentIds: new Set(scopeEnvironments.map(R.prop("envParentId"))),
      keyableParentIds: "all",
    };
  },

  successHandler: async (state, action, res, context) => {
    const environment = R.last(
      R.sortBy(R.prop("createdAt"), graphTypes(state.graph).environments)
    )!;

    await dispatch<Client.Action.ClientActions["CommitEnvs"]>(
      {
        type: Client.ActionType.COMMIT_ENVS,
        payload: {
          pendingEnvironmentIds: [environment.id],
          initEnvs: true,
        },
      },
      context
    );
  },
});

clientAction<
  Api.Action.RequestActions["DeleteEnvironment"],
  Api.Net.ApiResultTypes["DeleteEnvironment"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_ENVIRONMENT,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
  graphProposer: ({ payload: { id } }) =>
    getDeleteEnvironmentProducer(id, Date.now()),
  encryptedKeysScopeFn: (graph, { payload: { id } }) => {
    const environment = graph[id] as Model.Environment;
    const envParent = graph[environment.envParentId] as Model.EnvParent;

    const scopeEnvironments = [
      environment,
      ...(envParent.type == "app"
        ? getConnectedBlockEnvironmentsForApp(
            graph,
            envParent.id,
            undefined,
            environment.id
          )
        : []),
    ];

    return {
      userIds: "all",
      envParentIds: new Set(scopeEnvironments.map(R.prop("envParentId"))),
      keyableParentIds: "all",
    };
  },
});

clientAction<
  Api.Action.RequestActions["UpdateEnvironmentSettings"],
  Api.Net.ApiResultTypes["UpdateEnvironmentSettings"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.UPDATE_ENVIRONMENT_SETTINGS,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...updateSettingsProducers,
});

clientAction<
  Client.Action.ClientActions["ClearOrphanedBlobs"],
  { paths: string[][]; graphUpdatedAt: number }
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.CLEAR_ORPHANED_BLOBS,
  successStateProducer: (draft, { payload }) => {
    // if graph has been updated in the meantime, do nothing
    // a new CLEAR_ORPHANED_BLOBS task will take over
    if (payload.graphUpdatedAt != draft.graphUpdatedAt) {
      return;
    }
    for (let path of payload.paths) {
      unset(draft, path);
    }
  },
  handler: async (
    state,
    action,
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    const auth = getAuth(state, context.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }

    try {
      const paths = await async.clearOrphanedBlobPaths(
        state,
        auth.userId,
        auth.type == "clientUserAuth" ? auth.deviceId : "cli"
      );

      return dispatchSuccess(
        { paths, graphUpdatedAt: state.graphUpdatedAt! },
        context
      );
    } catch (err) {
      return dispatchFailure(err, context);
    }
  },
});

clientAction<Client.Action.ClientActions["SetMissingEnvs"]>({
  type: "clientAction",
  actionType: Client.ActionType.SET_MISSING_ENVS,
  stateProducer: (draft, { payload }) => {
    for (let composite in payload) {
      draft.envs[composite] = payload[composite];
    }
  },
});

clientAction<Client.Action.ClientActions["SetCryptoStatus"]>({
  type: "clientAction",
  actionType: Client.ActionType.SET_CRYPTO_STATUS,
  stateProducer: (draft, { payload }) => {
    draft.cryptoStatus = payload;
  },
  handler: async (state, action, context) => {
    updateLocalSocketEnvActionStatusIfNeeded(state, context);
  },
});

clientAction<Client.Action.ClientActions["CryptoStatusIncrement"]>({
  type: "clientAction",
  actionType: Client.ActionType.CRYPTO_STATUS_INCREMENT,
  stateProducer: (draft, { payload }) => {
    if (draft.cryptoStatus) {
      draft.cryptoStatus.processed += payload;
    }
  },
  handler: async (state, action, context) => {
    updateLocalSocketEnvActionStatusIfNeeded(state, context);
  },
});

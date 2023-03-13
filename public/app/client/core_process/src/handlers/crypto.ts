import { waitForStateCondition } from "../lib/state";
import * as R from "ramda";
import {
  getAuth,
  getTrustChain,
  getPubkeyHash,
  envsNeedFetch,
  changesetsNeedFetch,
} from "@core/lib/client";
import { Client, Api, Crypto, Model } from "@core/types";
import { clientAction, dispatch } from "../handler";
import { signJson, signPublicKey } from "@core/lib/crypto/proxy";
import {
  envParamsForEnvironments,
  fetchRequiredEnvs,
  clearNonPendingEnvsProducer,
} from "../lib/envs";
import { verifyRootPubkeyReplacement } from "../lib/trust";
import {
  getSignedByKeyableIds,
  getEnvironmentsQueuedForReencryptionIds,
  graphTypes,
  getEnvironmentsByEnvParentId,
  getObjectName,
  getEnvironmentName,
} from "@core/lib/graph";
import { log } from "@core/lib/utils/logger";
import { getUserEncryptedKeyOrBlobComposite } from "@core/lib/blob";
import { wait } from "@core/lib/utils/wait";
import { getState } from "@core_proc/lib/state";
import { getDefaultStore } from "@core_proc/redux_store";

// env hooks to speed up background processing of re-encryption tasks for tests
declare var process: {
  env: {
    REENCRYPTION_MIN_DELAY?: string;
    REENCRYPTION_JITTER?: string;
    REENCRYPTION_BATCH_SIZE?: string;
  };
};
const DEFAULT_REENCRYPTION_MIN_DELAY = 500;
const DEFAULT_REENCRYPTION_JITTER = 500;
const DEFAULT_REENCRYPTION_BATCH_SIZE = 5;

const REENCRYPTION_MAX_FETCH_ENVS_ATTEMPTS = 5;

clientAction<Client.Action.ClientActions["AddTrustedSessionPubkey"]>({
  type: "clientAction",
  actionType: Client.ActionType.ADD_TRUSTED_SESSION_PUBKEY,
  stateProducer: (draft, { payload }) => {
    draft.trustedSessionPubkeys[payload.id] = payload.trusted;
  },
});

clientAction<Client.Action.ClientActions["ClearTrustedSessionPubkey"]>({
  type: "clientAction",
  actionType: Client.ActionType.CLEAR_TRUSTED_SESSION_PUBKEY,
  stateProducer: (draft, { payload }) => {
    const trustedPairs = R.toPairs(draft.trustedSessionPubkeys);
    let clearingIds = [payload.id];
    while (clearingIds.length > 0) {
      const willClear: string[] = [];
      for (let clearingId of clearingIds) {
        delete draft.trustedSessionPubkeys[clearingId];
        for (let [trustedId, trusted] of trustedPairs) {
          if (trusted[trusted.length - 1] === clearingId) {
            willClear.push(trustedId);
          }
        }
      }
      clearingIds = willClear;
    }
  },
});

clientAction<Client.Action.ClientActions["SetTrustedRootPubkey"]>({
  type: "clientAction",
  actionType: Client.ActionType.SET_TRUSTED_ROOT_PUBKEY,
  stateProducer: (draft, { payload }) => {
    if (!draft.trustedRoot![payload.id]) {
      draft.trustedRoot![payload.id] = payload.trusted;
    }
  },
});

clientAction<Client.Action.ClientActions["ProcessRootPubkeyReplacements"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.PROCESS_ROOT_PUBKEY_REPLACEMENTS,
  stateProducer: (draft) => {
    draft.isProcessingRootPubkeyReplacements = true;
    delete draft.processRootPubkeyReplacementsError;
  },
  failureStateProducer: (draft, { payload }) => {
    draft.processRootPubkeyReplacementsError = payload;
  },
  endStateProducer: (draft) => {
    delete draft.isProcessingRootPubkeyReplacements;
  },
  handler: async (
    initialState,
    action,
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    let state = initialState;

    if (!state.trustedRoot) {
      throw new Error("trustedRoot undefined");
    }

    const { rootPubkeyReplacements } = graphTypes(state.graph);
    if (rootPubkeyReplacements.length === 0) {
      return dispatchSuccess(null, context);
    }

    for (let replacement of rootPubkeyReplacements) {
      await verifyRootPubkeyReplacement(state, replacement);

      const res = await dispatch(
        {
          type: Client.ActionType.SET_TRUSTED_ROOT_PUBKEY,
          payload: {
            id: getPubkeyHash(replacement.replacingPubkey),
            trusted: ["root", replacement.replacingPubkey],
          },
        },
        context
      );
      state = res.state;
    }

    if (!state.trustedRoot) {
      throw new Error("trustedPubkeys undefined");
    }

    if (action.payload.commitTrusted) {
      const auth = getAuth(state, context.accountIdOrCliKey);
      if (!auth) {
        throw new Error("Authentication required for this request");
      }
      if (!auth.privkey) {
        throw new Error("privkey either undefined or encrypted");
      }

      const signedTrustedRoot = await signJson({
        data: state.trustedRoot,
        privkey: auth.privkey,
      });

      const res = await dispatch<
        Api.Action.RequestActions["UpdateTrustedRootPubkey"]
      >(
        {
          type: Api.ActionType.UPDATE_TRUSTED_ROOT_PUBKEY,
          payload: {
            signedTrustedRoot: { data: signedTrustedRoot },
            replacementIds: rootPubkeyReplacements.map(R.prop("id")),
          },
        },
        { ...context, rootClientAction: action }
      );

      if (!res.success) {
        return dispatchFailure(
          (res.resultAction as Client.Action.FailureAction)
            .payload as Api.Net.ErrorResult,
          context
        );
      }
    }

    return dispatchSuccess(null, context);
  },
});

clientAction<Client.Action.ClientActions["ProcessRevocationRequests"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.PROCESS_REVOCATION_REQUESTS,
  stateProducer: (draft) => {
    draft.isProcessingRevocationRequests = true;
    delete draft.processRevocationRequestError;
  },
  failureStateProducer: (draft, { payload }) => {
    draft.processRevocationRequestError = payload;
  },
  endStateProducer: (draft) => {
    delete draft.isProcessingRevocationRequests;
  },
  handler: async (
    initialState,
    action,
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    let state = initialState;

    const currentAuth = getAuth(state, context.accountIdOrCliKey);
    if (!currentAuth || !currentAuth.privkey) {
      throw new Error("Authentication and decrypted privkey required");
    }

    const currentAuthId =
      currentAuth.type == "clientUserAuth"
        ? currentAuth.deviceId
        : currentAuth.userId;
    const privkey = currentAuth.privkey;

    const { pubkeyRevocationRequests, apps, blocks, environments } = graphTypes(
      state.graph
    );
    const byRequestId: Record<string, string> = {};
    let signedPubkeys: Record<string, Crypto.Pubkey> = {};
    let replacingRoot = false;
    const cryptoPromises: Promise<void>[] = [];

    for (let request of pubkeyRevocationRequests) {
      byRequestId[request.id] = request.targetId;

      const { isRoot } = state.graph[request.targetId] as
        | Model.OrgUserDevice
        | Model.CliUser;

      if (isRoot) {
        replacingRoot = true;
      }
    }

    for (let request of pubkeyRevocationRequests) {
      const signedByKeyableIds = getSignedByKeyableIds(
        state.graph,
        request.targetId
      );
      for (let keyableId of signedByKeyableIds) {
        const { pubkey } = state.graph[keyableId] as {
          pubkey: Crypto.Pubkey;
        };
        cryptoPromises.push(
          signPublicKey({
            privkey,
            pubkey,
          }).then((signedPubkey) => {
            signedPubkeys[keyableId] = signedPubkey;
          })
        );
      }
    }

    await Promise.all(cryptoPromises);

    // when replacing root, the replacement trust chain should end at the *previous* root, and the encrypted by trust chain should end at the *new* root

    const replacingRootTrustChain = replacingRoot
      ? await signJson({
          data: getTrustChain(
            state,
            currentAuth.type == "clientUserAuth"
              ? currentAuth.deviceId
              : currentAuth.userId
          ),
          privkey,
        })
      : undefined;

    if (replacingRoot) {
      const { pubkey: currentUserPubkey, pubkeyId: currentUserPubkeyId } = state
        .graph[currentAuthId] as Model.OrgUserDevice | Model.CliUser;

      await dispatch(
        {
          type: Client.ActionType.SET_TRUSTED_ROOT_PUBKEY,
          payload: {
            id: currentUserPubkeyId,
            trusted: ["root", currentUserPubkey],
          },
        },
        context
      );

      const res = await dispatch(
        {
          type: Client.ActionType.CLEAR_TRUSTED_SESSION_PUBKEY,
          payload: { id: currentUserPubkeyId },
        },
        context
      );

      if (res.success) {
        state = res.state;
      } else {
        return dispatchFailure(
          (res.resultAction as Client.Action.FailureAction)
            .payload as Client.ClientError,
          context
        );
      }

      if (!state.trustedRoot) {
        throw new Error("trustedPubkeys undefined");
      }
    }

    const signedTrustedRoot =
      replacingRoot && state.trustedRoot
        ? await signJson({
            data: state.trustedRoot,
            privkey: currentAuth.privkey,
          })
        : undefined;

    const apiRes = await dispatch(
      {
        type: Api.ActionType.REVOKE_TRUSTED_PUBKEYS,
        payload: {
          byRequestId,
          signedPubkeys,
          replacingRootTrustChain: replacingRootTrustChain
            ? { data: replacingRootTrustChain }
            : undefined,
          signedTrustedRoot: signedTrustedRoot
            ? { data: signedTrustedRoot }
            : undefined,
        },
      },
      context
    );

    if (apiRes.success) {
      return dispatchSuccess(null, context);
    } else {
      return dispatchFailure(
        (apiRes.resultAction as Client.Action.FailureAction)
          .payload as Api.Net.ErrorResult,
        context
      );
    }
  },
});

clientAction<Client.Action.ClientActions["ReencryptPermittedLoop"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.REENCRYPT_PERMITTED_LOOP,
  stateProducer: (draft) => {
    draft.isReencrypting = true;
  },
  endStateProducer: (draft) => {
    delete draft.isReencrypting;
  },
  handler: async (
    initialState,
    action,
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    let state = initialState;

    const currentAuth = getAuth(state, context.accountIdOrCliKey);
    if (!currentAuth || !currentAuth.privkey) {
      throw new Error("Authentication and decrypted privkey required");
    }

    while (true) {
      let allReencryptIds = getEnvironmentsQueuedForReencryptionIds(
        state.graph,
        currentAuth.userId
      );

      if (allReencryptIds.length == 0) {
        return dispatchSuccess(null, context);
      }

      // add some delay jitter to allow room for other actions

      const minDelay = parseInt(
        `${
          process.env.REENCRYPTION_MIN_DELAY ?? DEFAULT_REENCRYPTION_MIN_DELAY
        }`
      );
      const jitter = parseInt(
        `${process.env.REENCRYPTION_JITTER ?? DEFAULT_REENCRYPTION_JITTER}`
      );

      await wait(minDelay + Math.floor(Math.random() * jitter));

      state = getState(context.store ?? getDefaultStore(), context);
      allReencryptIds = getEnvironmentsQueuedForReencryptionIds(
        state.graph,
        currentAuth.userId
      );

      if (allReencryptIds.length == 0) {
        return dispatchSuccess(null, context);
      }

      const batchSize = parseInt(
        `${
          process.env.REENCRYPTION_BATCH_SIZE ?? DEFAULT_REENCRYPTION_BATCH_SIZE
        }`
      );

      const numBatches = Math.max(1, allReencryptIds.length / batchSize);

      const randomBatchNum = Math.floor(Math.random() * numBatches);

      const batchEnvironmentIds = allReencryptIds.slice(
        randomBatchNum * batchSize,
        batchSize
      );

      let envParentIds = new Set<string>();
      for (let environmentId of batchEnvironmentIds) {
        let envParentId: string;
        const environment = state.graph[environmentId] as
          | Model.Environment
          | undefined;
        if (environment) {
          envParentId = environment.envParentId;
        } else {
          envParentId = environmentId.split("|")[0];
        }
        envParentIds.add(envParentId);
      }

      /*
       * if we're currently either fetching the env parent
       * or updating envs for an environment we're about to
       * re-encrypt first wait for the fetch and/or update to finish
       */
      await waitForStateCondition(
        context.store ?? getDefaultStore(),
        context,
        (state) => {
          return !Object.keys(state.isFetchingEnvs).find(
            (isFetchingEnvParentId) => envParentIds.has(isFetchingEnvParentId)
          );
        }
      );

      const res = await dispatch(
        {
          type: Client.ActionType.REENCRYPT_ENVS,
          payload: { environmentIds: batchEnvironmentIds },
        },
        {
          ...context,
          rootClientAction: action,
        }
      );

      if (res.success) {
        state = res.state;

        if (res.retriedWithUpdatedGraph) {
          return res;
        }
      } else {
        log("REENCRYPT_ENVS failed", (res.resultAction as any)?.payload);

        return dispatchFailure((res.resultAction as any)?.payload, context);
      }
    }
  },
});

clientAction<
  Client.Action.ClientActions["ReencryptEnvs"],
  null,
  Client.ClientError,
  Pick<Client.State, "envs" | "changesets">
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.REENCRYPT_ENVS,
  serialAction: true,
  stateProducer: (draft, { payload: { environmentIds } }) => {
    for (let environmentId of environmentIds) {
      draft.isReencryptingEnvs[environmentId] = true;
      delete draft.reencryptEnvsErrors[environmentId];
    }
  },
  successStateProducer: (
    draft,
    {
      meta: {
        dispatchContext,
        rootAction: {
          payload: { environmentIds },
        },
      },
    }
  ) => {
    for (let environmentId of environmentIds) {
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
  },
  failureStateProducer: (
    draft,
    {
      meta: {
        rootAction: {
          payload: { environmentIds },
        },
      },
      payload,
    }
  ) => {
    for (let environmentId of environmentIds) {
      draft.reencryptEnvsErrors[environmentId] = payload;
    }
  },
  endStateProducer: (
    draft,
    {
      meta: {
        rootAction: {
          payload: { environmentIds },
        },
      },
    }
  ) => {
    for (let environmentId of environmentIds) {
      delete draft.isReencryptingEnvs[environmentId];
    }
  },
  handler: async (
    initialState,
    action,
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    let state = initialState;
    const {
      payload: { environmentIds: reencryptEnvironmentIds },
    } = action;
    const currentAuth = getAuth(state, context.accountIdOrCliKey);
    if (!currentAuth || !currentAuth.privkey) {
      throw new Error("Authentication and decrypted privkey required");
    }

    const envParentIds = new Set<string>();
    for (let reencryptEnvironmentId of reencryptEnvironmentIds) {
      let envParentId: string;
      const environment = state.graph[reencryptEnvironmentId] as
        | Model.Environment
        | undefined;
      if (environment) {
        envParentId = environment.envParentId;
      } else {
        envParentId = reencryptEnvironmentId.split("|")[0];
      }
      envParentIds.add(envParentId);
    }

    const fetchOutdatedEnvs = async () => {
      const requiredEnvIds = new Set<string>();
      const requiredChangesetIds = new Set<string>();
      for (let envParentId of envParentIds) {
        if (envsNeedFetch(state, envParentId)) {
          requiredEnvIds.add(envParentId);
        }
        if (changesetsNeedFetch(state, envParentId)) {
          requiredChangesetIds.add(envParentId);
        }
      }

      if (requiredEnvIds.size > 0 || requiredChangesetIds.size > 0) {
        const fetchRequiredEnvsRes = await fetchRequiredEnvs(
          state,
          requiredEnvIds,
          requiredChangesetIds,
          { ...context, skipProcessRevocationRequests: true },
          true
        );

        if (fetchRequiredEnvsRes) {
          if (!fetchRequiredEnvsRes.success) {
            return dispatchFailure(
              (fetchRequiredEnvsRes.resultAction as Client.Action.FailureAction)
                .payload as Api.Net.ErrorResult,
              { ...context }
            );
          }
          state = fetchRequiredEnvsRes.state;
        }
      }
    };

    await fetchOutdatedEnvs();

    let keys: Api.Net.EnvParams["keys"] | undefined;
    let blobs: Api.Net.EnvParams["blobs"] | undefined;
    let environmentKeysByComposite: Record<string, string> | undefined;
    let changesetKeysByEnvironmentId: Record<string, string> | undefined;

    const setEnvParams = async () => {
      ({
        keys,
        blobs,
        environmentKeysByComposite,
        changesetKeysByEnvironmentId,
      } = await envParamsForEnvironments({
        state,
        environmentIds: reencryptEnvironmentIds,
        rotateKeys: true,
        reencryptChangesets: true,
        context,
      }));
    };

    let numRetries = 0;
    while (
      !(
        keys &&
        blobs &&
        environmentKeysByComposite &&
        changesetKeysByEnvironmentId
      )
    ) {
      try {
        await setEnvParams();
        break;
      } catch (err) {
        if (
          (err as Error).message.includes("latest envs not fetched") ||
          (err as Error).message.includes("latest changesets not fetched")
        ) {
          await fetchOutdatedEnvs();
          numRetries++;

          if (numRetries >= REENCRYPTION_MAX_FETCH_ENVS_ATTEMPTS) {
            break;
          }
        } else {
          return dispatchFailure(
            {
              type: "clientError",
              error: err,
            },
            { ...context }
          );
        }
      }
    }

    if (
      !(
        keys &&
        blobs &&
        environmentKeysByComposite &&
        changesetKeysByEnvironmentId
      )
    ) {
      return dispatchFailure(
        {
          type: "clientError",
          error: new Error(
            `Could not fetch latest envs and changesets for re-encryption after ${numRetries} attempts`
          ),
        },
        { ...context }
      );
    }

    if (R.isEmpty(keys) && R.isEmpty(blobs)) {
      return dispatchSuccess(null, {
        ...context,
        dispatchContext: { envs: {}, changesets: {} },
      });
    }

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
        privkey: currentAuth.privkey,
      });
    }

    const apiRes = await dispatch<Api.Action.RequestActions["ReencryptEnvs"]>(
      {
        type: Api.ActionType.REENCRYPT_ENVS,
        payload: {
          keys,
          blobs,
          encryptedByTrustChain: encryptedByTrustChain
            ? { data: encryptedByTrustChain }
            : undefined,
        },
      },
      { ...context, rootClientAction: action }
    );

    if (apiRes.success && apiRes.retriedWithUpdatedGraph) {
      return apiRes;
    }

    const envs = reencryptEnvironmentIds.reduce((agg, environmentId) => {
      const environment = state.graph[environmentId] as
        | Model.Environment
        | undefined;

      const envComposite = getUserEncryptedKeyOrBlobComposite({
        environmentId,
      });
      const envState = state.envs[envComposite];

      const metaComposite = getUserEncryptedKeyOrBlobComposite({
        environmentId,
        envPart: "meta",
      });
      const metaState = state.envs[metaComposite];

      let inheritsComposite: string | undefined;
      let inheritsState: Client.State["envs"][string] | undefined;
      if (environment) {
        inheritsComposite = getUserEncryptedKeyOrBlobComposite({
          environmentId,
          envPart: "inherits",
        });
        inheritsState = state.envs[inheritsComposite];
      }

      const res = {
        ...agg,

        ...(metaState
          ? {
              [metaComposite]: {
                env: metaState.env,
                key: environmentKeysByComposite![metaComposite],
              },
            }
          : {}),

        ...(envState
          ? {
              [envComposite]: {
                env: envState.env,
                key: environmentKeysByComposite![envComposite],
              },
            }
          : {}),

        ...(inheritsComposite && inheritsState
          ? {
              [inheritsComposite]: {
                env: inheritsState.env,
                key: environmentKeysByComposite![inheritsComposite],
              },
            }
          : {}),
      };

      if (environment && !environment.isSub) {
        const inheritingEnvironmentIds = new Set(
          (
            getEnvironmentsByEnvParentId(state.graph)[
              environment.envParentId
            ] ?? []
          )
            .filter(
              (sibling) =>
                sibling.id != environment.id &&
                !(
                  sibling.isSub && sibling.parentEnvironmentId == environment.id
                )
            )
            .map(R.prop("id"))
        );

        for (let inheritingEnvironmentId of inheritingEnvironmentIds) {
          const composite = getUserEncryptedKeyOrBlobComposite({
            environmentId: inheritingEnvironmentId,
            inheritsEnvironmentId: environment.id,
          });

          if (state.envs[composite]) {
            const key = environmentKeysByComposite![composite];
            res[composite] = { env: state.envs[composite].env, key };
          } else {
            log("Missing inheritanceOverrides composite", {
              composite,
              envParent: getObjectName(state.graph, environment.envParentId),
              environment: getEnvironmentName(state.graph, environment.id),
              inheritingEnvironment: getEnvironmentName(
                state.graph,
                inheritingEnvironmentId
              ),
            });
            throw new Error("Missing inheritanceOverrides composite");
          }
        }
      }

      if (environment) {
        const siblingBaseEnvironmentIds = (
          getEnvironmentsByEnvParentId(state.graph)[environment.envParentId] ??
          []
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

          if (state.envs[composite]) {
            const key = environmentKeysByComposite![composite];
            res[composite] = { env: state.envs[composite].env, key };
          } else {
            log("Missing inheritanceOverrides composite", {
              composite,
              envParent: getObjectName(state.graph, environment.envParentId),
              environment: getEnvironmentName(state.graph, environment.id),
              inheritingEnvironment: getEnvironmentName(
                state.graph,
                siblingEnvironment.id
              ),
            });
            throw new Error("Missing inheritanceOverrides composite");
          }
        }
      }

      return res;
    }, {} as Client.State["envs"]);

    const changesets = reencryptEnvironmentIds.reduce(
      (agg, environmentId) => ({
        ...agg,
        [environmentId]: {
          key: changesetKeysByEnvironmentId![environmentId],
          changesets: state.changesets[environmentId]?.changesets ?? [],
        },
      }),
      {} as Client.State["changesets"]
    );

    const dispatchContext = {
      envs,
      changesets,
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
});

clientAction<
  Api.Action.RequestActions["UpdateTrustedRootPubkey"],
  Api.Net.ApiResultTypes["UpdateTrustedRootPubkey"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.UPDATE_TRUSTED_ROOT_PUBKEY,
  loggableType: "authAction",
  authenticated: true,
  successStateProducer: (draft, { meta, payload }) => {
    for (let replacementId of meta.rootAction.payload.replacementIds) {
      delete draft.graph[replacementId];
    }
  },
});

clientAction<
  Api.Action.RequestActions["RevokeTrustedPubkeys"],
  Api.Net.ApiResultTypes["RevokeTrustedPubkeys"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.REVOKE_TRUSTED_PUBKEYS,
  loggableType: "orgAction",
  loggableType2: "authAction",
  authenticated: true,
  graphAction: true,
  skipReencryptPermitted: true,
});

clientAction<
  Api.Action.RequestActions["ReencryptEnvs"],
  Api.Net.ApiResultTypes["ReencryptEnvs"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.REENCRYPT_ENVS,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  skipReencryptPermitted: true,
  skipProcessRootPubkeyReplacements: true,
});

clientAction<Client.Action.ClientActions["VerifiedSignedTrustedRootPubkey"]>({
  type: "clientAction",
  actionType: Client.ActionType.VERIFIED_SIGNED_TRUSTED_ROOT_PUBKEY,
  stateProducer: (draft, { payload }) => {
    draft.trustedRoot = payload;
    delete draft.signedTrustedRoot;
  },
});

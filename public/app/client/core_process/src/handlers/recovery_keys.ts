import { newAccountStateProducer } from "../lib/state";
import { sha256 } from "@core/lib/crypto/utils";
import * as R from "ramda";
import { Client, Api, Crypto, Model } from "@core/types";
import { clientAction, dispatch } from "../handler";
import {
  signJson,
  generateKeys,
  signPublicKey,
  decryptPrivateKey,
} from "@core/lib/crypto/proxy";
import { getAuth, getPubkeyHash } from "@core/lib/client";
import {
  decryptedEnvsStateProducer,
  decryptEnvs,
  decryptChangesets,
  encryptedKeyParamsForDeviceOrInvitee,
  fetchEnvsForUserOrAccessParams,
  clearNonPendingEnvsProducer,
} from "../lib/envs";
import {
  verifyKeypair,
  verifySignedTrustedRootPubkey,
  processRootPubkeyReplacementsIfNeeded,
} from "../lib/trust";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { secureRandomPhrase } from "@core/lib/crypto/phrase";
import { log } from "@core/lib/utils/logger";
import { updateLocalSocketEnvActionStatusIfNeeded } from "@core_proc/lib/envs/status";

clientAction<
  Client.Action.ClientActions["CreateRecoveryKey"],
  Client.State["generatedRecoveryKey"]
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.CREATE_RECOVERY_KEY,
  serialAction: true,
  stateProducer: (draft) => {
    draft.isGeneratingRecoveryKey = true;
    delete draft.generateRecoveryKeyError;
  },
  failureStateProducer: (draft, { payload }) => {
    draft.generateRecoveryKeyError = payload;
  },
  successStateProducer: (draft, { payload }) => {
    draft.generatedRecoveryKey = payload;
  },
  endStateProducer: (draft) => {
    delete draft.isGeneratingRecoveryKey;
    clearNonPendingEnvsProducer(draft);
  },
  handler: async (
    state,
    action,
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    const auth = getAuth<Client.ClientUserAuth>(
      state,
      context.accountIdOrCliKey
    );
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }

    const fetchRes = await fetchEnvsForUserOrAccessParams(
      state,
      [{ userId: auth.userId }],
      context
    );

    let stateWithFetched: Client.State | undefined;
    if (fetchRes) {
      if (fetchRes.success) {
        stateWithFetched = fetchRes.state;
      } else {
        return dispatchFailure((fetchRes.resultAction as any).payload, context);
      }
    } else {
      stateWithFetched = state;
    }

    try {
      const [apiParams, encryptionKey] = await createRecoveryKey(
        stateWithFetched!,
        auth,
        context
      );

      const apiRes = await dispatch(
        {
          type: Api.ActionType.CREATE_RECOVERY_KEY,
          payload: apiParams,
        },
        { ...context, rootClientAction: action }
      );

      if (apiRes.success && apiRes.retriedWithUpdatedGraph) {
        return apiRes;
      }

      if (apiRes.success) {
        return dispatchSuccess({ encryptionKey }, context);
      } else {
        return dispatchFailure((apiRes.resultAction as any).payload, context);
      }
    } catch (err) {
      return dispatchFailure(
        {
          type: "clientError",
          error: err,
        },
        context
      );
    }
  },
});

clientAction<Client.Action.ClientActions["ClearGeneratedRecoveryKey"]>({
  type: "clientAction",
  actionType: Client.ActionType.CLEAR_GENERATED_RECOVERY_KEY,
  stateProducer: (draft) => {
    delete draft.generatedRecoveryKey;
  },
});

clientAction<Client.Action.ClientActions["ResetRecoveryKey"]>({
  type: "clientAction",
  actionType: Client.ActionType.RESET_RECOVERY_KEY,
  stateProducer: (draft) => {
    delete draft.loadedRecoveryKeyIdentityHash;
    delete draft.loadedRecoveryPrivkey;
    delete draft.loadedRecoveryKey;
    delete draft.loadRecoveryKeyError;
    delete draft.loadedRecoveryKeyEmailToken;
    delete draft.loadedRecoveryKeyOrgId;
  },
});

clientAction<
  Client.Action.ClientActions["LoadRecoveryKey"],
  Partial<Pick<Client.State, "envs" | "changesets">> &
    Required<
      Pick<
        Client.State,
        | "loadedRecoveryPrivkey"
        | "loadedRecoveryKeyIdentityHash"
        | "loadedRecoveryKeyOrgId"
        | "loadedRecoveryKeyHostUrl"
      >
    > &
    Pick<Client.State, "loadedRecoveryKeyEmailToken"> & {
      timestamp: number;
    }
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.LOAD_RECOVERY_KEY,
  stateProducer: (draft) => {
    draft.isLoadingRecoveryKey = true;
    delete draft.loadedRecoveryKey;
    delete draft.loadRecoveryKeyError;
    delete draft.loadedRecoveryPrivkey;
    delete draft.loadedRecoveryKeyEmailToken;
    delete draft.loadedRecoveryKeyIdentityHash;
    delete draft.loadedRecoveryKeyHostUrl;
    delete draft.loadedRecoveryKeyOrgId;
  },
  endStateProducer: (draft) => {
    delete draft.isLoadingRecoveryKey;
  },
  failureStateProducer: (draft, { payload }) => {
    draft.loadRecoveryKeyError = payload;

    draft.graph = {};
    delete draft.graphUpdatedAt;
    delete draft.signedTrustedRoot;
    delete draft.trustedRoot;
    draft.trustedSessionPubkeys = {};
    delete draft.loadedRecoveryKey;
  },

  successStateProducer: (draft, action) => {
    decryptedEnvsStateProducer(draft, action);

    draft.loadedRecoveryPrivkey = action.payload.loadedRecoveryPrivkey;
    draft.loadedRecoveryPrivkey = action.payload.loadedRecoveryPrivkey;
    draft.loadedRecoveryKeyEmailToken =
      action.payload.loadedRecoveryKeyEmailToken;
    draft.loadedRecoveryKeyIdentityHash =
      action.payload.loadedRecoveryKeyIdentityHash;
    draft.loadedRecoveryKeyHostUrl = action.payload.loadedRecoveryKeyHostUrl;
    draft.loadedRecoveryKeyOrgId = action.payload.loadedRecoveryKeyOrgId;
  },

  handler: async (
    initialState,
    action,
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    const {
      payload: { encryptionKey, hostUrl, emailToken },
    } = action;
    let state = initialState;

    const identityHash = getIdentityHash({ hostUrl, encryptionKey }),
      apiRes = await dispatch(
        {
          type: Api.ActionType.LOAD_RECOVERY_KEY,
          payload: { emailToken },
        },
        {
          ...context,
          hostUrl,
          rootClientAction: action,
          auth: {
            type: "loadRecoveryKeyAuthParams",
            identityHash,
          },
        }
      );

    if (apiRes.success && apiRes.retriedWithUpdatedGraph) {
      return apiRes;
    }

    if (!apiRes.success) {
      return dispatchFailure((apiRes.resultAction as any).payload, context);
    }

    state = apiRes.state;

    const apiPayload = (
      apiRes.resultAction as Client.Action.SuccessAction<
        Api.Action.RequestActions["LoadRecoveryKey"],
        Api.Net.ApiResultTypes["LoadRecoveryKey"]
      >
    ).payload;

    const apiSuccessContext: Client.Context = {
      ...context,
      hostUrl,
      accountIdOrCliKey:
        apiPayload.type == "loadedRecoveryKey"
          ? apiPayload.recoveryKey.userId
          : undefined,
    };

    try {
      if (apiPayload.type != "loadedRecoveryKey") {
        return dispatchFailure(apiPayload, context);
      }

      const recoveryPrivkey = await decryptPrivateKey({
        encryptedPrivkey: apiPayload.recoveryKey.encryptedPrivkey,
        encryptionKey,
      });

      const [_, verifyTrustedRes] = await Promise.all([
        verifyKeypair(apiPayload.recoveryKey.pubkey, recoveryPrivkey),
        verifySignedTrustedRootPubkey(
          apiRes.state,
          apiPayload.recoveryKey.pubkey,
          apiSuccessContext
        ),
      ]);
      state = verifyTrustedRes.state;

      const replacementsRes = await processRootPubkeyReplacementsIfNeeded(
        state,
        apiSuccessContext
      );

      if (replacementsRes && !replacementsRes.success) {
        throw new Error("couldn't process root pubkey replacements");
      } else if (replacementsRes) {
        state = replacementsRes.state;
      }

      await dispatch(
        {
          type: Client.ActionType.SET_CRYPTO_STATUS,
          payload: {
            processed: 0,
            total:
              Object.keys(apiPayload.envs.keys ?? {}).length +
              Object.keys(apiPayload.changesets.keys ?? {}).length,
            op: "decrypt",
            dataType: "keys",
          },
        },
        context
      );

      const [decryptedEnvs, decryptedChangesets] = await Promise.all([
        decryptEnvs(
          state,
          apiPayload.envs.keys ?? {},
          apiPayload.envs.blobs ?? {},
          recoveryPrivkey,
          apiSuccessContext,
          true
        ),
        decryptChangesets(
          state,
          apiPayload.changesets.keys ?? {},
          apiPayload.changesets.blobs ?? {},
          recoveryPrivkey,
          apiSuccessContext,
          true
        ),
      ]);

      await dispatch(
        {
          type: Client.ActionType.SET_CRYPTO_STATUS,
          payload: undefined,
        },
        context
      );

      return dispatchSuccess(
        {
          envs: decryptedEnvs,
          changesets: decryptedChangesets,
          loadedRecoveryPrivkey: recoveryPrivkey,
          loadedRecoveryKeyIdentityHash: identityHash,
          loadedRecoveryKeyEmailToken: emailToken,
          loadedRecoveryKeyOrgId: apiPayload.orgId,
          loadedRecoveryKeyHostUrl: hostUrl,
          timestamp: (
            (apiRes.resultAction as any).payload as Api.Net.LoadedRecoveryKey
          ).timestamp,
        },
        apiSuccessContext
      );
    } catch (err) {
      return dispatchFailure(
        { type: "clientError", error: err },
        apiSuccessContext
      );
    }
  },

  successHandler: async (state, action, payload, context) => {
    updateLocalSocketEnvActionStatusIfNeeded(state, context);
  },
});

clientAction<Client.Action.ClientActions["RedeemRecoveryKey"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.REDEEM_RECOVERY_KEY,
  verifyCurrentUser: true,
  stateProducer: (draft) => {
    draft.isRedeemingRecoveryKey = true;
  },
  successStateProducer: (draft) => {
    draft.didRedeemRecoveryKey = true;
  },
  endStateProducer: (draft) => {
    delete draft.isRedeemingRecoveryKey;
    delete draft.loadedRecoveryKey;
    delete draft.loadedRecoveryPrivkey;
    delete draft.loadedRecoveryKeyEmailToken;
    delete draft.loadedRecoveryKeyIdentityHash;
    delete draft.loadedRecoveryKeyHostUrl;
    delete draft.loadedRecoveryKeyOrgId;
  },
  failureStateProducer: (draft, { payload }) => {
    draft.redeemRecoveryKeyError = payload;
    draft.graph = {};
    delete draft.graphUpdatedAt;
    delete draft.trustedRoot;
    delete draft.signedTrustedRoot;
    draft.trustedSessionPubkeys = {};
  },
  handler: async (
    state,
    action,
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    const { type, payload } = action;
    if (!state.loadedRecoveryKeyHostUrl) {
      throw new Error("Action requires state.loadedRecoveryKeyHostUrl");
    }
    if (
      !(
        state.loadedRecoveryKey &&
        state.loadedRecoveryPrivkey &&
        state.loadedRecoveryKeyOrgId &&
        state.loadedRecoveryKeyIdentityHash
      ) ||
      state.loadRecoveryKeyError
    ) {
      return dispatchFailure(
        { type: "clientError", error: new Error("RecoveryKey not loaded") },
        context
      );
    }

    const apiSuccessContext: Client.Context = {
        ...context,
        accountIdOrCliKey: state.loadedRecoveryKey.userId,
        hostUrl: state.loadedRecoveryKeyHostUrl,
      },
      { pubkey, privkey } = await generateKeys(),
      signedPubkey = await signPublicKey({
        privkey: state.loadedRecoveryPrivkey!,
        pubkey,
      }),
      { pubkey: creatorPubkey } = state.graph[
        state.loadedRecoveryKey.creatorDeviceId
      ] as Model.OrgUserDevice,
      creatorPubkeyId = getPubkeyHash(creatorPubkey),
      updateTrustedRes = await dispatch(
        {
          type: Client.ActionType.ADD_TRUSTED_SESSION_PUBKEY,
          payload: {
            id: sha256(
              JSON.stringify([state.loadedRecoveryKey.deviceId, signedPubkey])
            ),
            trusted: [
              "orgUserDevice",
              signedPubkey,
              state.loadedRecoveryKey.pubkey,
              creatorPubkeyId,
            ],
          },
        },
        apiSuccessContext
      ),
      trustedPubkeys = updateTrustedRes.state.trustedRoot!,
      [envParams, signedTrustedRoot] = await Promise.all([
        encryptedKeyParamsForDeviceOrInvitee({
          state,
          privkey,
          pubkey: signedPubkey,
          userId: state.loadedRecoveryKey.userId,
          context,
        }),
        signJson({ data: trustedPubkeys, privkey }),
      ]),
      authProps = {
        type: <const>"redeemRecoveryKeyAuthParams",
        identityHash: state.loadedRecoveryKeyIdentityHash,
      },
      apiRes = await dispatch(
        {
          type: Api.ActionType.REDEEM_RECOVERY_KEY,
          payload: {
            ...envParams,
            device: {
              name: payload.deviceName,
              signedTrustedRoot: { data: signedTrustedRoot },
              pubkey: signedPubkey,
            },
            emailToken: state.loadedRecoveryKeyEmailToken,
          },
        },
        {
          ...apiSuccessContext,
          rootClientAction: action,
          auth: {
            ...authProps,
            signature: naclUtil.encodeBase64(
              nacl.sign.detached(
                naclUtil.decodeUTF8(
                  JSON.stringify(R.props(["identityHash"], authProps))
                ),
                naclUtil.decodeBase64(
                  state.loadedRecoveryPrivkey.keys.signingKey
                )
              )
            ),
          },
          dispatchContext: { privkey, hostUrl: state.loadedRecoveryKeyHostUrl },
        }
      );

    if (apiRes.success && apiRes.retriedWithUpdatedGraph) {
      return apiRes;
    }

    if (apiRes.success) {
      return dispatchSuccess(null, apiSuccessContext);
    } else {
      return dispatchFailure(
        (apiRes.resultAction as any).payload,
        apiSuccessContext
      );
    }
  },
});

clientAction<
  Api.Action.RequestActions["CreateRecoveryKey"],
  Api.Net.ApiResultTypes["CreateRecoveryKey"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_RECOVERY_KEY,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
});

clientAction<
  Api.Action.RequestActions["LoadRecoveryKey"],
  Api.Net.ApiResultTypes["LoadRecoveryKey"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.LOAD_RECOVERY_KEY,
  skipProcessRootPubkeyReplacements: true,
  skipReencryptPermitted: true,
  authenticated: true,
  loggableType: "fetchMetaAction",
  loggableType2: "authAction",
  successAccountIdFn: (payload) =>
    payload.type == "loadedRecoveryKey"
      ? payload.recoveryKey.userId
      : undefined,
  successStateProducer: (draft, { payload }) => {
    if (payload.type == "loadedRecoveryKey") {
      draft.graph = payload.graph;
      draft.graphUpdatedAt = payload.graphUpdatedAt;
      draft.signedTrustedRoot = payload.signedTrustedRoot;
      draft.loadedRecoveryKey = payload.recoveryKey;
    }
  },
});

clientAction<
  Api.Action.RequestActions["RedeemRecoveryKey"],
  Api.Net.ApiResultTypes["RedeemRecoveryKey"],
  Client.ClientError,
  {
    privkey: Crypto.Privkey;
    hostUrl: string;
  },
  Client.Action.ClientActions["RedeemRecoveryKey"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.REDEEM_RECOVERY_KEY,
  loggableType: "orgAction",
  loggableType2: "authAction",
  authenticated: true,
  graphAction: true,
  skipReencryptPermitted: true,
  successAccountIdFn: (payload) => payload.userId,
  successStateProducer: newAccountStateProducer,

  refreshActionCreator: (requestAction) => {
    return {
      type: Client.ActionType.LOAD_RECOVERY_KEY,
      payload: requestAction.payload,
    };
  },
});

const createRecoveryKey = async (
  state: Client.State,
  auth: Client.ClientUserAuth,
  context: Client.Context
): Promise<[Api.Net.ApiParamTypes["CreateRecoveryKey"], string]> => {
  if (!auth.privkey) {
    throw new Error("Action requires decrypted privkey");
  }

  const encryptionKey = secureRandomPhrase().join(" "),
    trustedRoot = state.trustedRoot!,
    { pubkey, privkey, encryptedPrivkey } = await generateKeys({
      encryptionKey,
    }),
    [signedPubkey, signedTrustedRoot] = await Promise.all([
      signPublicKey({
        privkey: auth.privkey!,
        pubkey,
      }),
      signJson({
        data: trustedRoot,
        privkey,
      }),
    ]),
    envParams = await encryptedKeyParamsForDeviceOrInvitee({
      state,
      privkey: auth.privkey!,
      pubkey: pubkey!,
      userId: auth.userId,
      context,
    });

  return [
    {
      ...envParams,
      recoveryKey: {
        identityHash: getIdentityHash({
          hostUrl: auth.hostUrl,
          encryptionKey,
        }),
        pubkey: signedPubkey,
        encryptedPrivkey: encryptedPrivkey as Crypto.EncryptedData,
      },
      signedTrustedRoot: { data: signedTrustedRoot },
    },
    encryptionKey,
  ];
};

const getIdentityHash = (params: {
  hostUrl: string;
  encryptionKey: string;
}): string => {
  return sha256(JSON.stringify(params));
};

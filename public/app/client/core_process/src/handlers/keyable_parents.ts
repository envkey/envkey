import { pick } from "@core/lib/utils/pick";
import * as R from "ramda";
import { generateKeys, signJson, signPublicKey } from "@core/lib/crypto/proxy";
import { secureRandomAlphanumeric } from "@core/lib/crypto/utils";
import { Client, Api, Model, Trust } from "@core/types";
import { clientAction, dispatch } from "../handler";
import { getAuth } from "@core/lib/client";
import {
  getServersByEnvironmentId,
  getLocalKeysByEnvironmentId,
} from "@core/lib/graph";
import { removeObjectProducers } from "../lib/status";
import { getPubkeyHash } from "@core/lib/client";
import { log } from "@core/lib/utils/logger";

const getCreateKeyableParentHandler =
  <
    ActionType extends Client.Action.ClientActions[
      | "CreateServer"
      | "CreateLocalKey"]
  >(
    keyableParentType: Model.KeyableParent["type"]
  ): Client.AsyncActionHandler<ActionType> =>
  async (state, { payload }, { context, dispatchSuccess, dispatchFailure }) => {
    const auth = getAuth(state, context.accountIdOrCliKey);
    if (!auth) {
      throw new Error("Authentication required.");
    }

    const apiRes = await dispatch(
      {
        type:
          keyableParentType == "server"
            ? Api.ActionType.CREATE_SERVER
            : Api.ActionType.CREATE_LOCAL_KEY,
        payload,
      } as any,
      context
    );

    if (apiRes.success) {
      const created =
        keyableParentType == "server"
          ? R.find(
              R.propEq("createdAt", apiRes.state.graphUpdatedAt),
              getServersByEnvironmentId(apiRes.state.graph)[
                payload.environmentId
              ] ?? []
            )
          : R.find(
              R.propEq("createdAt", apiRes.state.graphUpdatedAt),
              getLocalKeysByEnvironmentId(apiRes.state.graph)[
                payload.environmentId
              ] ?? []
            );

      const generateKeyRes = await dispatch(
        {
          type: Client.ActionType.GENERATE_KEY,
          payload: {
            appId: payload.appId,
            keyableParentType: created!.type,
            keyableParentId: created!.id,
          },
        },
        { ...context, skipWaitForSerialAction: true }
      );

      if (generateKeyRes.success) {
        return dispatchSuccess(null, context);
      } else {
        return dispatchFailure(
          (generateKeyRes.resultAction as Client.Action.FailureAction)
            .payload as Api.Net.ErrorResult,
          context
        );
      }
    } else {
      return dispatchFailure(
        (apiRes.resultAction as Client.Action.FailureAction)
          .payload as Api.Net.ErrorResult,
        context
      );
    }
  };

clientAction<Client.Action.ClientActions["CreateServer"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.CREATE_SERVER,
  serialAction: true,
  stateProducer: (draft, { payload }) => {
    draft.isCreatingServer[payload.environmentId] = true;
    delete draft.createServerErrors[payload.environmentId];
  },
  failureStateProducer: (draft, { meta: { rootAction }, payload }) => {
    const environmentId = rootAction.payload.environmentId;
    draft.createServerErrors[environmentId] = payload;
  },
  endStateProducer: (draft, { meta: { rootAction } }) => {
    const environmentId = rootAction.payload.environmentId;
    delete draft.isCreatingServer[environmentId];
  },
  handler:
    getCreateKeyableParentHandler<Client.Action.ClientActions["CreateServer"]>(
      "server"
    ),
});

clientAction<Client.Action.ClientActions["CreateLocalKey"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.CREATE_LOCAL_KEY,
  serialAction: true,
  stateProducer: (draft, { payload }) => {
    draft.isCreatingLocalKey[payload.environmentId] = true;
    delete draft.createLocalKeyErrors[payload.environmentId];
  },
  failureStateProducer: (draft, { meta: { rootAction }, payload }) => {
    const environmentId = rootAction.payload.environmentId;
    draft.createLocalKeyErrors[environmentId] = payload;
  },
  endStateProducer: (draft, { meta: { rootAction } }) => {
    const environmentId = rootAction.payload.environmentId;
    delete draft.isCreatingLocalKey[environmentId];
  },
  handler:
    getCreateKeyableParentHandler<
      Client.Action.ClientActions["CreateLocalKey"]
    >("localKey"),
});

clientAction<
  Client.Action.ClientActions["GenerateKey"],
  Client.GeneratedEnvkeyResult,
  Client.ClientError,
  Client.GeneratedEnvkeyResult
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.GENERATE_KEY,
  serialAction: true,
  stateProducer: (draft, { payload }) => {
    draft.isGeneratingKey[payload.keyableParentId] = true;
    delete draft.generateKeyErrors[payload.keyableParentId];
  },
  failureStateProducer: (draft, { meta: { rootAction }, payload }) => {
    const keyableParentId = rootAction.payload.keyableParentId;
    draft.generateKeyErrors[keyableParentId] = payload;
  },
  endStateProducer: (draft, { meta: { rootAction } }) => {
    const keyableParentId = rootAction.payload.keyableParentId;
    delete draft.isGeneratingKey[keyableParentId];
  },
  successStateProducer: (draft, { payload }) => {
    draft.generatedEnvkeys[payload.keyableParentId] = payload;
  },

  apiActionCreator: async (payload, state, context) => {
    const currentAuth = getAuth(state, context.accountIdOrCliKey);

    if (!currentAuth) {
      throw new Error("Action requires authentication");
    }

    const currentDeviceId =
        "deviceId" in currentAuth ? currentAuth.deviceId : currentAuth.userId,
      {
        pubkey,
        encryptedPrivkey,
        envkeyIdPart,
        signedTrustedRoot,
        encryptionKey,
      } = await generateKeyParams(state, context),
      apiParams = {
        ...pick(["appId", "keyableParentId", "keyableParentType"], payload),
        pubkey,
        encryptedPrivkey,
        envkeyIdPart,
        signedTrustedRoot,
      },
      { pubkey: currentUserPubkey } = state.graph[currentDeviceId] as
        | Model.CliUser
        | Model.OrgUserDevice,
      currentUserPubkeyId = getPubkeyHash(currentUserPubkey);

    dispatch(
      {
        type: Client.ActionType.ADD_TRUSTED_SESSION_PUBKEY,
        payload: {
          id: getPubkeyHash(pubkey),
          trusted: [
            "generatedEnvkey",
            pubkey,
            currentUserPubkeyId,
          ] as Trust.TrustedSessionPubkey,
        },
      },
      context
    );

    return {
      action: {
        type: Api.ActionType.GENERATE_KEY,
        payload: apiParams,
      },
      dispatchContext: {
        envkeyIdPart,
        encryptionKey,
        keyableParentId: payload.keyableParentId,
      },
    };
  },

  apiSuccessPayloadCreator: async (apiRes, dispatchContext) => dispatchContext!,
});

clientAction<Client.Action.ClientActions["ClearGeneratedEnvkey"]>({
  type: "clientAction",
  actionType: Client.ActionType.CLEAR_GENERATED_ENVKEY,
  stateProducer: (draft, { payload: { keyableParentId } }) => {
    delete draft.generatedEnvkeys[keyableParentId];
  },
});

clientAction<Client.Action.ClientActions["ClearAllGeneratedEnvkeys"]>({
  type: "clientAction",
  actionType: Client.ActionType.CLEAR_ALL_GENERATED_ENVKEYS,
  stateProducer: (draft) => {
    draft.generatedEnvkeys = {};
  },
});

clientAction<Api.Action.RequestActions["CreateServer"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_SERVER,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
});

clientAction<Api.Action.RequestActions["CreateLocalKey"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_LOCAL_KEY,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
});

clientAction<Api.Action.RequestActions["CheckEnvkey"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CHECK_ENVKEY,
  loggableType: "checkEnvkeyAction",
  loggableType2: "authAction",
});

clientAction<Api.Action.RequestActions["GenerateKey"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.GENERATE_KEY,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  graphProposer:
    ({ payload }, state, context) =>
    (graphDraft) => {
      const now = Date.now(),
        auth = getAuth(state, context.accountIdOrCliKey);

      if (!auth || ("token" in auth && !auth.token)) {
        throw new Error("Action requires authentication");
      }

      const proposalId = "generatedEnvkey";
      const keyableParent = graphDraft[
        payload.keyableParentId
      ] as Model.KeyableParent;

      graphDraft[proposalId] = {
        type: "generatedEnvkey",
        id: proposalId,
        ...pick(
          ["appId", "keyableParentId", "keyableParentType", "pubkey"],
          payload
        ),
        pubkeyId: getPubkeyHash(payload.pubkey),
        creatorId: auth.userId,
        creatorDeviceId: "deviceId" in auth ? auth.deviceId : undefined,
        signedById: "deviceId" in auth ? auth.deviceId : auth.userId,
        pubkeyUpdatedAt: now,
        envkeyShort: "",
        envkeyIdPartHash: "",
        environmentId: keyableParent.environmentId,
        createdAt: now,
        updatedAt: now,
        blobsUpdatedAt: now,
      };
    },
  encryptedKeysScopeFn: (graph, { payload: { keyableParentId } }) => ({
    keyableParentIds: new Set([keyableParentId]),
  }),
});

clientAction<
  Api.Action.RequestActions["DeleteServer"],
  Api.Net.ApiResultTypes["DeleteServer"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_SERVER,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
});

clientAction<
  Api.Action.RequestActions["DeleteLocalKey"],
  Api.Net.ApiResultTypes["DeleteLocalKey"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_LOCAL_KEY,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
});

clientAction<
  Api.Action.RequestActions["RevokeKey"],
  Api.Net.ApiResultTypes["RevokeKey"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.REVOKE_KEY,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
});

const generateKeyParams = async (
  state: Client.State,
  context: Client.Context
): Promise<
  Pick<
    Api.Net.ApiParamTypes["GenerateKey"],
    "pubkey" | "envkeyIdPart" | "signedTrustedRoot" | "encryptedPrivkey"
  > & {
    encryptionKey: string;
  }
> => {
  const currentAuth = getAuth(state, context.accountIdOrCliKey);
  if (!currentAuth || !currentAuth.privkey) {
    throw new Error("Action requires authentication and decrypted privkey");
  }
  if (!state.trustedRoot || R.isEmpty(state.trustedRoot)) {
    throw new Error("Requires trustedRoot");
  }

  const currentUserPrivkey = currentAuth.privkey;

  const envkeyIdPart = "ek" + secureRandomAlphanumeric(26),
    encryptionKey = secureRandomAlphanumeric(26),
    {
      pubkey: generatedPubkey,
      privkey: generatedPrivkey,
      encryptedPrivkey: generatedEncryptedPrivkey,
    } = await generateKeys({
      encryptionKey,
    }),
    trustedRoot = state.trustedRoot;

  const [signedPubkey, signedTrustedRoot] = await Promise.all([
    signPublicKey({
      pubkey: generatedPubkey,
      privkey: currentUserPrivkey,
    }),
    signJson({
      data: trustedRoot,
      privkey: generatedPrivkey,
    }),
  ]);

  return {
    pubkey: signedPubkey,
    encryptedPrivkey: generatedEncryptedPrivkey!,
    envkeyIdPart,
    signedTrustedRoot: { data: signedTrustedRoot },
    encryptionKey,
  };
};

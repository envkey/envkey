import { getDefaultApiHostUrl } from "./../../../shared/src/env";
import { Client, Api, Crypto, Model } from "@core/types";
import { clientAction, dispatch } from "../handler";
import { getAuth } from "@core/lib/client";
import { verifyKeypair, verifySignedTrustedRootPubkey } from "../lib/trust";
import {
  decryptPrivateKey,
  generateKeys,
  signPublicKey,
  signJson,
} from "@core/lib/crypto/proxy";
import { graphTypes } from "@core/lib/graph";
import { secureRandomAlphanumeric, sha256 } from "@core/lib/crypto/utils";
import {
  encryptedKeyParamsForDeviceOrInvitee,
  fetchEnvsForUserOrAccessParams,
} from "../lib/envs";
import { renameObjectProducers, removeObjectProducers } from "../lib/status";
import { initEnvironmentsIfNeeded } from "../lib/envs";
import * as R from "ramda";
import { log } from "@core/lib/utils/logger";

clientAction<
  Client.Action.ClientActions["CreateCliUser"],
  Client.State["generatedCliUsers"][0]
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.CREATE_CLI_USER,
  serialAction: true,
  stateProducer: (draft, { payload, meta: { tempId } }) => {
    draft.generatingCliUsers[tempId] = payload;
    draft.generateCliUserErrors = {};
  },
  failureStateProducer: (draft, { meta: { tempId, rootAction }, payload }) => {
    draft.generateCliUserErrors[tempId] = {
      error: payload,
      payload: rootAction.payload,
    };
  },
  successStateProducer: (draft, { payload }) => {
    draft.generatedCliUsers.push(payload);
  },
  endStateProducer: (draft, { meta: { tempId } }) => {
    delete draft.generatingCliUsers[tempId];
  },
  handler: async (
    state,
    action,
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    const { payload } = action;
    const auth = getAuth(state, context.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }

    const fetchRes = await fetchEnvsForUserOrAccessParams(
      state,
      [
        {
          accessParams: payload,
        },
      ],
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
      const [apiParams, cliKey] = await createCliUser(
          stateWithFetched!,
          payload,
          auth,
          context
        ),
        apiRes = await dispatch(
          {
            type: Api.ActionType.CREATE_CLI_USER,
            payload: apiParams,
          },
          { ...context, rootClientAction: action }
        );

      if (apiRes.success && apiRes.retriedWithUpdatedGraph) {
        return apiRes;
      }

      if (apiRes.success) {
        return dispatchSuccess(
          {
            user: { name: payload.name, orgRoleId: payload.orgRoleId },
            appUserGrants: payload.appUserGrants,
            cliKey,
          },
          context
        );
      } else {
        return dispatchFailure((apiRes.resultAction as any).payload, context);
      }
    } catch (err) {
      return dispatchFailure(
        {
          type: "clientError",
          error: { name: err.name, message: err.message },
        },
        context
      );
    }
  },

  successHandler: async (state, action, res, context) => {
    const auth = getAuth(state, context.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }

    await initEnvironmentsIfNeeded(state, auth.userId, context).catch((err) => {
      log("Error initializing locals", { err });
    });

    await dispatch({ type: Client.ActionType.CLEAR_CACHED }, context);
  },
});

clientAction<Client.Action.ClientActions["ClearGeneratedCliUsers"]>({
  type: "clientAction",
  actionType: Client.ActionType.CLEAR_GENERATED_CLI_USERS,
  stateProducer: (draft) => {
    draft.generatedCliUsers = [];
  },
});

clientAction<
  Api.Action.RequestActions["RenameCliUser"],
  Api.Net.ApiResultTypes["RenameCliUser"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.RENAME_CLI_USER,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...renameObjectProducers,
});

clientAction<
  Client.Action.ClientActions["AuthenticateCliKey"],
  Client.ClientCliAuth
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.AUTHENTICATE_CLI_KEY,
  verifyCurrentUser: true,
  stateProducer: (draft) => {
    draft.isAuthenticatingCliKey = true;
    delete draft.authenticateCliKeyError;
  },
  successStateProducer: (
    draft,
    {
      payload,
      meta: {
        rootAction: {
          payload: { cliKey },
        },
      },
    }
  ) => {
    draft.cliKeyAccounts[sha256(cliKey)] = payload;
  },
  failureStateProducer: (draft, { payload }) => {
    delete draft.signedTrustedRoot;
    draft.graph = {};
    delete draft.graphUpdatedAt;
    draft.authenticateCliKeyError = payload;
  },
  endStateProducer: (draft) => {
    delete draft.isAuthenticatingCliKey;
  },
  successHandler: async (state, action, res, context) => {
    dispatch(
      {
        type: Client.ActionType.CLEAR_ORPHANED_BLOBS,
      },
      context
    );
  },
  handler: async (
    state,
    action,
    { context: initialContext, dispatchSuccess, dispatchFailure }
  ) => {
    const { payload } = action;

    const cliKeyParts = payload.cliKey.split("-"),
      cliKeyIdPart = cliKeyParts[0] as string,
      encryptionKey = cliKeyParts[1] as string,
      // host may have dashes
      hostUrl = cliKeyParts[2] ? cliKeyParts.slice(2).join("-") : undefined,
      context: Client.Context = {
        ...initialContext,
        hostUrl,
        accountIdOrCliKey: payload.cliKey,
      },
      apiRes = await dispatch(
        {
          type: Api.ActionType.AUTHENTICATE_CLI_KEY,
          payload: { cliKeyIdPart },
        },
        { ...context, hostUrl, rootClientAction: action }
      );

    if (apiRes.success && apiRes.retriedWithUpdatedGraph) {
      return apiRes;
    }

    if (!apiRes.success) {
      return dispatchFailure((apiRes.resultAction as any).payload, context);
    }

    const apiPayload = (
      apiRes.resultAction as Client.Action.SuccessAction<
        Api.Action.RequestActions["AuthenticateCliKey"],
        Api.Net.ApiResultTypes["AuthenticateCliKey"]
      >
    ).payload;

    try {
      const privkey = await decryptPrivateKey({
          encryptedPrivkey: apiPayload.encryptedPrivkey,
          encryptionKey,
        }),
        cliUser = apiPayload.graph[apiPayload.userId] as Model.CliUser;

      await Promise.all([
        verifyKeypair(cliUser.pubkey, privkey),
        verifySignedTrustedRootPubkey(apiRes.state, cliUser.pubkey, context),
      ]);

      return dispatchSuccess(
        {
          type: "clientCliAuth",
          userId: cliUser.id,
          orgId: apiPayload.orgId,
          privkey,
          hostUrl: hostUrl ?? getDefaultApiHostUrl(),
          lastAuthAt: apiPayload.timestamp,
          addedAt:
            state.cliKeyAccounts[sha256(payload.cliKey)]?.addedAt ??
            apiPayload.timestamp,
          ...(apiPayload.hostType == "cloud"
            ? {
                hostType: "cloud",
              }
            : {
                hostType: "self-hosted",
                deploymentTag: apiPayload.deploymentTag,
              }),
        },
        context
      );
    } catch (err) {
      return dispatchFailure(
        {
          type: "clientError",
          error: { name: err.name, message: err.message },
        },
        context
      );
    }
  },
});

clientAction<
  Api.Action.RequestActions["CreateCliUser"],
  Api.Net.ApiResultTypes["CreateCliUser"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_CLI_USER,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
});

clientAction<
  Api.Action.RequestActions["DeleteCliUser"],
  Api.Net.ApiResultTypes["DeleteCliUser"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_CLI_USER,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
  encryptedKeysScopeFn: (graph, { payload: { id } }) => ({
    userIds: new Set([id]),
    envParentIds: "all",
    keyableParentIds: "all",
  }),
});

clientAction<
  Api.Action.RequestActions["AuthenticateCliKey"],
  Api.Net.ApiResultTypes["AuthenticateCliKey"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.AUTHENTICATE_CLI_KEY,
  loggableType: "authAction",
  successStateProducer: (draft, { meta, payload }) => {
    draft.signedTrustedRoot = payload.signedTrustedRoot;
    draft.graph = payload.graph;
    draft.graphUpdatedAt = payload.graphUpdatedAt;
  },
});

const createCliUser = async (
  state: Client.State,
  clientParams: Client.Action.ClientActions["CreateCliUser"]["payload"],
  auth: Client.ClientUserAuth | Client.ClientCliAuth,
  context: Client.Context
): Promise<[Api.Net.ApiParamTypes["CreateCliUser"], string]> => {
  if (!auth.privkey) {
    throw new Error("Action requires decrypted privkey");
  }

  const cliKeyIdPart = secureRandomAlphanumeric(22),
    encryptionKey = secureRandomAlphanumeric(22),
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
    accessParams: Model.AccessParams = {
      orgRoleId: clientParams.orgRoleId,
      appUserGrants: clientParams.appUserGrants,
    },
    envParams = await encryptedKeyParamsForDeviceOrInvitee({
      state,
      privkey: auth.privkey!,
      pubkey,
      userId: undefined,
      accessParams,
      context,
    });

  return [
    {
      ...envParams,
      pubkey: signedPubkey,
      encryptedPrivkey: encryptedPrivkey as Crypto.EncryptedData,
      signedTrustedRoot: { data: signedTrustedRoot },
      cliKeyIdPart,
      appUserGrants: clientParams.appUserGrants,
      name: clientParams.name,
      orgRoleId: clientParams.orgRoleId,
      importId: clientParams.importId,
    },
    [
      cliKeyIdPart,
      encryptionKey,
      auth.hostType == "self-hosted" ? auth.hostUrl : undefined,
    ]
      .filter(Boolean)
      .join("-"),
  ];
};

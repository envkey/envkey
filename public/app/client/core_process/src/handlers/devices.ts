import { clearNonPendingEnvsProducer } from "./../lib/envs/updates";
import * as R from "ramda";
import { Client, Api, Crypto, Trust, Model } from "@core/types";
import { clientAction, dispatch } from "../handler";
import {
  signJson,
  generateKeys,
  signPublicKey,
  decryptPrivateKey,
} from "@core/lib/crypto/proxy";
import { secureRandomAlphanumeric, sha256 } from "@core/lib/crypto/utils";

import { getAuth } from "@core/lib/client";
import {
  decryptedEnvsStateProducer,
  decryptEnvs,
  decryptChangesets,
  encryptedKeyParamsForDeviceOrInvitee,
  fetchEnvsForUserOrAccessParams,
} from "../lib/envs";
import {
  processRootPubkeyReplacementsIfNeeded,
  verifyKeypair,
  verifySignedTrustedRootPubkey,
} from "../lib/trust";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { newAccountStateProducer } from "../lib/state";
import { removeObjectProducers } from "../lib/status";
import { log } from "@core/lib/utils/logger";
import { decode as decodeBase58 } from "bs58";
import { updateLocalSocketEnvActionStatusIfNeeded } from "@core_proc/lib/envs/status";

clientAction<
  Client.Action.ClientActions["ApproveDevices"],
  Client.State["generatedDeviceGrants"]
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.APPROVE_DEVICES,
  serialAction: true,
  stateProducer: (draft, { payload, meta: { tempId } }) => {
    draft.generatingDeviceGrants[tempId] = payload;
    draft.generateDeviceGrantErrors = {};
  },
  failureStateProducer: (draft, { meta: { tempId, rootAction }, payload }) => {
    draft.generateDeviceGrantErrors[tempId] = {
      error: payload,
      payload: rootAction.payload,
    };
  },
  successStateProducer: (draft, { payload }) => {
    draft.generatedDeviceGrants = [...draft.generatedDeviceGrants, ...payload];
  },
  endStateProducer: (draft, { meta: { tempId } }) => {
    delete draft.generatingDeviceGrants[tempId];
    clearNonPendingEnvsProducer(draft);
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

    const trustedRoot = state.trustedRoot!,
      fetchRes = await fetchEnvsForUserOrAccessParams(
        state,
        payload.map(({ granteeId }) => ({
          userId: granteeId,
        })),
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
      const deviceGrantRes = await Promise.all(
          payload.map((clientParams) =>
            approveDevice(
              stateWithFetched!,
              clientParams,
              trustedRoot,
              auth,
              context
            )
          )
        ),
        res = await dispatch<Api.Action.BulkGraphAction>(
          {
            type: Api.ActionType.BULK_GRAPH_ACTION,
            payload: deviceGrantRes.map(([payload]) => ({
              type: Api.ActionType.CREATE_DEVICE_GRANT,
              payload,
              meta: {
                loggableType: "orgAction",
                graphUpdatedAt: stateWithFetched?.graphUpdatedAt,
              },
            })) as Api.Action.BulkGraphAction["payload"],
          },
          { ...context, rootClientAction: action }
        );

      if (res.success) {
        return dispatchSuccess(
          deviceGrantRes.map(([payload, encryptionKey]) => ({
            identityHash: payload.identityHash,
            encryptionKey,
            granteeId: payload.granteeId,
            createdAt: res.state.graphUpdatedAt!,
          })),
          context
        );
      } else {
        return dispatchFailure((res.resultAction as any)?.payload, context);
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

clientAction<Client.Action.ClientActions["ClearGeneratedDeviceGrants"]>({
  type: "clientAction",
  actionType: Client.ActionType.CLEAR_GENERATED_DEVICE_GRANTS,
  stateProducer: (draft) => {
    draft.generatedDeviceGrants = [];
  },
});

clientAction<Client.Action.ClientActions["ResetDeviceGrant"]>({
  type: "clientAction",
  actionType: Client.ActionType.RESET_DEVICE_GRANT,
  stateProducer: (draft) => {
    delete draft.loadedDeviceGrantIdentityHash;
    delete draft.loadedDeviceGrantPrivkey;
    delete draft.loadedDeviceGrant;
    delete draft.loadDeviceGrantError;
    delete draft.loadedDeviceGrantEmailToken;
    delete draft.loadedDeviceGrantOrgId;
  },
});

clientAction<
  Client.Action.ClientActions["LoadDeviceGrant"],
  Partial<Pick<Client.State, "envs" | "changesets">> &
    Required<
      Pick<
        Client.State,
        | "loadedDeviceGrantIdentityHash"
        | "loadedDeviceGrantPrivkey"
        | "loadedDeviceGrantEmailToken"
        | "loadedDeviceGrantHostUrl"
      >
    > & {
      timestamp: number;
    }
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.LOAD_DEVICE_GRANT,
  stateProducer: (draft) => {
    draft.isLoadingDeviceGrant = true;
    delete draft.loadedDeviceGrantIdentityHash;
    delete draft.loadedDeviceGrantEmailToken;
    delete draft.loadedDeviceGrantPrivkey;
    delete draft.loadedDeviceGrant;
    delete draft.loadDeviceGrantError;
    delete draft.loadedDeviceGrantOrgId;
    delete draft.loadedDeviceGrantHostUrl;
  },
  endStateProducer: (draft) => {
    delete draft.isLoadingDeviceGrant;
  },
  failureStateProducer: (draft, { payload }) => {
    draft.loadDeviceGrantError = payload;

    draft.graph = {};
    delete draft.graphUpdatedAt;
    delete draft.signedTrustedRoot;
    delete draft.trustedRoot;
    draft.trustedSessionPubkeys = {};
    delete draft.loadedDeviceGrant;
  },

  successStateProducer: (draft, action) => {
    decryptedEnvsStateProducer(draft, action);

    draft.loadedDeviceGrantIdentityHash =
      action.payload.loadedDeviceGrantIdentityHash;
    draft.loadedDeviceGrantPrivkey = action.payload.loadedDeviceGrantPrivkey;
    draft.loadedDeviceGrantEmailToken =
      action.payload.loadedDeviceGrantEmailToken;
    draft.loadedDeviceGrantHostUrl = action.payload.loadedDeviceGrantHostUrl;
  },

  handler: async (
    initialState,
    action,
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    let state = initialState;
    const { type, payload } = action,
      [identityHash, encryptionKey] = payload.encryptionToken.split("_"),
      hostUrl = naclUtil.encodeUTF8(
        decodeBase58(payload.emailToken.split("_")[2])
      ),
      apiRes = await dispatch(
        {
          type: Api.ActionType.LOAD_DEVICE_GRANT,
          payload: {},
        },
        {
          ...context,
          hostUrl,
          rootClientAction: action,
          auth: {
            type: <const>"loadDeviceGrantAuthParams",
            identityHash,
            emailToken: payload.emailToken,
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
        Api.Action.RequestActions["LoadDeviceGrant"],
        Api.Net.ApiResultTypes["LoadDeviceGrant"]
      >
    ).payload;

    if (apiPayload.type == "requiresExternalAuthError") {
      return dispatchFailure((apiRes.resultAction as any).payload, context);
    }

    // decrypt deviceGrant privkey, verify deviceGrant
    const grantedBy = apiPayload.graph[
        apiPayload.deviceGrant.grantedByUserId
      ] as Model.CliUser | Model.OrgUser,
      grantedByDevice =
        grantedBy.type == "orgUser"
          ? (apiPayload.graph[
              apiPayload.deviceGrant.grantedByDeviceId!
            ] as Model.OrgUserDevice)
          : undefined,
      grantee = apiPayload.graph[
        apiPayload.deviceGrant.granteeId
      ] as Model.OrgUser,
      serverIdentityHash = getIdentityHash({
        deviceGrantedBy: {
          type: grantedBy.type == "cliUser" ? "cliUser" : "orgUser",
          id: apiPayload.deviceGrant.grantedByUserId,
          pubkey:
            grantedBy.type == "cliUser"
              ? grantedBy.pubkey
              : grantedByDevice!.pubkey!,
          email: grantedBy.type == "orgUser" ? grantedBy.email : undefined,
        },
        grantee: { email: grantee.email },
        host: hostUrl,
        encryptionKey,
      });

    if (identityHash !== serverIdentityHash) {
      log("Identity hash mismatch", {
        identityHash,
        serverIdentityHash,
        hostUrl,
        emailToken: payload.emailToken,
      });
      return dispatchFailure(
        {
          type: "clientError",
          error: new Error("DeviceGrant integrity check failed"),
        },
        context
      );
    }

    const apiSuccessContext: Client.Context = {
      ...context,
      hostUrl,
      accountIdOrCliKey: apiPayload.deviceGrant.granteeId,
    };

    try {
      const deviceGrantPrivkey = await decryptPrivateKey({
        encryptedPrivkey: apiPayload.deviceGrant.encryptedPrivkey,
        encryptionKey,
      });

      const [_, verifyTrustedRes] = await Promise.all([
        verifyKeypair(apiPayload.deviceGrant.pubkey, deviceGrantPrivkey),
        verifySignedTrustedRootPubkey(
          state,
          apiPayload.deviceGrant.pubkey,
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
          deviceGrantPrivkey,
          apiSuccessContext,
          true
        ),
        decryptChangesets(
          state,
          apiPayload.changesets.keys ?? {},
          apiPayload.changesets.blobs ?? {},
          deviceGrantPrivkey,
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
          loadedDeviceGrantIdentityHash: identityHash,
          loadedDeviceGrantPrivkey: deviceGrantPrivkey,
          loadedDeviceGrantEmailToken: payload.emailToken,
          loadedDeviceGrantHostUrl: hostUrl,
          timestamp: (
            (apiRes.resultAction as any).payload as Api.Net.LoadedDeviceGrant
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

clientAction<
  Api.Action.RequestActions["LoadDeviceGrant"],
  Api.Net.ApiResultTypes["LoadDeviceGrant"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.LOAD_DEVICE_GRANT,
  skipProcessRootPubkeyReplacements: true,
  skipReencryptPermitted: true,
  authenticated: true,
  loggableType: "fetchMetaAction",
  loggableType2: "authAction",
  successAccountIdFn: (payload) =>
    payload.type == "loadedDeviceGrant"
      ? payload.deviceGrant.granteeId
      : undefined,
  successStateProducer: (draft, { payload }) => {
    if (payload.type == "loadedDeviceGrant") {
      draft.graph = payload.graph;
      draft.graphUpdatedAt = payload.graphUpdatedAt;
      draft.signedTrustedRoot = payload.signedTrustedRoot;
      draft.loadedDeviceGrant = payload.deviceGrant;
      draft.loadedDeviceGrantOrgId = payload.orgId;
    }
  },
});

clientAction<Client.Action.ClientActions["AcceptDeviceGrant"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.ACCEPT_DEVICE_GRANT,
  verifyCurrentUser: true,
  stateProducer: (draft, action) => {
    draft.isAcceptingDeviceGrant = true;
  },
  successStateProducer: (draft) => {
    draft.didAcceptDeviceGrant = true;
  },
  endStateProducer: (draft) => {
    delete draft.isAcceptingDeviceGrant;
    delete draft.loadedDeviceGrant;
    delete draft.loadedDeviceGrantIdentityHash;
    delete draft.loadedDeviceGrantPrivkey;
    delete draft.loadedDeviceGrantOrgId;
    delete draft.loadedDeviceGrantEmailToken;
  },
  failureStateProducer: (draft, { payload }) => {
    draft.acceptDeviceGrantError = payload;
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

    if (
      !(
        state.loadedDeviceGrant &&
        state.loadedDeviceGrantIdentityHash &&
        state.loadedDeviceGrantEmailToken &&
        state.loadedDeviceGrantPrivkey &&
        state.loadedDeviceGrantOrgId &&
        state.loadedDeviceGrantHostUrl
      ) ||
      state.loadDeviceGrantError
    ) {
      return dispatchFailure(
        { type: "clientError", error: new Error("DeviceGrant not loaded") },
        context
      );
    }

    const apiSuccessContext: Client.Context = {
      ...context,
      accountIdOrCliKey: state.loadedDeviceGrant.granteeId,
      hostUrl: state.loadedDeviceGrantHostUrl,
    };

    const { pubkey, privkey } = await generateKeys(),
      signedPubkey = await signPublicKey({
        privkey: state.loadedDeviceGrantPrivkey!,
        pubkey,
      }),
      trustedRoot = state.trustedRoot!,
      [envParams, signedTrustedRoot] = await Promise.all([
        encryptedKeyParamsForDeviceOrInvitee({
          state,
          privkey,
          pubkey: signedPubkey,
          userId: state.loadedDeviceGrant.granteeId,
          context,
        }),
        signJson({ data: trustedRoot, privkey }),
      ]);

    const authProps = {
        type: <const>"acceptDeviceGrantAuthParams",
        identityHash: state.loadedDeviceGrantIdentityHash,
        emailToken: state.loadedDeviceGrantEmailToken,
      },
      apiRes = await dispatch(
        {
          type: Api.ActionType.ACCEPT_DEVICE_GRANT,
          payload: {
            ...envParams,
            device: {
              name: payload.deviceName,
              signedTrustedRoot: { data: signedTrustedRoot },
              pubkey: signedPubkey,
            },
          },
        },
        {
          ...apiSuccessContext,
          rootClientAction: action,
          dispatchContext: { privkey, hostUrl: state.loadedDeviceGrantHostUrl },
          auth: {
            ...authProps,
            signature: naclUtil.encodeBase64(
              nacl.sign.detached(
                naclUtil.decodeUTF8(
                  JSON.stringify(
                    R.props(["identityHash", "emailToken"], authProps)
                  )
                ),
                naclUtil.decodeBase64(
                  state.loadedDeviceGrantPrivkey.keys.signingKey
                )
              )
            ),
          },
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

clientAction<Client.Action.ClientActions["ForgetDevice"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.FORGET_DEVICE,
  serialAction: true,
  successStateProducer: (
    draft,
    {
      meta: {
        rootAction: {
          payload: { accountId },
        },
      },
    }
  ) => {
    let defaultAccountId =
      draft.defaultAccountId === accountId ? undefined : draft.defaultAccountId;
    const orgUserAccounts = R.omit([accountId], draft.orgUserAccounts),
      remainingAccounts = Object.values<Client.ClientUserAuth>(orgUserAccounts);

    if (remainingAccounts.length == 1) {
      defaultAccountId = remainingAccounts[0]!.userId;
    }

    return {
      ...draft,
      ...Client.defaultAccountState,
      ...Client.defaultClientState,
      orgUserAccounts,
      defaultAccountId,
    };
  },
  handler: async (
    state,
    action,
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    const auth = getAuth<Client.ClientUserAuth>(
      state,
      action.payload.accountId
    );

    if (auth && auth.token) {
      // try to revoke device from server
      // if we can't, still clear it from device
      try {
        await dispatch(
          {
            type: Api.ActionType.FORGET_DEVICE,
            payload: {},
          },
          {
            ...context,
            rootClientAction: action,
            accountIdOrCliKey: action.payload.accountId,
          }
        );
      } catch (err) {}
    }

    return dispatchSuccess(null, context);
  },
});

clientAction<Client.Action.ClientActions["SetAuth"]>({
  type: "clientAction",
  actionType: Client.ActionType.SET_AUTH,
  stateProducer: (draft, { payload }) => {
    draft.orgUserAccounts[payload.userId] = payload;
  },
});

clientAction<
  Api.Action.RequestActions["AcceptDeviceGrant"],
  Api.Net.ApiResultTypes["AcceptDeviceGrant"],
  Client.ClientError,
  {
    privkey: Crypto.Privkey;
    hostUrl: string;
  },
  Client.Action.ClientActions["AcceptDeviceGrant"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.ACCEPT_DEVICE_GRANT,
  loggableType: "orgAction",
  loggableType2: "authAction",
  authenticated: true,
  graphAction: true,
  skipReencryptPermitted: true,
  successAccountIdFn: (payload) => payload.userId,
  successStateProducer: newAccountStateProducer,

  refreshActionCreator: (requestAction) => {
    return {
      type: Client.ActionType.LOAD_DEVICE_GRANT,
      payload: requestAction.payload,
    };
  },
});

clientAction<Api.Action.RequestActions["ForgetDevice"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.FORGET_DEVICE,
  loggableType: "authAction",
  loggableType2: "orgAction",
  authenticated: true,
  skipReencryptPermitted: true,
  skipProcessRootPubkeyReplacements: true,
  skipProcessRevocationRequests: true,
});

clientAction<Api.Action.RequestActions["RevokeDevice"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.REVOKE_DEVICE,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
});

clientAction<Api.Action.RequestActions["RevokeDeviceGrant"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.REVOKE_DEVICE_GRANT,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
});

const approveDevice = async (
    state: Client.State,
    clientParams: Client.Action.ClientActions["ApproveDevices"]["payload"][0],
    trustedRoot: Trust.RootTrustChain,
    auth: Client.ClientUserAuth | Client.ClientCliAuth,
    context: Client.Context
  ): Promise<[Api.Net.ApiParamTypes["CreateDeviceGrant"], string]> => {
    if (!auth.privkey) {
      throw new Error("Action requires decrypted privkey");
    }

    let currentUserPubkey: Crypto.Pubkey;
    if (auth.type == "clientUserAuth") {
      currentUserPubkey = (state.graph[auth.deviceId] as Model.OrgUserDevice)
        .pubkey!;
    } else {
      currentUserPubkey = (state.graph[auth.userId] as Model.CliUser).pubkey;
    }

    const encryptionKey = secureRandomAlphanumeric(22),
      {
        pubkey: deviceGrantPubkey,
        privkey: deviceGrantPrivkey,
        encryptedPrivkey: encryptedDeviceGrantPrivkey,
      } = await generateKeys({ encryptionKey }),
      [signedDeviceGrantPubkey, signedTrustedRoot] = await Promise.all([
        signPublicKey({
          privkey: auth.privkey!,
          pubkey: deviceGrantPubkey,
        }),
        signJson({
          data: trustedRoot,
          privkey: deviceGrantPrivkey,
        }),
      ]),
      granteeOrgUser = state.graph[clientParams.granteeId] as Model.OrgUser,
      identityHash = getIdentityHash({
        deviceGrantedBy: {
          type: auth.type == "clientUserAuth" ? "orgUser" : "cliUser",
          id: auth.userId,
          pubkey: currentUserPubkey,
          email: "email" in auth ? auth.email : undefined,
        },
        grantee: {
          email: granteeOrgUser.email,
        },
        host: auth.hostUrl,
        encryptionKey,
      }),
      envParams = await encryptedKeyParamsForDeviceOrInvitee({
        state,
        privkey: auth.privkey!,
        pubkey: deviceGrantPubkey,
        userId: clientParams.granteeId,
        context,
      });

    return [
      {
        ...envParams,
        identityHash,
        pubkey: signedDeviceGrantPubkey,
        encryptedPrivkey: encryptedDeviceGrantPrivkey!,
        signedTrustedRoot: { data: signedTrustedRoot },
        granteeId: clientParams.granteeId,
      },
      encryptionKey,
    ];
  },
  getIdentityHash = (params: {
    deviceGrantedBy: {
      type: "orgUser" | "cliUser";
      id: string;
      pubkey: Crypto.Pubkey;
      email: string | undefined;
    };
    grantee: {
      email: string;
    };
    host: string;
    encryptionKey: string;
  }): string => {
    return sha256(JSON.stringify(params));
  };

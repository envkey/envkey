import { clearNonPendingEnvsProducer } from "./../lib/envs/updates";
import {
  processRootPubkeyReplacementsIfNeeded,
  verifyCurrentUser,
} from "../lib/trust";
import { newAccountStateProducer } from "../lib/state";
import { pick } from "@core/lib/utils/pick";
import * as R from "ramda";
import { Client, Api, Crypto, Model } from "@core/types";
import { clientAction, dispatch } from "../handler";
import {
  signJson,
  generateKeys,
  signPublicKey,
  decryptPrivateKey,
} from "@core/lib/crypto/proxy";
import { secureRandomAlphanumeric, sha256 } from "@core/lib/crypto/utils";
import { getAuth } from "@core/lib/client";
import { graphTypes } from "@core/lib/graph";
import {
  decryptedEnvsStateProducer,
  decryptEnvs,
  decryptChangesets,
  encryptedKeyParamsForDeviceOrInvitee,
  fetchEnvsForUserOrAccessParams,
} from "../lib/envs";
import { verifyKeypair, verifySignedTrustedRootPubkey } from "../lib/trust";
import { removeObjectProducers } from "../lib/status";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { decode as decodeBase58 } from "bs58";
import { initEnvironmentsIfNeeded } from "../lib/envs";
import { log } from "@core/lib/utils/logger";
import { updateLocalSocketEnvActionStatusIfNeeded } from "@core_proc/lib/envs/status";

clientAction<
  Client.Action.ClientActions["InviteUsers"],
  Client.State["generatedInvites"]
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.INVITE_USERS,
  serialAction: true,
  stateProducer: (draft, { payload, meta: { tempId } }) => {
    draft.generatingInvites[tempId] = payload;
    draft.generateInviteErrors = {};
  },
  failureStateProducer: (draft, { meta: { tempId, rootAction }, payload }) => {
    draft.generateInviteErrors[tempId] = {
      error: payload,
      payload: rootAction.payload,
    };
    clearNonPendingEnvsProducer(draft);
  },
  successStateProducer: (draft, { payload }) => {
    draft.generatedInvites = [...draft.generatedInvites, ...payload];
    draft.pendingInvites = [];
    // non pending envs are cleared in successHandler, not here
  },
  endStateProducer: (draft, { meta: { tempId } }) => {
    delete draft.generatingInvites[tempId];
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
      payload.map(({ appUserGrants, user: { orgRoleId } }) => ({
        accessParams: { appUserGrants, orgRoleId },
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
      const inviteRes = await Promise.all(
          payload.map((clientParams) =>
            inviteUser(stateWithFetched!, clientParams, auth, context)
          )
        ),
        res = await dispatch<Api.Action.BulkGraphAction>(
          {
            type: Api.ActionType.BULK_GRAPH_ACTION,
            payload: inviteRes.map(([payload]) => ({
              type: Api.ActionType.CREATE_INVITE,
              payload,
              meta: {
                loggableType: "orgAction",
                graphUpdatedAt: stateWithFetched?.graphUpdatedAt,
              },
            })) as Api.Action.BulkGraphAction["payload"],
          },
          { ...context, rootClientAction: action }
        );

      if (res.success && res.retriedWithUpdatedGraph) {
        return res;
      }

      if (res.success) {
        const { orgUsers } = graphTypes(res.state.graph),
          orgUsersByUid = R.indexBy(R.prop("uid"), orgUsers);

        return dispatchSuccess(
          inviteRes.map(([payload, encryptionKey]) => ({
            ...pick(["appUserGrants", "identityHash"], payload),
            user: {
              ...payload.user,
              id: orgUsersByUid[payload.user.uid].id,
            },
            encryptionKey,
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

clientAction<Client.Action.ClientActions["ClearGeneratedInvites"]>({
  type: "clientAction",
  actionType: Client.ActionType.CLEAR_GENERATED_INVITES,
  stateProducer: (draft) => {
    draft.generatedInvites = [];
  },
});

clientAction<Client.Action.ClientActions["ResetInvite"]>({
  type: "clientAction",
  actionType: Client.ActionType.RESET_INVITE,
  stateProducer: (draft) => {
    delete draft.loadedInviteIdentityHash;
    delete draft.loadedInvitePrivkey;
    delete draft.loadedInvite;
    delete draft.loadInviteError;
    delete draft.loadedInviteEmailToken;
    delete draft.loadedInviteOrgId;
  },
});

clientAction<Client.Action.ClientActions["AddPendingInvite"]>({
  type: "clientAction",
  actionType: Client.ActionType.ADD_PENDING_INVITE,
  stateProducer: (draft, { payload }) => {
    draft.pendingInvites.push(payload);
  },
});

clientAction<Client.Action.ClientActions["UpdatePendingInvite"]>({
  type: "clientAction",
  actionType: Client.ActionType.UPDATE_PENDING_INVITE,
  stateProducer: (draft, { payload }) => {
    draft.pendingInvites[payload.index] = payload.pending;
  },
});

clientAction<Client.Action.ClientActions["RemovePendingInvite"]>({
  type: "clientAction",
  actionType: Client.ActionType.REMOVE_PENDING_INVITE,
  stateProducer: (draft, { payload }) => {
    draft.pendingInvites.splice(payload, 1);
  },
});

clientAction<
  Client.Action.ClientActions["LoadInvite"],
  Partial<Pick<Client.State, "envs" | "changesets">> &
    Required<
      Pick<
        Client.State,
        | "loadedInviteIdentityHash"
        | "loadedInvitePrivkey"
        | "loadedInviteEmailToken"
        | "loadedInviteHostUrl"
      >
    > & {
      timestamp: number;
    }
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.LOAD_INVITE,
  stateProducer: (draft) => {
    draft.isLoadingInvite = true;
    delete draft.loadedInviteIdentityHash;
    delete draft.loadedInvitePrivkey;
    delete draft.loadedInvite;
    delete draft.loadInviteError;
    delete draft.loadedInviteEmailToken;
    delete draft.loadedInviteOrgId;
  },
  endStateProducer: (draft) => {
    delete draft.isLoadingInvite;
  },
  failureStateProducer: (draft, { payload }) => {
    draft.loadInviteError = payload;

    draft.graph = {};
    delete draft.graphUpdatedAt;
    delete draft.signedTrustedRoot;
    delete draft.trustedRoot;
    draft.trustedSessionPubkeys = {};
    delete draft.loadedInvite;
  },

  successStateProducer: (draft, action) => {
    decryptedEnvsStateProducer(draft, action);

    draft.loadedInviteIdentityHash = action.payload.loadedInviteIdentityHash;
    draft.loadedInvitePrivkey = action.payload.loadedInvitePrivkey;
    draft.loadedInviteEmailToken = action.payload.loadedInviteEmailToken;
    draft.loadedInviteHostUrl = action.payload.loadedInviteHostUrl;
  },

  handler: async (
    initialState,
    action,
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    let state = initialState;
    const { payload } = action;
    const [identityHash, encryptionKey] = payload.encryptionToken.split("_"),
      hostUrl = naclUtil.encodeUTF8(
        decodeBase58(payload.emailToken.split("_")[2])
      ),
      apiRes = await dispatch(
        {
          type: Api.ActionType.LOAD_INVITE,
          payload: {},
        },
        {
          ...context,
          hostUrl,
          rootClientAction: action,
          auth: {
            type: "loadInviteAuthParams",
            identityHash,
            // this email token may include a hostname as a third segment after underscore
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

    const apiPayload = (
      apiRes.resultAction as Client.Action.SuccessAction<
        Api.Action.RequestActions["LoadInvite"],
        Api.Net.ApiResultTypes["LoadInvite"]
      >
    ).payload;

    if (apiPayload.type == "requiresExternalAuthError") {
      return dispatchFailure((apiRes.resultAction as any).payload, context);
    }

    // decrypt invite privkey, verify invite
    const invitedBy = apiPayload.graph[apiPayload.invite.invitedByUserId] as
        | Model.CliUser
        | Model.OrgUser,
      invitee = apiPayload.graph[apiPayload.invite.inviteeId] as Model.OrgUser,
      invitedByDevice =
        invitedBy.type == "orgUser"
          ? (apiPayload.graph[
              apiPayload.invite.invitedByDeviceId!
            ] as Model.OrgUserDevice)
          : undefined,
      serverIdentityHash = getIdentityHash({
        invitedBy: {
          type: invitedBy.type == "cliUser" ? "cliUser" : "orgUser",
          id: apiPayload.invite.invitedByUserId,
          pubkey:
            invitedBy.type == "cliUser"
              ? invitedBy.pubkey
              : invitedByDevice!.pubkey!,
          email: invitedBy.type == "orgUser" ? invitedBy.email : undefined,
        },
        invitee: { email: invitee.email },
        host: hostUrl,
        encryptionKey,
      });

    if (identityHash !== serverIdentityHash) {
      return dispatchFailure(
        {
          type: "clientError",
          error: new Error("Invite integrity check failed"),
        },
        context
      );
    }

    const apiSuccessContext: Client.Context = {
      ...context,
      hostUrl,
      accountIdOrCliKey: apiPayload.invite.inviteeId,
    };

    try {
      const invitePrivkey = await decryptPrivateKey({
        encryptedPrivkey: apiPayload.invite.encryptedPrivkey,
        encryptionKey,
      });

      const [_, verifyTrustedRes] = await Promise.all([
        verifyKeypair(apiPayload.invite.pubkey, invitePrivkey),
        verifySignedTrustedRootPubkey(
          apiRes.state,
          apiPayload.invite.pubkey,
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
          invitePrivkey,
          apiSuccessContext,
          true
        ),
        decryptChangesets(
          state,
          apiPayload.changesets.keys ?? {},
          apiPayload.changesets.blobs ?? {},
          invitePrivkey,
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
          loadedInviteIdentityHash: identityHash,
          loadedInvitePrivkey: invitePrivkey,
          loadedInviteEmailToken: payload.emailToken,
          loadedInviteHostUrl: hostUrl,
          timestamp: (
            (apiRes.resultAction as any).payload as Api.Net.LoadedInvite
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
  Api.Action.RequestActions["LoadInvite"],
  Api.Net.ApiResultTypes["LoadInvite"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.LOAD_INVITE,
  authenticated: true,
  skipProcessRootPubkeyReplacements: true,
  skipReencryptPermitted: true,
  loggableType: "fetchMetaAction",
  loggableType2: "authAction",
  successAccountIdFn: (payload) =>
    payload.type == "loadedInvite" ? payload.invite.inviteeId : undefined,
  successStateProducer: (draft, { payload }) => {
    if (payload.type == "loadedInvite") {
      draft.graph = payload.graph;
      draft.graphUpdatedAt = payload.graphUpdatedAt;
      draft.signedTrustedRoot = payload.signedTrustedRoot;
      draft.loadedInvite = payload.invite;
      draft.loadedInviteOrgId = payload.orgId;
    }
  },
});

clientAction<Client.Action.ClientActions["AcceptInvite"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.ACCEPT_INVITE,
  verifyCurrentUser: true,
  stateProducer: (draft) => {
    draft.isAcceptingInvite = true;
  },
  successStateProducer: (draft) => {
    draft.didAcceptInvite = true;
  },
  endStateProducer: (draft) => {
    delete draft.isAcceptingInvite;
    delete draft.loadedInvite;
    delete draft.loadedInviteIdentityHash;
    delete draft.loadedInvitePrivkey;
    delete draft.loadedInviteOrgId;
    delete draft.loadedInviteEmailToken;
    delete draft.loadedInviteHostUrl;
  },
  failureStateProducer: (draft, { payload }) => {
    draft.acceptInviteError = payload;
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
    const { payload } = action;

    if (
      !(
        state.loadedInvite &&
        state.loadedInviteIdentityHash &&
        state.loadedInvitePrivkey &&
        state.loadedInviteOrgId &&
        state.loadedInviteHostUrl &&
        state.loadedInviteEmailToken
      ) ||
      state.loadInviteError
    ) {
      return dispatchFailure(
        { type: "clientError", error: new Error("Invite not loaded") },
        context
      );
    }

    const org = state.graph[state.loadedInviteOrgId] as Model.Org;

    const apiSuccessContext = {
        ...context,
        hostUrl: state.loadedInviteHostUrl,
        accountIdOrCliKey: state.loadedInvite.inviteeId,
      },
      { pubkey, privkey } = await generateKeys(),
      signedPubkey = await signPublicKey({
        privkey: state.loadedInvitePrivkey!,
        pubkey,
      }),
      trustedRoot = state.trustedRoot!,
      [envParams, signedTrustedRoot] = await Promise.all([
        encryptedKeyParamsForDeviceOrInvitee({
          state,
          privkey,
          pubkey: signedPubkey,
          userId: state.loadedInvite.inviteeId,
          context,
        }),
        signJson({ data: trustedRoot, privkey }),
      ]),
      authProps = {
        type: <const>"acceptInviteAuthParams",
        identityHash: state.loadedInviteIdentityHash,
        emailToken: state.loadedInviteEmailToken,
      },
      apiRes = await dispatch(
        {
          type: Api.ActionType.ACCEPT_INVITE,
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
          dispatchContext: {
            privkey,
            hostUrl: state.loadedInviteHostUrl,
          },
          auth: {
            ...authProps,
            signature: naclUtil.encodeBase64(
              nacl.sign.detached(
                naclUtil.decodeUTF8(
                  JSON.stringify(
                    R.props(["identityHash", "emailToken"], authProps)
                  )
                ),
                naclUtil.decodeBase64(state.loadedInvitePrivkey.keys.signingKey)
              )
            ),
          },
        }
      );

    if (apiRes.success && apiRes.retriedWithUpdatedGraph) {
      return apiRes;
    }

    if (apiRes.success) {
      await verifyCurrentUser(apiRes.state, apiSuccessContext);
      return dispatchSuccess(null, context);
    } else {
      return dispatchFailure((apiRes.resultAction as any).payload, context);
    }
  },
});

clientAction<
  Api.Action.RequestActions["AcceptInvite"],
  Api.Net.ApiResultTypes["AcceptInvite"],
  Client.ClientError,
  {
    privkey: Crypto.Privkey;
    hostUrl: string;
  },
  Client.Action.ClientActions["AcceptInvite"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.ACCEPT_INVITE,
  loggableType: "orgAction",
  loggableType2: "authAction",
  authenticated: true,
  graphAction: true,
  skipReencryptPermitted: true,
  successAccountIdFn: (payload) => payload.userId,
  successStateProducer: newAccountStateProducer,

  refreshActionCreator: (requestAction) => {
    return {
      type: Client.ActionType.LOAD_INVITE,
      payload: requestAction.payload,
    };
  },
});

clientAction<Api.Action.RequestActions["RevokeInvite"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.REVOKE_INVITE,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
});

const inviteUser = async (
    initialState: Client.State,
    clientParams: Client.Action.ClientActions["InviteUsers"]["payload"][0],
    auth: Client.ClientUserAuth | Client.ClientCliAuth,
    context: Client.Context
  ): Promise<[Api.Net.ApiParamTypes["CreateInvite"], string]> => {
    if (!auth.privkey) {
      throw new Error("Action requires decrypted privkey");
    }

    let state = initialState;

    let currentUserPubkey: Crypto.Pubkey;
    if (auth.type == "clientUserAuth") {
      currentUserPubkey = (state.graph[auth.deviceId] as Model.OrgUserDevice)
        .pubkey!;
    } else {
      currentUserPubkey = (state.graph[auth.userId] as Model.CliUser).pubkey;
    }

    const encryptionKey = secureRandomAlphanumeric(22),
      trustedRoot = state.trustedRoot!,
      {
        pubkey: invitePubkey,
        privkey: invitePrivkey,
        encryptedPrivkey: encryptedInvitePrivkey,
      } = await generateKeys({ encryptionKey }),
      [signedInvitePubkey, signedTrustedRoot] = await Promise.all([
        signPublicKey({
          privkey: auth.privkey!,
          pubkey: invitePubkey,
        }),
        signJson({
          data: trustedRoot,
          privkey: invitePrivkey,
        }),
      ]),
      identityHash = getIdentityHash({
        invitedBy: {
          type: auth.type == "clientUserAuth" ? "orgUser" : "cliUser",
          id: auth.userId,
          pubkey: currentUserPubkey,
          email: "email" in auth ? auth.email : undefined,
        },
        invitee: {
          email: clientParams.user.email,
        },
        host: auth.hostUrl,
        encryptionKey,
      }),
      accessParams: Model.AccessParams = {
        orgRoleId: clientParams.user.orgRoleId,
        appUserGrants: clientParams.appUserGrants,
      },
      envParams = await encryptedKeyParamsForDeviceOrInvitee({
        state,
        privkey: auth.privkey!,
        pubkey: invitePubkey,
        accessParams,
        context,
      });

    return [
      {
        ...envParams,
        identityHash,
        pubkey: signedInvitePubkey,
        encryptedPrivkey: encryptedInvitePrivkey!,
        signedTrustedRoot: { data: signedTrustedRoot },
        user: clientParams.user,
        scim: clientParams.scim,
        appUserGrants: clientParams.appUserGrants,
      },
      encryptionKey,
    ];
  },
  getIdentityHash = (params: {
    invitedBy: {
      type: "orgUser" | "cliUser";
      id: string;
      pubkey: Crypto.Pubkey;
      email: string | undefined;
    };
    invitee: {
      email: string;
    };
    host: string;
    encryptionKey: string;
  }) => {
    const json = JSON.stringify(params),
      hash = sha256(json);

    return hash;
  };

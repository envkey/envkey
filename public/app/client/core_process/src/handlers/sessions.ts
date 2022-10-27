import * as R from "ramda";
import {
  fetchLoadedEnvs,
  fetchPendingEnvs,
  fetchRequiredEnvs,
  initLocalsIfNeeded,
} from "../lib/envs";
import { Client, Api, Model } from "@core/types";
import { clientAction, dispatch } from "../handler";
import { pick } from "@core/lib/utils/pick";
import { getAuth } from "@core/lib/client";
import { verifyCurrentUser } from "../lib/trust";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import * as g from "@core/lib/graph";
import { log } from "@core/lib/utils/logger";

clientAction<
  Client.Action.ClientActions["CreateSession"],
  {
    timestamp: number;
  }
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.CREATE_SESSION,
  stateProducer: (draft) => {
    draft.isCreatingSession = true;
    delete draft.createSessionError;
    delete draft.trustedRoot;
    draft.graph = {};
    delete draft.graphUpdatedAt;
    draft.trustedSessionPubkeys = {};
    delete draft.fetchSessionError;
  },
  endStateProducer: (draft) => {
    delete draft.isCreatingSession;
    delete draft.verifyingEmail;
    delete draft.emailVerificationCode;
  },
  failureStateProducer: (draft, { payload }) => {
    draft.createSessionError = payload;
  },
  successHandler: async (state, action, res, context) => {
    const auth = getAuth(state, context.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    // this will init / re-init locals if needed to fix rare changesets key mismatch bug from July 2022
    await initLocalsIfNeeded(state, auth.userId, context).catch((err) => {
      log("Error initializing locals", { err });
    });
  },
  handler: async (
    initialState,
    action,
    { context: contextParams, dispatchSuccess, dispatchFailure }
  ) => {
    let state = initialState;
    const { payload } = action;
    let auth = state.orgUserAccounts[
      payload.accountId
    ] as Client.ClientUserAuth;
    if (!auth) {
      throw new Error("Invalid account");
    }

    if (auth.provider == "email" && !payload.emailVerificationToken) {
      throw new Error("emailVerificationToken required");
    } else if (auth.provider != "email" && !payload.externalAuthSessionId) {
      throw new Error("externalAuthSessionId required");
    }

    const context = {
      ...contextParams,
      hostUrl: auth.hostUrl,
      accountIdOrCliKey: payload.accountId,
    };

    const signature = naclUtil.encodeBase64(
        nacl.sign.detached(
          naclUtil.decodeUTF8(
            JSON.stringify(
              R.props(["userId", "orgId", "deviceId", "provider"], auth)
            )
          ),
          naclUtil.decodeBase64(auth.privkey.keys.signingKey)
        )
      ),
      apiRes = await dispatch(
        {
          type: Api.ActionType.CREATE_SESSION,
          payload: {
            ...pick(["orgId", "userId", "deviceId"], auth),
            signature,
            ...(auth.provider == "email"
              ? {
                  provider: auth.provider,
                  emailVerificationToken: payload.emailVerificationToken!,
                }
              : {
                  provider: auth.provider,
                  externalAuthSessionId: payload.externalAuthSessionId!,
                }),
          },
        },
        { ...context, rootClientAction: action }
      );

    if (!apiRes.success) {
      return dispatchFailure((apiRes.resultAction as any).payload, context);
    }

    state = apiRes.state;

    const timestamp = (
      (apiRes.resultAction as any).payload as Api.Net.SessionResult
    ).timestamp;

    try {
      const verifyRes = await verifyCurrentUser(state, context);

      if (!verifyRes.success) {
        throw new Error("Couldn't verify current user");
      }

      state = verifyRes.state;

      const fetchLoadedRes = await fetchLoadedEnvs(state, context);

      if (fetchLoadedRes && !fetchLoadedRes.success) {
        throw new Error("Error fetching latest loaded environments");
      }

      if (fetchLoadedRes) {
        state = fetchLoadedRes.state;
      }

      const fetchPendingRes = await fetchPendingEnvs(
        fetchLoadedRes?.state ?? verifyRes.state,
        context
      );

      if (fetchPendingRes && !fetchPendingRes.success) {
        throw new Error("Error fetching latest pending environments");
      }

      if (fetchPendingRes) {
        state = fetchPendingRes.state;
      }

      const upgradeCryptoRes = await upgradeCryptoIfNeeded(
        state,
        auth.userId,
        context
      );
      if (upgradeCryptoRes && !upgradeCryptoRes.success) {
        throw new Error("Error upgrading to latest crypto version");
      }
    } catch (error) {
      return dispatchFailure({ type: "clientError", error }, context);
    }

    return dispatchSuccess({ timestamp }, context);
  },
});

clientAction<
  Api.Action.RequestActions["CreateSession"],
  Api.Net.ApiResultTypes["CreateSession"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_SESSION,
  loggableType: "authAction",
  successStateProducer: (draft, { meta, payload }) => {
    const accountId = payload.userId,
      orgAccount = draft.orgUserAccounts[accountId],
      org = payload.graph[payload.orgId] as Model.Org;

    draft.orgUserAccounts[accountId] = {
      ...orgAccount,
      ...pick(
        [
          "token",
          "email",
          "firstName",
          "lastName",
          "uid",
          "provider",
          "userId",
          "deviceId",
        ],
        payload
      ),
      externalAuthProviderId:
        draft.completedExternalAuth?.externalAuthProviderId,
      lastAuthAt: payload.timestamp,
      orgName: org.name,
      requiresPassphrase: org.settings.crypto.requiresPassphrase,
      requiresLockout: org.settings.crypto.requiresLockout,
      lockoutMs: org.settings.crypto.lockoutMs,
    } as Client.ClientUserAuth;

    if (payload.type == "tokenSession") {
      draft.signedTrustedRoot = payload.signedTrustedRoot;
    }

    draft.graph = payload.graph;
    draft.graphUpdatedAt = payload.graphUpdatedAt;
  },
});

clientAction<
  Client.Action.ClientActions["GetSession"],
  {
    timestamp?: number;
    notModified?: true;
  }
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.GET_SESSION,
  stateProducer: (draft) => {
    draft.isFetchingSession = true;
    delete draft.fetchSessionNotModified;
  },
  failureStateProducer: (draft, { payload }) => {
    draft.fetchSessionError = payload;
  },
  endStateProducer: (draft) => {
    delete draft.isFetchingSession;
  },
  successStateProducer: (draft, action) => {
    delete draft.fetchSessionError;
    draft.fetchSessionNotModified = action.payload.notModified ?? false;
  },
  successHandler: async (state, action, res, context) => {
    if (res.notModified) {
      return;
    }

    dispatch(
      {
        type: Client.ActionType.CLEAR_ORPHANED_BLOBS,
      },
      context
    );

    const auth = getAuth(state, context.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    // this will init / re-init locals if needed to fix rare changesets key mismatch bug from July 2022
    await initLocalsIfNeeded(state, auth.userId, context).catch((err) => {
      log("Error initializing locals", { err });
    });
  },
  handler: async (
    initialState,
    action,
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    if (action.payload?.noop) {
      return dispatchSuccess(
        { timestamp: Date.now(), notModified: true },
        context
      );
    }

    let state = initialState;

    let auth = getAuth<Client.ClientUserAuth>(state, context.accountIdOrCliKey);
    if (!auth) {
      throw new Error("Action requires authentication and decrypted privkey");
    }

    const apiRes = await dispatch(
      {
        type: Api.ActionType.GET_SESSION,
        payload: {
          graphUpdatedAt:
            R.isEmpty(state.graph) || action.payload?.omitGraphUpdatedAt
              ? undefined
              : state.graphUpdatedAt,
        },
      },
      { ...context, rootClientAction: action }
    );

    if (!apiRes.success) {
      return dispatchFailure((apiRes.resultAction as any).payload, context);
    }

    state = apiRes.state;

    if (
      (
        (apiRes.resultAction as any)
          .payload as Api.Net.ApiResultTypes["GetSession"]
      ).type == "notModified"
    ) {
      return dispatchSuccess({ notModified: true }, context);
    }

    const timestamp = (
      (apiRes.resultAction as any).payload as Api.Net.SessionResult
    ).timestamp;

    try {
      const verifyRes = await verifyCurrentUser(apiRes.state, context);

      if (!verifyRes.success) {
        log("Couldn't verify current user");
        throw new Error("Couldn't verify current user");
      }

      state = verifyRes.state;

      const fetchLoadedRes = await fetchLoadedEnvs(
        verifyRes.state,
        context,
        action.payload?.skipWaitForReencryption
      );

      if (fetchLoadedRes && !fetchLoadedRes.success) {
        log("Error fetching latest environments with pending changes");
        throw new Error(
          "Error fetching latest environments with pending changes"
        );
      }

      if (fetchLoadedRes) {
        state = fetchLoadedRes.state;
      }

      const fetchPendingRes = await fetchPendingEnvs(
        fetchLoadedRes?.state ?? verifyRes.state,
        context
      );

      if (fetchPendingRes && !fetchPendingRes.success) {
        log("Error fetching latest pending environments");
        throw new Error("Error fetching latest pending environments");
      }

      if (fetchPendingRes) {
        state = fetchPendingRes.state;
      }

      const upgradeCryptoRes = await upgradeCryptoIfNeeded(
        state,
        auth.userId,
        context
      );
      if (upgradeCryptoRes && !upgradeCryptoRes.success) {
        throw new Error("Error upgrading to latest crypto version");
      }
    } catch (error) {
      return dispatchFailure({ type: "clientError", error }, context);
    }

    return dispatchSuccess({ timestamp }, context);
  },
});

clientAction<Client.Action.ClientActions["SelectDefaultAccount"]>({
  type: "clientAction",
  actionType: Client.ActionType.SELECT_DEFAULT_ACCOUNT,
  stateProducer: (draft, { payload: { accountId } }) => ({
    ...draft,
    ...Client.defaultAccountState,
    ...Client.defaultClientState,
    defaultAccountId: accountId,
  }),
});

clientAction<Client.Action.ClientActions["SignOut"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.SIGN_OUT,
  successStateProducer: (
    draft,
    {
      meta: {
        rootAction: {
          payload: { accountId },
        },
      },
    }
  ) =>
    ({
      ...draft,
      ...R.omit(
        ["pendingEnvUpdates", "pendingEnvsUpdatedAt", "pendingInvites"],
        Client.defaultAccountState
      ),
      ...Client.defaultClientState,
      orgUserAccounts: {
        ...draft.orgUserAccounts,
        [accountId]: R.omit(["token"], draft.orgUserAccounts[accountId] ?? {}),
      },
    } as Client.State),
  handler: async (
    state,
    action,
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    const {
      payload: { accountId },
    } = action;

    // clear server token
    // if it fails we still just sign out on the client-side
    try {
      await dispatch(
        {
          type: Api.ActionType.CLEAR_TOKEN,
          payload: {},
        },
        { ...context, rootClientAction: action, accountIdOrCliKey: accountId }
      );
    } catch (err) {}

    return dispatchSuccess(null, context);
  },
});

clientAction<Client.Action.ClientActions["SignInPendingSelfHosted"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.SIGN_IN_PENDING_SELF_HOSTED,
  stateProducer: (draft, { meta, payload: { index, initToken } }) => {
    let orgId: string, userId: string, deviceId: string, token: string;

    const throwInvalidTokenErr = () => {
      throw new Error("Invalid self-hosted init token");
    };

    let parsed: [string, string, string, string];

    try {
      parsed = JSON.parse(
        naclUtil.encodeUTF8(naclUtil.decodeBase64(initToken))
      ) as [string, string, string, string];
    } catch (err) {
      return throwInvalidTokenErr();
    }

    if (parsed.length != 4 || !R.all((s) => typeof s == "string", parsed)) {
      return throwInvalidTokenErr();
    }

    [orgId, userId, deviceId, token] = parsed;

    const pendingAuth = draft.pendingSelfHostedDeployments[index];
    const now = Date.now();

    draft.orgUserAccounts[userId] = {
      ...R.omit(
        [
          "type",
          "subdomain",
          "domain",
          "codebuildLink",
          "registerAction",
          "customDomain",
          "verifiedSenderEmail",
          "notifySmsWhenDone",
        ],
        pendingAuth
      ),
      type: "clientUserAuth",
      orgId,
      userId,
      deviceId,
      token,
      addedAt: now,
      lastAuthAt: now,
    };

    delete draft.authenticatePendingSelfHostedAccountError;
    draft.authenticatingPendingSelfHostedAccountId = userId;
  },
  failureStateProducer: (draft, { meta, payload }) => {
    draft.authenticatePendingSelfHostedAccountError = payload;
  },
  successStateProducer: (draft, { meta, payload }) => {
    const index = meta.rootAction.payload.index;
    draft.pendingSelfHostedDeployments.splice(index, 1);
  },
  endStateProducer: (draft, { meta, payload }) => {
    delete draft.authenticatingPendingSelfHostedAccountId;
  },
  handler: async (
    state,
    { payload: { index, initToken } },
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    if (!state.authenticatingPendingSelfHostedAccountId) {
      throw new Error("state.authenticatingPendingSelfHostedAccountId not set");
    }

    const dispatchContext = {
      ...context,
      accountIdOrCliKey: state.authenticatingPendingSelfHostedAccountId,
    };

    const res = await dispatch(
      { type: Client.ActionType.GET_SESSION },
      dispatchContext
    );

    return res.success
      ? dispatchSuccess(null, dispatchContext)
      : dispatchFailure((res.resultAction as any)?.payload, dispatchContext);
  },
});

clientAction<
  Api.Action.RequestActions["GetSession"],
  Api.Net.ApiResultTypes["GetSession"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.GET_SESSION,
  loggableType: "fetchMetaAction",
  authenticated: true,
  failureStateProducer: (draft, { meta, payload }) => {
    const accountId = meta.accountIdOrCliKey;
    if (!accountId) {
      return;
    }

    if (
      typeof payload.error == "object" &&
      "code" in payload.error &&
      payload.error.code == 401
    ) {
      return {
        ...draft,
        ...R.omit(
          ["pendingEnvUpdates", "pendingEnvsUpdatedAt", "pendingInvites"],
          Client.defaultAccountState
        ),
        ...Client.defaultClientState,
        orgUserAccounts: {
          ...draft.orgUserAccounts,
          [accountId]: R.omit(
            ["token"],
            draft.orgUserAccounts[accountId] ?? {}
          ),
        },
      } as Client.State;
    }
  },
  successStateProducer: (draft, { meta, payload }) => {
    if (payload.type == "notModified") {
      return draft;
    }

    const accountId = meta.accountIdOrCliKey!,
      orgAccount = draft.orgUserAccounts[accountId]!,
      org = payload.graph[payload.orgId] as Model.Org;

    draft.orgUserAccounts[accountId] = {
      ...orgAccount,
      ...pick(
        [
          "token",
          "email",
          "firstName",
          "lastName",
          "uid",
          "provider",
          "userId",
          "deviceId",
        ],
        payload
      ),
      lastAuthAt: payload.timestamp,
      orgName: org.name,
      requiresPassphrase: org.settings.crypto.requiresPassphrase,
      requiresLockout: org.settings.crypto.requiresLockout,
      lockoutMs: org.settings.crypto.lockoutMs,
    } as Client.ClientUserAuth;

    draft.signedTrustedRoot = payload.signedTrustedRoot;
    draft.graph = payload.graph;
    draft.graphUpdatedAt = payload.graphUpdatedAt;
  },
});

clientAction<Api.Action.RequestActions["ClearToken"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CLEAR_TOKEN,
  loggableType: "authAction",
  authenticated: true,
});

clientAction<Api.Action.RequestActions["ClearUserTokens"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CLEAR_USER_TOKENS,
  loggableType: "authAction",
  authenticated: true,
  stateProducer: (draft, { payload: { userId } }) => {
    draft.isClearingUserTokens[userId] = true;
  },
  endStateProducer: (
    draft,
    {
      meta: {
        rootAction: {
          payload: { userId },
        },
      },
    }
  ) => {
    delete draft.isClearingUserTokens[userId];
  },
  successStateProducer: (
    draft,
    {
      meta: {
        accountIdOrCliKey,
        rootAction: {
          payload: { userId },
        },
      },
    }
  ) => {
    // if user just cleared their own tokens, sign them out
    const auth = getAuth(draft, accountIdOrCliKey)!;
    if (auth.userId == userId) {
      return {
        ...draft,
        ...R.omit(
          ["pendingEnvUpdates", "pendingEnvsUpdatedAt", "pendingInvites"],
          Client.defaultAccountState
        ),
        ...Client.defaultClientState,
        orgUserAccounts: {
          ...draft.orgUserAccounts,
          [accountIdOrCliKey!]: R.omit(
            ["token"],
            draft.orgUserAccounts[accountIdOrCliKey!]
          ),
        },
      } as Client.State;
    }
  },
});

clientAction<Api.Action.RequestActions["ClearOrgTokens"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CLEAR_ORG_TOKENS,
  loggableType: "authAction",
  authenticated: true,
  stateProducer: (draft) => {
    draft.isClearingOrgTokens = true;
  },
  endStateProducer: (draft) => {
    delete draft.isClearingOrgTokens;
  },
  successStateProducer: (draft, { meta: { accountIdOrCliKey } }) => {
    // since all org tokens were just cleared, sign out user
    return {
      ...draft,
      ...R.omit(
        ["pendingEnvUpdates", "pendingEnvsUpdatedAt", "pendingInvites"],
        Client.defaultAccountState
      ),
      ...Client.defaultClientState,
      orgUserAccounts: {
        ...draft.orgUserAccounts,
        [accountIdOrCliKey!]: R.omit(
          ["token"],
          draft.orgUserAccounts[accountIdOrCliKey!]
        ),
      },
    } as Client.State;
  },
});

export const upgradeCryptoIfNeeded = async (
  state: Client.State,
  currentUserId: string,
  context: Client.Context
) => {
  const { org, environments } = g.graphTypes(state.graph);

  if (!org["upgradedCrypto-2.1.0"]) {
    const environmentIds = environments
      .filter(
        (environment) =>
          !environment["upgradedCrypto-2.1.0"] &&
          g.authz.canUpdateEnv(state.graph, currentUserId, environment.id)
      )
      .map(R.prop("id"));

    const fetchRes = await fetchRequiredEnvs(
      state,
      new Set(environmentIds),
      new Set(),
      context
    );

    if (fetchRes && !fetchRes.success) {
      return fetchRes;
    }

    return dispatch<Client.Action.ClientActions["CommitEnvs"]>(
      {
        type: Client.ActionType.COMMIT_ENVS,
        payload: {
          pendingEnvironmentIds: environmentIds,
          upgradeCrypto: true,
        },
      },
      context
    );
  }
};

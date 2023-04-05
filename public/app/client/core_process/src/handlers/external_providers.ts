import { clientAction, dispatch } from "../handler";
import { Api, Client } from "@core/types";
import { statusProducers } from "../lib/status";
import { wait } from "@core/lib/utils/wait";
import { log } from "@core/lib/utils/logger";
import { decode as decodeBase58 } from "bs58";
import naclUtil from "tweetnacl-util";
import { openExternalUrl } from "@core_proc/lib/open";

clientAction<Api.Action.RequestActions["CreateOrgSamlProvider"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_ORG_SAML_PROVIDER,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...statusProducers("isCreatingSamlProvider", "createSamlError"),
  successStateProducer: (draft, { payload }) => {},
});

clientAction<Api.Action.RequestActions["UpdateOrgSamlSettings"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.UPDATE_ORG_SAML_SETTINGS,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...statusProducers("isUpdatingSamlSettings", "updatingSamlSettingsError"),
});

clientAction<Api.Action.RequestActions["DeleteExternalAuthProvider"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_EXTERNAL_AUTH_PROVIDER,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...statusProducers("isDeletingAuthProvider", "deleteAuthProviderError"),
});

clientAction<Api.Action.RequestActions["GetExternalAuthProviders"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.GET_EXTERNAL_AUTH_PROVIDERS,
  loggableType: "authAction",
  authenticated: true,
  stateProducer: (draft) => {
    draft.isFetchingAuthProviders = true;
    delete draft.fetchAuthProvidersError;
  },
  failureStateProducer: (draft, { payload }) => {
    delete draft.isFetchingAuthProviders;
    draft.fetchAuthProvidersError = payload;
  },
  successStateProducer: (draft, { payload }) => {
    delete draft.isFetchingAuthProviders;
    draft.externalAuthProviders = payload.providers;
    draft.samlSettingsByProviderId = payload.samlSettingsByProviderId ?? {};
  },
});

clientAction<Api.Action.RequestActions["GetExternalAuthSession"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.GET_EXTERNAL_AUTH_SESSION,
  loggableType: "hostAction",
  ...statusProducers(
    "isFetchingExternalAuthSession",
    "fetchExternalAuthSessionError"
  ),
});

clientAction<Api.Action.RequestActions["CreateExternalAuthSession"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_EXTERNAL_AUTH_SESSION,
  loggableType: "hostAction",
  stateProducer: (draft) => {
    draft.creatingExternalAuthSession = true;
    delete draft.pendingExternalAuthSession;
    delete draft.startingExternalAuthSessionError;
    delete draft.externalAuthSessionCreationError;
    delete draft.authorizingExternallyErrorMessage;
  },
  failureStateProducer: (draft, { payload }) => {
    draft.externalAuthSessionCreationError = payload;
  },
  endStateProducer: (draft) => {
    delete draft.creatingExternalAuthSession;
  },
  successStateProducer: (draft, { payload }) => {
    const { id, authUrl } = payload;
    draft.pendingExternalAuthSession = { id, authUrl };
  },
});

clientAction<Client.Action.ClientActions["ClearPendingExternalAuthSession"]>({
  type: "clientAction",
  actionType: Client.ActionType.CLEAR_PENDING_EXTERNAL_AUTH_SESSION,
  stateProducer: (draft) => {
    delete draft.isAuthorizingExternallyForSessionId;
    delete draft.pendingExternalAuthSession;
  },
});

clientAction<Client.Action.ClientActions["SetExternalAuthSessionResult"]>({
  type: "clientAction",
  actionType: Client.ActionType.SET_EXTERNAL_AUTH_SESSION_RESULT,
  stateProducer: (draft, { payload }) => {
    delete draft.isAuthorizingExternallyForSessionId;
    delete draft.pendingExternalAuthSession;

    if ("authorizingExternallyErrorMessage" in payload) {
      draft.authorizingExternallyErrorMessage =
        payload.authorizingExternallyErrorMessage;
    } else {
      const {
        externalAuthSessionId,
        externalAuthProviderId,
        orgId,
        userId,
        authType,
      } = payload;
      draft.completedExternalAuth = {
        externalAuthSessionId,
        externalAuthProviderId,
        orgId,
        userId,
        authType,
      };
    }
  },
});

clientAction<Client.Action.ClientActions["WaitForExternalAuth"]>({
  type: "clientAction",
  actionType: Client.ActionType.WAIT_FOR_EXTERNAL_AUTH,
  stateProducer: (draft, { payload }) => {
    draft.isAuthorizingExternallyForSessionId = payload.externalAuthSessionId;
    draft.completedExternalAuth = undefined;
    delete draft.startingExternalAuthSessionError;
    delete draft.externalAuthSessionCreationError;
    delete draft.authorizingExternallyErrorMessage;
  },
  handler: async (state, { payload }, context) => {
    const { externalAuthSessionId, externalAuthProviderId, authType } = payload;
    let successPayload: typeof state.completedExternalAuth | undefined;
    let loadResSuccessContext: Client.Context | undefined;

    let awaitingLogin = true;
    let iterationsLeft = 1200;
    let orgId: string | undefined;
    let userId: string | undefined;

    while (awaitingLogin) {
      iterationsLeft--;
      if (iterationsLeft <= 0) {
        log("External login timed out", { payload });
        const res = await dispatch(
          {
            type: Client.ActionType.SET_EXTERNAL_AUTH_SESSION_RESULT,
            payload: {
              authorizingExternallyErrorMessage: `External login timed out for session ${externalAuthSessionId}`,
            },
          },
          context
        );
        if (
          externalAuthSessionId ===
          res.state.isAuthorizingExternallyForSessionId
        ) {
          // still the same session
          await dispatch(
            {
              type: Client.ActionType.CLEAR_PENDING_EXTERNAL_AUTH_SESSION,
            },
            context
          );
        }
        return;
      }

      const loadRes = await dispatch(
        {
          type: Api.ActionType.GET_EXTERNAL_AUTH_SESSION,
          payload: {
            id: externalAuthSessionId,
          },
        },
        context
      );

      const wasDeleted =
        "payload" in loadRes.resultAction &&
        "errorStatus" in loadRes.resultAction?.payload &&
        loadRes.resultAction?.payload?.errorStatus === 404;
      const newSessionSpawned =
        externalAuthSessionId !==
        loadRes.state.isAuthorizingExternallyForSessionId;
      if (wasDeleted || newSessionSpawned) {
        log("External auth session cancelled", {
          thisLoop: payload,
          otherSession: loadRes.state.isAuthorizingExternallyForSessionId,
        });
        return;
      }
      const resultActionPayload = (loadRes as any).resultAction
        .payload as Api.Net.ApiResultTypes["GetExternalAuthSession"];

      const failure = (loadRes as any)
        .resultAction as Client.Action.FailureAction;
      const stillWaitingExternally =
        resultActionPayload.type === "requiresExternalAuthError";
      if (stillWaitingExternally) {
        await wait(1000);
        continue;
      }

      if (resultActionPayload.type !== "externalAuthSession") {
        await dispatch(
          {
            type: Client.ActionType.SET_EXTERNAL_AUTH_SESSION_RESULT,
            payload: {
              authorizingExternallyErrorMessage:
                resultActionPayload.errorStatus?.toString() ?? failure.type!,
            },
          },
          context
        );
        return;
      }

      // user successfully auth'd elsewhere

      ({ userId, orgId } = resultActionPayload.session);

      log("External auth for session completed", {
        externalAuthSessionId,
        userId,
        orgId,
      });
      loadResSuccessContext = {
        ...context,
        accountIdOrCliKey: userId!,
      };

      awaitingLogin = false; // success
    }

    successPayload = {
      authType,
      externalAuthProviderId,
      externalAuthSessionId,
      orgId: orgId!,
      userId: userId!,
    };

    await dispatch(
      {
        type: Client.ActionType.SET_EXTERNAL_AUTH_SESSION_RESULT,
        payload: successPayload,
      },
      loadResSuccessContext!
    );
  },
});

clientAction<Client.Action.ClientActions["WaitForInviteExternalAuth"]>({
  type: "clientAction",
  actionType: Client.ActionType.WAIT_FOR_INVITE_EXTERNAL_AUTH,
  stateProducer: (draft, { payload }) => {
    draft.isAuthorizingExternallyForSessionId = payload.externalAuthSessionId;
    draft.completedExternalAuth = undefined;
    draft.authorizingExternallyErrorMessage = undefined;
  },
  handler: async (state, { payload }, context) => {
    const {
      externalAuthSessionId,
      authType,
      orgId,
      externalAuthProviderId,
      emailToken,
      encryptionToken,
      loadActionType,
    } = payload;
    const loadActionPayload = {
      emailToken,
      encryptionToken,
    };
    let successPayload: typeof state.completedExternalAuth | undefined;
    let loadResSuccessContext: Client.Context | undefined;
    let userId: string | undefined;
    let sentById: string | undefined;

    let awaitingLogin = true;
    let iterationsLeft = 1200;

    while (awaitingLogin) {
      iterationsLeft--;
      if (iterationsLeft <= 0) {
        log("External login timed out", { payload });
        const res = await dispatch(
          {
            type: Client.ActionType.SET_EXTERNAL_AUTH_SESSION_RESULT,
            payload: {
              authorizingExternallyErrorMessage: `External login timed out for session ${externalAuthSessionId}`,
            },
          },
          context
        );
        if (
          externalAuthSessionId ===
          res.state.isAuthorizingExternallyForSessionId
        ) {
          // still the same session
          await dispatch(
            {
              type: Client.ActionType.CLEAR_PENDING_EXTERNAL_AUTH_SESSION,
            },
            context
          );
        }
        return;
      }

      const loadRes = await dispatch(
        {
          type: loadActionType,
          payload: loadActionPayload,
        },
        context
      );

      if (
        externalAuthSessionId !==
        loadRes.state.isAuthorizingExternallyForSessionId
      ) {
        log("External auth session cancelled", {
          thisLoop: payload,
          otherSession: loadRes.state.isAuthorizingExternallyForSessionId,
        });
        return;
      }

      if (!loadRes.success) {
        const resultAction =
          loadRes.resultAction as Client.Action.FailureAction;
        const stillWaitingExternally =
          resultAction.payload.type === "requiresExternalAuthError";
        if (stillWaitingExternally) {
          await wait(1000);
          continue;
        }
        await dispatch(
          {
            type: Client.ActionType.SET_EXTERNAL_AUTH_SESSION_RESULT,
            payload: {
              authorizingExternallyErrorMessage: ("errorReason" in
              resultAction.payload
                ? resultAction.payload.errorReason
                : resultAction.payload.type)!,
            },
          },
          context
        );
        return;
      }
      const loadedInviteOrDeviceGrant = (
        payload.loadActionType === Client.ActionType.LOAD_INVITE
          ? loadRes.state.loadedInvite
          : loadRes.state.loadedDeviceGrant
      )!;
      userId =
        "inviteeId" in loadedInviteOrDeviceGrant
          ? loadedInviteOrDeviceGrant.inviteeId
          : loadedInviteOrDeviceGrant.granteeId;
      sentById =
        "invitedByUserId" in loadedInviteOrDeviceGrant
          ? loadedInviteOrDeviceGrant.invitedByUserId
          : loadedInviteOrDeviceGrant.grantedByUserId;

      log("External auth for session completed", {
        externalAuthSessionId,
        userId,
      });
      loadResSuccessContext = {
        ...context,
        accountIdOrCliKey: userId,
      };

      awaitingLogin = false; // success
    }

    successPayload = {
      authType,
      orgId,
      externalAuthSessionId,
      externalAuthProviderId,
      userId: userId!,
      sentById: sentById!,
    };

    await dispatch(
      {
        type: Client.ActionType.SET_EXTERNAL_AUTH_SESSION_RESULT,
        payload: successPayload,
      },
      loadResSuccessContext!
    );
  },
});

// returns quickly but triggers WaitForInviteExternalAuth in background
clientAction<Client.Action.ClientActions["CreateExternalAuthSessionForLogin"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.CREATE_EXTERNAL_AUTH_SESSION_FOR_LOGIN,
  stateProducer: (draft) => {
    draft.startingExternalAuthSession = true;
    delete draft.startingExternalAuthSessionError;
    delete draft.externalAuthSessionCreationError;
    delete draft.authorizingExternallyErrorMessage;
  },
  failureStateProducer: (draft, { meta, payload }) => {
    if (payload.type === "requiresEmailAuthError") {
      draft.orgUserAccounts[meta.rootAction.payload.userId] = {
        ...draft.orgUserAccounts[meta.rootAction.payload.userId]!,
        provider: "email",
        externalAuthProviderId: undefined,
      };
    } else if (payload.type === "signInWrongProviderError") {
      draft.orgUserAccounts[meta.rootAction.payload.userId] = {
        ...draft.orgUserAccounts[meta.rootAction.payload.userId]!,
        provider: payload.providers[0].provider,
        externalAuthProviderId: payload.providers[0].externalAuthProviderId,
      };
    }
    draft.startingExternalAuthSessionError = payload;
  },
  endStateProducer: (draft) => {
    delete draft.startingExternalAuthSession;
  },
  handler: async (
    state,
    { payload },
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    const {
      waitOpenMs,
      authMethod,
      externalAuthProviderId,
      orgId,
      userId,
      provider,
    } = payload;
    let externalAuthSessionId: string | undefined;

    const sessionPayload: Api.Net.CreateExternalAuthSession = {
      authType: "sign_in",
      authMethod,
      provider,
      orgId,
      userId,
      externalAuthProviderId,
    };

    const res = await dispatch(
      {
        type: Api.ActionType.CREATE_EXTERNAL_AUTH_SESSION,
        payload: sessionPayload,
      },
      context
    );
    if (!res.success) {
      return dispatchFailure(
        (res.resultAction as Client.Action.FailureAction)
          .payload as Api.Net.ErrorResult,
        context
      );
    }
    const authResPayload = (res.resultAction as any)?.payload as
      | Api.Net.ApiResultTypes["CreateExternalAuthSession"]
      | Api.Net.RequiresEmailAuthResult;
    if (authResPayload.type !== "pendingExternalAuthSession") {
      // most likely, saml provider was deleted and user fell back to email auth
      return dispatchFailure(authResPayload, context);
    }

    log("Successfully created a pending external auth session", authResPayload);

    externalAuthSessionId = authResPayload.id;

    const backgroundWork = () => {
      // User's web browser will open and ask them to log in.
      openExternalUrl(authResPayload.authUrl);

      // BACKGROUND
      // Check for successful external auth, or time out.
      dispatch(
        {
          type: Client.ActionType.WAIT_FOR_EXTERNAL_AUTH,
          payload: {
            authMethod,
            provider,
            authType: "sign_in",
            externalAuthProviderId,
            externalAuthSessionId: externalAuthSessionId!,
          },
        },
        context
      );
    };

    setTimeout(backgroundWork, waitOpenMs);

    return dispatchSuccess(null, context);
  },
});

clientAction<Client.Action.ClientActions["ResetExternalAuth"]>({
  type: "clientAction",
  actionType: Client.ActionType.RESET_EXTERNAL_AUTH,
  stateProducer: (draft) => {
    delete draft.completedExternalAuth;
    delete draft.startingExternalAuthSession;
    delete draft.startingExternalAuthSessionInvite;
    delete draft.startingExternalAuthSessionError;
    delete draft.startingExternalAuthSessionInviteError;
    delete draft.externalAuthSessionCreationError;
    delete draft.authorizingExternallyErrorMessage;
    delete draft.isAuthorizingExternallyForSessionId;
    delete draft.pendingExternalAuthSession;
  },
});

// returns quickly but triggers WaitForInviteExternalAuth in background
clientAction<Client.Action.ClientActions["CreateExternalAuthSessionForInvite"]>(
  {
    type: "asyncClientAction",
    actionType: Client.ActionType.CREATE_EXTERNAL_AUTH_SESSION_FOR_INVITE,
    stateProducer: (draft) => {
      draft.startingExternalAuthSessionInvite = true;
      delete draft.startingExternalAuthSessionInviteError;
      delete draft.completedExternalAuth;
    },
    failureStateProducer: (draft, { payload }) => {
      draft.startingExternalAuthSessionInviteError = payload;
    },
    endStateProducer: (draft) => {
      delete draft.startingExternalAuthSessionInvite;
    },
    handler: async (
      state,
      { payload },
      { context, dispatchSuccess, dispatchFailure }
    ) => {
      const {
        authMethod,
        authObjectId,
        authType,
        emailToken,
        encryptionToken,
        externalAuthProviderId,
        loadActionType,
        orgId,
        provider,
      } = payload;
      let externalAuthSessionId: string | undefined;

      const encodedHostUrl = emailToken.split("_")[2];
      if (!encodedHostUrl) {
        return dispatchFailure(
          {
            type: "clientError",
            error: {
              name: "InvalidInviteToken",
              message: "Invalid invite token",
            },
          },
          context
        );
      }

      const hostUrl = naclUtil.encodeUTF8(decodeBase58(encodedHostUrl));
      const reqContext = { ...context, hostUrl };

      const sessionPayload: Api.Net.CreateExternalAuthSession = {
        authType,
        authMethod,
        provider,
        orgId,
        authObjectId,
        externalAuthProviderId,
      };

      const res = await dispatch(
        {
          type: Api.ActionType.CREATE_EXTERNAL_AUTH_SESSION,
          payload: sessionPayload,
        },
        reqContext
      );
      if (!res.success) {
        return dispatchFailure(
          (res.resultAction as Client.Action.FailureAction)
            .payload as Api.Net.ErrorResult,
          reqContext
        );
      }
      const authResPayload = (res.resultAction as any)?.payload as
        | Api.Net.ApiResultTypes["CreateExternalAuthSession"]
        | Api.Net.RequiresEmailAuthResult;
      if (authResPayload.type !== "pendingExternalAuthSession") {
        // somehow the saml provider was deleted before this user accepted their invitation
        return dispatchFailure(authResPayload, reqContext);
      }
      log(
        "Successfully created a pending external auth session",
        authResPayload
      );
      externalAuthSessionId = authResPayload.id;

      // User's web browser will open and ask them to log in.
      openExternalUrl(authResPayload.authUrl);

      // BACKGROUND
      // Check for successful external auth, or time out.
      dispatch(
        {
          type: Client.ActionType.WAIT_FOR_INVITE_EXTERNAL_AUTH,
          payload: {
            authType,
            emailToken,
            encryptionToken,
            externalAuthProviderId,
            externalAuthSessionId: externalAuthSessionId!,
            loadActionType,
            orgId,
          },
        },
        reqContext
      );

      return dispatchSuccess(null, reqContext);
    },
  }
);

import { clientAction, dispatch } from "../../handler";
import { Api, Client } from "@core/types";
import {
  VANTA_CLIENT_ID,
  VANTA_REDIRECT_URI,
} from "@core/types/integrations/vanta";
import { statusProducers } from "../../lib/status";
import { getAuth } from "@core/lib/client";
import { wait } from "@core/lib/utils/wait";
import { log } from "@core/lib/utils/logger";
import querystring from "querystring";
import { openExternalUrl } from "@core_proc/lib/open";
import { getOrg } from "@core/lib/graph";

const VANTA_EXTERNAL_AUTH_URL = "https://app.vanta.com/oauth/authorize";

clientAction<
  Client.Action.ClientActions["IntegrationsVantaCreateExternalAuthSessionForConnection"]
>({
  type: "asyncClientAction",
  actionType:
    Client.ActionType
      .INTEGRATIONS_VANTA_CREATE_EXTERNAL_AUTH_SESSION_FOR_CONNECTION,
  stateProducer: (draft) => {
    draft.vantaConnectingAccount = true;
    draft.vantaStartingExternalAuthSession = true;
    delete draft.vantaStartingExternalAuthSessionError;
    delete draft.vantaExternalAuthSessionCreationError;
    delete draft.vantaAuthorizingExternallyErrorMessage;
  },
  failureStateProducer: (draft, { meta, payload }) => {
    draft.vantaStartingExternalAuthSessionError = payload;
    delete draft.vantaConnectingAccount;
  },
  endStateProducer: (draft) => {
    delete draft.vantaStartingExternalAuthSession;
  },
  handler: async (
    state,
    { payload },
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    const auth = getAuth(state, context.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }

    const { waitOpenMs } = payload;
    let externalAuthSessionId: string | undefined;

    const res = await dispatch(
      {
        type: Api.ActionType.INTEGRATIONS_VANTA_CREATE_EXTERNAL_AUTH_SESSION,
        payload: {},
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
    const authResPayload = (res.resultAction as any)
      .payload as Api.Net.ApiResultTypes["IntegrationsVantaCreateExternalAuthSession"];

    log("Successfully created a pending external auth session", authResPayload);

    externalAuthSessionId = authResPayload.id;
    const authUrl = res.state.vantaPendingExternalAuthSession!.authUrl;

    const backgroundWork = () => {
      // User's web browser will open and ask them to log in.

      openExternalUrl(authUrl);

      // BACKGROUND
      // Check for successful external auth, or time out.
      dispatch(
        {
          type: Client.ActionType.INTEGRATIONS_VANTA_WAIT_FOR_EXTERNAL_AUTH,
          payload: {
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

clientAction<
  Client.Action.ClientActions["IntegrationsVantaWaitForExternalAuth"]
>({
  type: "clientAction",
  actionType: Client.ActionType.INTEGRATIONS_VANTA_WAIT_FOR_EXTERNAL_AUTH,
  stateProducer: (draft, { payload }) => {
    draft.vantaIsAuthorizingExternallyForSessionId =
      payload.externalAuthSessionId;
    draft.vantaCompletedExternalAuth = undefined;
    delete draft.vantaStartingExternalAuthSessionError;
    delete draft.vantaExternalAuthSessionCreationError;
    delete draft.vantaAuthorizingExternallyErrorMessage;
  },
  handler: async (state, { payload }, context) => {
    const { externalAuthSessionId } = payload;

    let awaitingLogin = true;
    let iterationsLeft = 120;

    while (awaitingLogin) {
      iterationsLeft--;
      if (iterationsLeft <= 0) {
        log("External login timed out", { payload });
        const res = await dispatch(
          {
            type: Client.ActionType
              .INTEGRATIONS_VANTA_SET_EXTERNAL_AUTH_SESSION_RESULT,
            payload: {
              errorMessage: `External login timed out for session ${externalAuthSessionId}`,
            },
          },
          context
        );
        if (
          externalAuthSessionId ===
          res.state.vantaIsAuthorizingExternallyForSessionId
        ) {
          // still the same session
          await dispatch(
            {
              type: Client.ActionType
                .INTEGRATIONS_VANTA_CLEAR_PENDING_EXTERNAL_AUTH_SESSION,
            },
            context
          );
        }
        return;
      }

      const loadRes = await dispatch(
        {
          type: Api.ActionType.INTEGRATIONS_VANTA_GET_EXTERNAL_AUTH_SESSION,
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
        loadRes.state.vantaIsAuthorizingExternallyForSessionId;
      if (wasDeleted || newSessionSpawned) {
        log("Vanta auth session cancelled", {
          thisLoop: payload,
          otherSession: loadRes.state.vantaIsAuthorizingExternallyForSessionId,
        });
        return;
      }
      const resultActionPayload = (loadRes as any).resultAction
        .payload as Api.Net.ApiResultTypes["IntegrationsVantaGetExternalAuthSession"];

      const failure = (loadRes as any)
        .resultAction as Client.Action.FailureAction;
      const stillWaitingExternally =
        resultActionPayload.type === "requiresExternalAuthError";
      if (stillWaitingExternally) {
        await wait(1000);
        continue;
      }

      if (resultActionPayload.type !== "vantaExternalAuthSession") {
        await dispatch(
          {
            type: Client.ActionType
              .INTEGRATIONS_VANTA_SET_EXTERNAL_AUTH_SESSION_RESULT,
            payload: {
              errorMessage:
                resultActionPayload.errorStatus?.toString() ?? failure.type!,
            },
          },
          context
        );
        return;
      }

      log("External auth for vanta completed", {
        externalAuthSessionId,
      });

      awaitingLogin = false; // success
    }

    await dispatch(
      {
        type: Client.ActionType.GET_SESSION,
        payload: {},
      },
      context
    );

    await dispatch(
      {
        type: Client.ActionType
          .INTEGRATIONS_VANTA_SET_EXTERNAL_AUTH_SESSION_RESULT,
        payload: { externalAuthSessionId },
      },
      context
    );
  },
});

clientAction<
  Client.Action.ClientActions["IntegrationsVantaClearPendingExternalAuthSession"]
>({
  type: "clientAction",
  actionType:
    Client.ActionType.INTEGRATIONS_VANTA_CLEAR_PENDING_EXTERNAL_AUTH_SESSION,
  stateProducer: (draft) => {
    delete draft.vantaIsAuthorizingExternallyForSessionId;
    delete draft.vantaPendingExternalAuthSession;
    delete draft.vantaConnectingAccount;
  },
});

clientAction<
  Client.Action.ClientActions["IntegrationsVantaSetExternalAuthSessionResult"]
>({
  type: "clientAction",
  actionType:
    Client.ActionType.INTEGRATIONS_VANTA_SET_EXTERNAL_AUTH_SESSION_RESULT,
  stateProducer: (draft, { payload }) => {
    delete draft.vantaIsAuthorizingExternallyForSessionId;
    delete draft.vantaPendingExternalAuthSession;
    delete draft.vantaConnectingAccount;

    if ("errorMessage" in payload) {
      draft.vantaAuthorizingExternallyErrorMessage = payload.errorMessage;
    } else {
      const { externalAuthSessionId } = payload;
      draft.vantaCompletedExternalAuth = {
        externalAuthSessionId,
      };
    }
  },
});

clientAction<Client.Action.ClientActions["IntegrationsVantaResetExternalAuth"]>(
  {
    type: "clientAction",
    actionType: Client.ActionType.INTEGRATIONS_VANTA_RESET_EXTERNAL_AUTH,
    stateProducer: (draft) => {
      delete draft.vantaCompletedExternalAuth;
      delete draft.vantaStartingExternalAuthSessionError;
      delete draft.vantaExternalAuthSessionCreationError;
      delete draft.vantaAuthorizingExternallyErrorMessage;
      delete draft.vantaConnectingAccount;
      delete draft.vantaIsAuthorizingExternallyForSessionId;
      delete draft.vantaPendingExternalAuthSession;
    },
  }
);

clientAction<
  Api.Action.RequestActions["IntegrationsVantaGetExternalAuthSession"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.INTEGRATIONS_VANTA_GET_EXTERNAL_AUTH_SESSION,
  authenticated: true,
  loggableType: "authAction",
  ...statusProducers(
    "vantaIsFetchingExternalAuthSession",
    "vantaFetchExternalAuthSessionError"
  ),
});

clientAction<Api.Action.RequestActions["IntegrationsVantaRemoveConnection"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.INTEGRATIONS_VANTA_REMOVE_CONNECTION,
  authenticated: true,
  graphAction: true,
  serialAction: true,
  loggableType: "orgAction",
  ...statusProducers(
    "vantaIsRemovingConnection",
    "vantaRemovingConnectionError"
  ),
});

clientAction<
  Api.Action.RequestActions["IntegrationsVantaCreateExternalAuthSession"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.INTEGRATIONS_VANTA_CREATE_EXTERNAL_AUTH_SESSION,
  authenticated: true,
  loggableType: "authAction",
  stateProducer: (draft) => {
    draft.vantaCreatingExternalAuthSession = true;
    delete draft.vantaPendingExternalAuthSession;
    delete draft.vantaStartingExternalAuthSessionError;
    delete draft.vantaExternalAuthSessionCreationError;
    delete draft.vantaAuthorizingExternallyErrorMessage;
  },
  failureStateProducer: (draft, { payload }) => {
    draft.vantaExternalAuthSessionCreationError = payload;
  },
  endStateProducer: (draft) => {
    delete draft.vantaCreatingExternalAuthSession;
  },
  successStateProducer: (draft, { payload, meta: { accountIdOrCliKey } }) => {
    const auth = getAuth(draft, accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      log("Action requires authentication");
      return;
    }

    const { id } = payload;
    const org = getOrg(draft.graph);

    const queryParams = {
      client_id: VANTA_CLIENT_ID,
      scope: "connectors.self:write-resource connectors.self:read-resource",
      redirect_uri: VANTA_REDIRECT_URI,
      source_id: `${org.name} → ${auth.orgId}`,
      response_type: "code",
      state: id,
    };

    log("vanta params", queryParams);

    const qs = querystring.stringify(queryParams);
    const authUrl = VANTA_EXTERNAL_AUTH_URL + "?" + qs;

    draft.vantaPendingExternalAuthSession = { id, authUrl };
  },
});

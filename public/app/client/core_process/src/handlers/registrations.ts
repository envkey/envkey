import { newAccountStateProducer } from "../lib/state";
import { Client, Api, Crypto, Trust } from "@core/types";
import { clientAction, dispatch } from "../handler";
import { generateKeys, signJson } from "@core/lib/crypto/proxy";
import { getPubkeyHash } from "@core/lib/client";
import { pick } from "@core/lib/utils/pick";
import { getDefaultApiHostUrl } from "../../../shared/src/env";

type RegisterContext = {
  privkey: Crypto.Privkey;
  pubkey: Crypto.Pubkey;
  trustedRoot: Trust.RootTrustChain;
  hostUrl: string;
};

clientAction<
  Client.Action.ClientActions["Register"],
  Api.Net.RegisterResult | null
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.REGISTER,
  stateProducer: (draft, action) => {
    draft.isRegistering = true;
    delete draft.registrationError;
    delete draft.deploySelfHostedError;
  },
  endStateProducer: (draft, action) => {
    delete draft.isRegistering;
  },
  failureStateProducer: (draft, action) => {
    draft.registrationError = action.payload;
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

    const { privkey, pubkey } = await generateKeys();
    const pubkeyId = getPubkeyHash(pubkey);
    const trustedRoot: Trust.RootTrustChain = {
      [pubkeyId]: ["root", pubkey],
    };

    const registerBasePayload: Pick<
      Api.Action.RequestActions["Register"]["payload"],
      "org" | "user" | "device"
    > = {
      ...pick(["org", "user", "test"], payload),
      device: {
        name: payload.device.name,
        pubkey,
        signedTrustedRoot: {
          data: await signJson({
            data: trustedRoot,
            privkey,
          }),
        },
      },
    };

    let registerPayload: Api.Action.RequestActions["Register"]["payload"];
    if (payload.hostType == "self-hosted") {
      registerPayload = {
        ...registerBasePayload,
        hostType: payload.hostType,
        provider: "email",
        domain: payload.domain,
        selfHostedFailoverRegion: payload.failoverRegion,
      };
    } else if (payload.hostType == "community") {
      registerPayload = {
        ...registerBasePayload,
        hostType: payload.hostType,
        provider: "email",
        emailVerificationToken: payload.emailVerificationToken,
        communityAuth: payload.communityAuth,
      };
    } else if (payload.provider == "email") {
      registerPayload = {
        ...registerBasePayload,
        hostType: payload.hostType,
        provider: "email",
        emailVerificationToken: payload.emailVerificationToken,
        v1Upgrade: payload.v1Upgrade,
      };
    } else {
      registerPayload = {
        ...registerBasePayload,
        hostType: payload.hostType,
        provider: payload.provider,
        externalAuthSessionId: payload.externalAuthSessionId,
      };
    }

    const apiRegisterAction: Api.Action.RequestActions["Register"] = {
      type: Api.ActionType.REGISTER,
      payload: registerPayload,
      meta: {
        loggableType: "authAction",
        loggableType2: "orgAction",
        client: context.client,
      },
    };
    const dispatchContext = {
      ...context,
      rootClientAction: action,
      dispatchContext: {
        privkey,
        pubkey,
        trustedRoot,
        hostUrl: context.hostUrl ?? getDefaultApiHostUrl(),
      },
    };

    // cloud OR dev-only local self-hosted setup registration
    if (
      payload.hostType === "cloud" ||
      payload.hostType == "community" ||
      payload.devOnlyLocalSelfHosted
    ) {
      let failureAction: Client.Action.FailureAction | undefined;

      const apiRegisterRes = await dispatch<
        Api.Action.RequestActions["Register"],
        RegisterContext
      >(apiRegisterAction, dispatchContext);

      if (apiRegisterRes.success) {
        const successPayload = (apiRegisterRes.resultAction as any)
          .payload as Api.Net.RegisterResult;
        return dispatchSuccess(successPayload, {
          ...context,
          accountIdOrCliKey: successPayload.userId,
        });
      } else {
        failureAction =
          apiRegisterRes.resultAction as Client.Action.FailureAction;
        return dispatchFailure(
          failureAction.payload as Api.Net.ErrorResult,
          context
        );
      }
    } // end CLOUD / COMMUNITY / DEV-ONLY LOCAL SELF-HOSTED

    // SELF-HOSTED
    // kick off deployment in the background
    // it will continually update client state with status,
    // then add entry to state.pendingSelfHostedDeployments when codebuild
    // project has successfully started
    dispatch(
      {
        type: Client.ActionType.DEPLOY_SELF_HOSTED,
        payload: {
          hostType: "self-hosted",
          ...pick(
            [
              "profile",
              "primaryRegion",
              "domain",
              "customDomain",
              "verifiedSenderEmail",
              "notifySmsWhenDone",
              "apiVersionNumber",
              "infraVersionNumber",
              "failoverVersionNumber",
              "overrideReleaseBucket",
              "creds",
              "failoverRegion",
              "deployWaf",
              "internalMode",
              "authorizedAccounts",
              "infraAlertsEmail",
            ],
            payload
          ),
          registerAction: apiRegisterAction,
          deviceName: payload.device.name,
          orgName: payload.org.name,
          privkey,
          provider: "email",
          uid: payload.user.email,
          requiresPassphrase: payload.org.settings.crypto.requiresPassphrase,
          requiresLockout: payload.org.settings.crypto.requiresLockout,
          lockoutMs: payload.org.settings.crypto.lockoutMs,
          ...payload.user,
        },
      },
      context
    );

    return dispatchSuccess(null, context);
  },
});

clientAction<
  Api.Action.RequestActions["Register"],
  Api.Net.RegisterResult,
  Client.ClientError,
  RegisterContext
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.REGISTER,
  loggableType: "authAction",
  successAccountIdFn: (payload) => payload.userId,
  successStateProducer: (draft, action) => {
    newAccountStateProducer(draft, action);
    const { meta } = action;
    draft.trustedRoot = meta.dispatchContext!.trustedRoot;
    draft.trustedSessionPubkeys = {};
    delete draft.verifyingEmail;
    delete draft.emailVerificationCode;
  },
});

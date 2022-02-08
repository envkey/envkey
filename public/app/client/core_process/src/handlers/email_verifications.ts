import { clientAction } from "../handler";
import { Api, Client } from "@core/types";

clientAction<Api.Action.RequestActions["CreateEmailVerification"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_EMAIL_VERIFICATION,
  loggableType: "hostAction",
  stateProducer: (draft, { payload }) => {
    draft.isVerifyingEmail = true;
    draft.verifyingEmail = payload.email;
    delete draft.verifyEmailError;
    delete draft.verifyEmailCodeError;
    delete draft.isVerifyingEmailCode;
    delete draft.emailVerificationCode;
  },
  endStateProducer: (draft) => {
    delete draft.isVerifyingEmail;
  },
  failureStateProducer: (draft, { meta, payload }) => {
    const userId = meta.accountIdOrCliKey; // sign_in
    if (userId && payload.type === "signInWrongProviderError") {
      const expectedProvider = payload.providers[0];
      draft.orgUserAccounts[userId] = {
        ...draft.orgUserAccounts[userId]!,
        provider: expectedProvider.provider,
        externalAuthProviderId: expectedProvider.externalAuthProviderId,
      };
    }
    draft.verifyEmailError = payload;
  },
});

clientAction<Api.Action.RequestActions["CheckEmailTokenValid"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CHECK_EMAIL_TOKEN_VALID,
  loggableType: "hostAction",
  stateProducer: (draft, { payload }) => {
    draft.isVerifyingEmailCode = true;
    delete draft.verifyEmailCodeError;
  },
  endStateProducer: (draft) => {
    delete draft.isVerifyingEmailCode;
  },
  failureStateProducer: (draft, { payload }) => {
    draft.verifyEmailCodeError = payload;
  },
});

clientAction<Client.Action.ClientActions["ResetEmailVerification"]>({
  type: "clientAction",
  actionType: Client.ActionType.RESET_EMAIL_VERIFICATION,
  stateProducer: (draft) => {
    delete draft.verifyEmailError;
    delete draft.verifyEmailCodeError;

    delete draft.verifyingEmail;
    delete draft.emailVerificationCode;

    delete draft.isVerifyingEmail;
    delete draft.isVerifyingEmailCode;
  },
});

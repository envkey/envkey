import { clientAction, dispatch } from "@core_proc/handler";
import { Api, Client, Model } from "@core/types";
import { statusProducers } from "@core_proc/lib/status";
import { secureRandomAlphanumeric, sha256 } from "@core/lib/crypto/utils";
import { applyPatch, Operation } from "rfc6902";

export const generateBearerSecret = (): {
  secret: string;
  hash: string;
} => {
  const secret = ["ekb", secureRandomAlphanumeric(26)].join("_");
  const hash = sha256(secret);
  return { secret, hash };
};

clientAction<Api.Action.RequestActions["CreateScimProvisioningProvider"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_SCIM_PROVISIONING_PROVIDER,
  loggableType: "orgAction",
  graphAction: true,
  authenticated: true,
  serialAction: true,
  ...statusProducers(
    "isCreatingProvisioningProvider",
    "createProvisioningProviderError"
  ),
});

clientAction<Api.Action.RequestActions["UpdateScimProvisioningProvider"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.UPDATE_SCIM_PROVISIONING_PROVIDER,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...statusProducers(
    "isUpdatingProvisioningProvider",
    "updateProvisioningProviderError"
  ),
});

clientAction<Api.Action.RequestActions["DeleteScimProvisioningProvider"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_SCIM_PROVISIONING_PROVIDER,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...statusProducers(
    "isDeletingProvisioningProvider",
    "deleteProvisioningProviderError"
  ),
});

clientAction<Api.Action.RequestActions["ListInvitableScimUsers"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.LIST_INVITABLE_SCIM_USERS,
  loggableType: "authAction",
  loggableType2: "scimAction",
  authenticated: true,
  ...statusProducers(
    "isListingInvitableScimUsers",
    "listInvitableScimUsersError"
  ),
});

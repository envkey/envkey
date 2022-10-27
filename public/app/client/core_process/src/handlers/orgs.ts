import { getTempStore } from "../redux_store";
import { parseUserEncryptedKeyOrBlobComposite } from "@core/lib/blob";
import { pick, stripNullsRecursive } from "@core/lib/utils/object";
import { getAuth, getEnvWithMeta } from "@core/lib/client";
import * as R from "ramda";
import { Client, Api, Model, Crypto, Rbac } from "@core/types";
import { clientAction, dispatch } from "../handler";
import {
  removeObjectProducers,
  renameObjectProducers,
  statusProducers,
} from "../lib/status";
import * as g from "@core/lib/graph";
import {
  encryptSymmetricWithKey,
  decryptSymmetricWithKey,
} from "@core/lib/crypto/proxy";
import { secureRandomAlphanumeric } from "@core/lib/crypto/utils";
import { fetchRequiredEnvs } from "@core_proc/lib/envs";
import fs from "fs";
import { wait } from "@core/lib/utils/wait";
import { log } from "@core/lib/utils/logger";
import { initLocalsIfNeeded } from "../lib/envs";

clientAction<Client.Action.ClientActions["UpdateUserRoles"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.UPDATE_USER_ROLES,
  serialAction: true,
  stateProducer: (draft, { payload, meta }) => {
    for (let { id, orgRoleId } of payload) {
      draft.isUpdatingUserRole[id] = orgRoleId;
      delete draft.updateUserRoleErrors[id];
    }
  },
  failureStateProducer: (draft, { meta: { rootAction }, payload }) => {
    for (let { id } of rootAction.payload) {
      draft.updateUserRoleErrors[id] = {
        payload: rootAction.payload,
        error: payload,
      };
    }
  },
  endStateProducer: (draft, { meta: { rootAction } }) => {
    for (let { id } of rootAction.payload) {
      delete draft.isUpdatingUserRole[id];
    }
  },
  bulkApiDispatcher: true,
  apiActionCreator: async (payload) => ({
    action: {
      type: Api.ActionType.UPDATE_USER_ROLE,
      payload: pick(["id", "orgRoleId"], payload),
    },
  }),
  successHandler: async (state, action, res, context) => {
    const auth = getAuth(state, context.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }

    await initLocalsIfNeeded(state, auth.userId, context).catch((err) => {
      log("Error initializing locals", { err });
    });

    await dispatch({ type: Client.ActionType.CLEAR_CACHED }, context);
  },
});

clientAction<Api.Action.RequestActions["UpdateUserRole"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.UPDATE_USER_ROLE,
  bulkDispatchOnly: true,
  graphProposer:
    ({ payload }) =>
    (graphDraft) => {
      (graphDraft[payload.id] as Model.OrgUser | Model.CliUser).orgRoleId =
        payload.orgRoleId;
    },
  encryptedKeysScopeFn: (graph, { payload: { id } }) => ({
    userIds: new Set([id]),
    envParentIds: "all",
    keyableParentIds: "all",
  }),
});

clientAction<
  Api.Action.RequestActions["RenameOrg"],
  Api.Net.ApiResultTypes["RenameOrg"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.RENAME_ORG,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  stateProducer: (draft, { meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    draft.isRenaming[auth.orgId] = true;
    delete draft.renameErrors[auth.orgId];
  },
  failureStateProducer: (draft, { payload, meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    draft.renameErrors[auth.orgId] = payload;
  },
  successStateProducer: (draft, { meta }) => {
    const accountId = meta.accountIdOrCliKey,
      rootActionPayload = meta.rootAction.payload,
      name = rootActionPayload.name;

    const authDraft = getAuth(draft, accountId);

    if (authDraft && authDraft.type == "clientUserAuth") {
      authDraft.orgName = name;
    }
  },
  endStateProducer: (draft, { meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    delete draft.isRenaming[auth.orgId];
  },
});

clientAction<
  Api.Action.RequestActions["UpdateOrgSettings"],
  Api.Net.ApiResultTypes["UpdateOrgSettings"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.UPDATE_ORG_SETTINGS,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  stateProducer: (draft, { meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    draft.isUpdatingSettings[auth.orgId] = true;
    delete draft.updateSettingsErrors[auth.orgId];
  },
  successStateProducer: (draft, { meta }) => {
    const accountId = meta.accountIdOrCliKey,
      rootActionPayload = meta.rootAction.payload,
      cryptoSettings = rootActionPayload.crypto;

    if (cryptoSettings) {
      const authDraft = getAuth(draft, accountId);

      if (authDraft && authDraft.type == "clientUserAuth") {
        if (typeof cryptoSettings.requiresPassphrase == "boolean") {
          authDraft.requiresPassphrase = cryptoSettings.requiresPassphrase;
        }

        if (typeof cryptoSettings.requiresLockout == "boolean") {
          authDraft.requiresLockout = cryptoSettings.requiresLockout;

          if (!cryptoSettings.requiresLockout) {
            delete authDraft.lockoutMs;
          }
        }

        if (typeof cryptoSettings.lockoutMs == "number") {
          authDraft.lockoutMs = cryptoSettings.lockoutMs;
        }
      }
    }
  },
  failureStateProducer: (draft, { payload, meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    draft.updateSettingsErrors[auth.orgId] = payload;
  },
  endStateProducer: (draft, { meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    delete draft.isUpdatingSettings[auth.orgId];
  },
});

clientAction<
  Api.Action.RequestActions["RenameUser"],
  Api.Net.ApiResultTypes["RenameUser"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.RENAME_USER,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...renameObjectProducers,
});

clientAction<
  Api.Action.RequestActions["SetOrgAllowedIps"],
  Api.Net.ApiResultTypes["SetOrgAllowedIps"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.SET_ORG_ALLOWED_IPS,
  loggableType: "orgAction",
  loggableType2: "updateFirewallAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  stateProducer: (draft, { meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    draft.isUpdatingFirewall[auth.orgId] = true;
    delete draft.updateFirewallErrors[auth.orgId];
  },
  failureStateProducer: (draft, { payload, meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    draft.updateFirewallErrors[auth.orgId] = payload;
  },
  endStateProducer: (draft, { meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    delete draft.isUpdatingFirewall[auth.orgId];
  },
});

clientAction<
  Api.Action.RequestActions["RemoveFromOrg"],
  Api.Net.ApiResultTypes["RemoveFromOrg"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.REMOVE_FROM_ORG,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
  successStateProducer: (
    draft,
    {
      meta: {
        accountIdOrCliKey,
        rootAction: {
          payload: { id },
        },
      },
    }
  ) => {
    const auth = getAuth(draft, accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }

    if (id in draft.orgUserAccounts) {
      let defaultAccountId =
        draft.defaultAccountId === id ? undefined : draft.defaultAccountId;
      const orgUserAccounts = R.omit([id], draft.orgUserAccounts),
        remainingAccounts =
          Object.values<Client.ClientUserAuth>(orgUserAccounts);

      if (remainingAccounts.length == 1) {
        defaultAccountId = remainingAccounts[0]!.userId;
      }

      if (id == auth.userId) {
        return {
          ...draft,
          ...Client.defaultAccountState,
          ...Client.defaultClientState,
          orgUserAccounts,
          defaultAccountId,
        };
      } else {
        return {
          ...draft,
          orgUserAccounts,
          defaultAccountId,
        };
      }
    }
  },
});

clientAction<
  Api.Action.RequestActions["DeleteOrg"],
  Api.Net.ApiResultTypes["DeleteOrg"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_ORG,
  loggableType: "authAction",
  loggableType2: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  stateProducer: (draft, { meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    draft.isRemoving[auth.orgId] = true;
    delete draft.removeErrors[auth.orgId];
  },
  successStateProducer: (draft, { meta: { accountIdOrCliKey } }) => ({
    ...draft,
    ...Client.defaultAccountState,
    ...Client.defaultClientState,
    orgUserAccounts: R.omit([accountIdOrCliKey!], draft.orgUserAccounts),
  }),
  failureStateProducer: (draft, { payload, meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    draft.removeErrors[auth.orgId] = payload;
    delete draft.isRemoving[auth.orgId];
  },
});

clientAction<Client.Action.ClientActions["ClearThrottleError"]>({
  type: "clientAction",
  actionType: Client.ActionType.CLEAR_THROTTLE_ERROR,
  stateProducer: (draft) => {
    delete draft.throttleError;
  },
});

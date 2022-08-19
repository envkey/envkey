import { clearNonPendingEnvsProducer } from "./../lib/envs/updates";
import { Client, Model } from "@core/types";
import { clientAction, dispatch } from "../handler";
import os from "os";
import { initDeviceKey } from "@core/lib/client_store/key_store";
import * as R from "ramda";
import { getPendingUpdateDetails } from "@core/lib/client";
import { parseUserEncryptedKeyOrBlobComposite } from "@core/lib/blob";
import { sha256 } from "@core/lib/crypto/utils";
import { log } from "@core/lib/utils/logger";

clientAction<Client.Action.ClientActions["InitDevice"]>({
  type: "clientAction",
  actionType: Client.ActionType.INIT_DEVICE,
  procStateProducer: (draft) => {
    if (!draft.defaultDeviceName) {
      draft.defaultDeviceName = os.hostname();
    }

    draft.deviceKeyUpdatedAt = Date.now();
  },
});

clientAction<Client.Action.ClientActions["DisconnectClient"]>({
  type: "clientAction",
  actionType: Client.ActionType.DISCONNECT_CLIENT,
  skipLocalSocketUpdate: true,
  procStateProducer: (draft, { meta: { clientId, accountIdOrCliKey } }) => {
    delete draft.clientStates[clientId];

    if (accountIdOrCliKey) {
      const hash = sha256(accountIdOrCliKey);
      if (draft.cliKeyAccounts[hash]) {
        delete draft.cliKeyAccounts[hash];
      }
    }
  },
});

clientAction<Client.Action.ClientActions["ResetClientState"]>({
  type: "clientAction",
  actionType: Client.ActionType.RESET_CLIENT_STATE,
  skipLocalSocketUpdate: true,
  procStateProducer: (draft, { meta: { clientId } }) => {
    draft.clientStates[clientId] = Client.defaultClientState;
  },
});

clientAction<Client.Action.ClientActions["SetDevicePassphrase"]>({
  type: "clientAction",
  actionType: Client.ActionType.SET_DEVICE_PASSPHRASE,
  procStateProducer: (draft, { payload: { passphrase } }) => {
    draft.requiresPassphrase = Boolean(passphrase) || undefined;
  },
  handler: async (state, { payload: { passphrase } }, context) => {
    await initDeviceKey(passphrase);
    await dispatch(
      {
        type: Client.ActionType.INIT_DEVICE,
      },
      context
    );
  },
});

clientAction<Client.Action.ClientActions["ClearDevicePassphrase"]>({
  type: "clientAction",
  actionType: Client.ActionType.CLEAR_DEVICE_PASSPHRASE,
  procStateProducer: (draft) => {
    const accountsRequiringPassphrase = (
      Object.values(draft.orgUserAccounts) as Client.ClientUserAuth[]
    ).filter(R.prop("requiresPassphrase"));

    if (accountsRequiringPassphrase.length > 0) {
      throw new Error(
        "Cannot remove passphrase because user belongs to orgs that require one."
      );
    }

    delete draft.requiresPassphrase;
  },
  handler: async (state, action, context) => {
    const accountsRequiringPassphrase = (
      Object.values(state.orgUserAccounts) as Client.ClientUserAuth[]
    ).filter(R.prop("requiresPassphrase"));

    if (accountsRequiringPassphrase.length > 0) {
      throw new Error(
        "Cannot remove passphrase because user belongs to orgs that require one."
      );
    }

    await initDeviceKey();
    await dispatch(
      {
        type: Client.ActionType.INIT_DEVICE,
      },
      context
    );
  },
});

clientAction<Client.Action.ClientActions["SetDefaultDeviceName"]>({
  type: "clientAction",
  actionType: Client.ActionType.SET_DEFAULT_DEVICE_NAME,
  procStateProducer: (draft, { payload: { name } }) => {
    draft.defaultDeviceName = name;
  },
});

clientAction<Client.Action.ClientActions["SetDeviceLockout"]>({
  type: "clientAction",
  actionType: Client.ActionType.SET_DEVICE_LOCKOUT,
  procStateProducer: (draft, { payload: { lockoutMs } }) => {
    const accountsRequiringLockout = (
        Object.values(draft.orgUserAccounts) as Client.ClientUserAuth[]
      ).filter(R.prop("requiresLockout")),
      lowestMaxLockout = R.apply(
        Math.min,
        accountsRequiringLockout
          .filter(R.prop("lockoutMs"))
          .map((acct) => acct.lockoutMs)
      );

    if (lockoutMs > lowestMaxLockout) {
      throw new Error(
        "Cannot set a lockout higher than the lowest required by any org."
      );
    }

    draft.lockoutMs = lockoutMs;
  },
});
clientAction<Client.Action.ClientActions["ClearDeviceLockout"]>({
  type: "clientAction",
  actionType: Client.ActionType.CLEAR_DEVICE_LOCKOUT,
  procStateProducer: (draft) => {
    const accountsRequiringLockout = (
      Object.values(draft.orgUserAccounts) as Client.ClientUserAuth[]
    ).filter(R.prop("requiresLockout"));

    if (accountsRequiringLockout.length > 0) {
      throw new Error(
        "Cannot remove lockout because user belongs to orgs that require one."
      );
    }

    draft.lockoutMs = undefined;
  },
});

clientAction<Client.Action.ClientActions["UnlockDevice"]>({
  type: "clientAction",
  actionType: Client.ActionType.UNLOCK_DEVICE,
  procStateProducer: (draft) => {
    draft.unlockedAt = Date.now();
  },
});

clientAction<Client.Action.ClientActions["MergePersisted"]>({
  type: "clientAction",
  actionType: Client.ActionType.MERGE_PERSISTED,
  procStateProducer: (draft, { payload }) => {
    for (let k of Client.STATE_PERSISTENCE_KEYS) {
      if (k in payload) {
        (draft as any)[k] = payload[k];

        // initialize newly added state keys that weren't set in stored state
        if (k == "accountStates") {
          for (let accountId in payload.accountStates) {
            const accountState = payload.accountStates[accountId];
            if (accountState) {
              if (typeof accountState.pendingInvites == "undefined") {
                draft.accountStates[accountId]!.pendingInvites = [];
              }
            }
          }
        }
      }
    }
  },
});

clientAction<Client.Action.ClientActions["FetchedClientState"]>({
  type: "clientAction",
  actionType: Client.ActionType.FETCHED_CLIENT_STATE,
});

clientAction<Client.Action.ClientActions["SetUiLastSelectedAccountId"]>({
  type: "clientAction",
  actionType: Client.ActionType.SET_UI_LAST_SELECTED_ACCOUNT_ID,
  procStateProducer: (draft, { payload }) => {
    draft.uiLastSelectedAccountId = payload.selectedAccountId;
  },
});

clientAction<Client.Action.ClientActions["SetUiLastSelectedUrl"]>({
  type: "clientAction",
  actionType: Client.ActionType.SET_UI_LAST_SELECTED_URL,
  procStateProducer: (draft, { payload }) => {
    draft.uiLastSelectedUrl = payload.url;
  },
});

clientAction<Client.Action.ClientActions["ClearCached"]>({
  type: "clientAction",
  actionType: Client.ActionType.CLEAR_CACHED,
  stateProducer: clearNonPendingEnvsProducer,
});

clientAction<Client.Action.ClientActions["AccountActive"]>({
  type: "clientAction",
  actionType: Client.ActionType.ACCOUNT_ACTIVE,
});

import { Client, Api, Crypto, Model } from "@core/types";
import { pick } from "@core/lib/utils/object";
import { wait } from "@core/lib/utils/wait";
import { log } from "@core/lib/utils/logger";
import * as R from "ramda";

type ContextParams = Pick<Client.Context, "clientId" | "accountIdOrCliKey">;

export function getState(
  store: Client.ReduxStore,
  context: ContextParams
): Client.State;

export function getState(
  procState: Client.ProcState,
  context: ContextParams
): Client.State;

export function getState(
  storeOrState: Client.ReduxStore | Client.ProcState,
  context: ContextParams
): Client.State {
  const procState =
      "getState" in storeOrState ? storeOrState.getState() : storeOrState,
    clientState = procState.clientStates[context.clientId],
    accountState = context.accountIdOrCliKey
      ? procState.accountStates[context.accountIdOrCliKey]
      : undefined;

  const res = {
    ...pick(Client.CLIENT_PROC_STATE_KEYS, procState),
    ...(clientState
      ? pick(Client.CLIENT_STATE_KEYS, clientState)
      : Client.defaultClientState),
    ...(accountState
      ? pick(Client.ACCOUNT_STATE_KEYS, accountState)
      : Client.defaultAccountState),
  };

  return res;
}

type NewAccountAction = Api.Action.RequestActions[
  | "Register"
  | "AcceptInvite"
  | "AcceptDeviceGrant"
  | "RedeemRecoveryKey"];

type NewAccountStateProducer = Client.StateProducer<
  Client.Action.SuccessAction<NewAccountAction, Api.Net.RegisterResult>,
  {
    privkey: Crypto.Privkey;
    hostUrl: string;
  }
>;

export const newAccountStateProducer: NewAccountStateProducer = (
  draft,
  { meta, payload }
) => {
  const accountId = payload.userId;
  if (Object.keys(draft.orgUserAccounts).length == 0) {
    draft.defaultAccountId = accountId;
  }

  draft.graph = payload.graph;
  draft.graphUpdatedAt = payload.graphUpdatedAt;
  const org = draft.graph[payload.orgId] as Model.Org;

  draft.orgUserAccounts[accountId] = {
    type: "clientUserAuth",
    ...pick(
      [
        "token",
        "userId",
        "orgId",
        "email",
        "firstName",
        "lastName",
        "provider",
        "uid",
        "deviceId",
      ],
      payload
    ),
    privkey: meta.dispatchContext!.privkey,
    orgName: org.name,
    externalAuthProviderId: draft.completedExternalAuth?.externalAuthProviderId,
    deviceName: meta.rootAction.payload.device.name,
    hostUrl: meta.dispatchContext!.hostUrl,
    addedAt: payload.timestamp,
    lastAuthAt: payload.timestamp,
    requiresPassphrase: org.settings.crypto.requiresPassphrase,
    requiresLockout: org.settings.crypto.requiresLockout,
    lockoutMs: org.settings.crypto.lockoutMs,
    ...(payload.hostType == "cloud"
      ? {
          hostType: <const>"cloud",
          deploymentTag: undefined,
        }
      : {
          hostType: <const>"self-hosted",
          deploymentTag: payload.deploymentTag,
        }),
  };
};

export const waitForStateCondition = async (
  store: Client.ReduxStore,
  context: ContextParams,
  conditionFn: (state: Client.State) => boolean,
  timeout = 60000
) => {
  let state = getState(store, context);
  let total = 0;

  while (!conditionFn(state)) {
    await wait(50);
    total += 50;

    if (timeout && total > timeout) {
      log("waitForStateCondition timeout", { timeout, total });
      log("conditionFn: " + conditionFn.toString());
      console.trace();
      throw new Error("Timeout waiting for state condition");
    }

    state = getState(store, context);
  }
};

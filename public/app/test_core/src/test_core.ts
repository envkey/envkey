import { Client } from "@core/types";
import { getNewStore } from "@core_proc/redux_store";
import { dispatch as _dispatch } from "@core_proc/handler";
import {
  getState as _getState,
  waitForStateCondition as _waitForStateCondition,
} from "@core_proc/lib/state";
import { v4 as uuid } from "uuid";
import { log } from "@core/lib/utils/logger";

let testId: string = uuid().toLowerCase();
let deviceContexts: { [id: string]: Client.ReduxStore } = {};

let hostnameOverride: string | undefined;

export const clientParams: Client.ClientParams<"cli" | "app"> = {
    clientName: "app",
    clientVersion: "2.0",
  },
  resetTestId = () => {
    testId = uuid().toLowerCase();
    return testId;
  },
  // allows seting a function which returns the hostUrl for dispatch
  setApiHost = (h: string | undefined) => {
    hostnameOverride = h;
  },
  getTestId = () => testId.toLowerCase(),
  getDeviceStore = (deviceStoreId: string) => {
    if (!deviceContexts[deviceStoreId]) {
      deviceContexts[deviceStoreId] = getNewStore();
    }
    return deviceContexts[deviceStoreId];
  },
  getState = (
    accountIdOrCliKey: string | undefined,
    deviceStoreId?: string
  ) => {
    const testId = getTestId();

    return _getState(
      getDeviceStore(deviceStoreId ?? accountIdOrCliKey ?? testId).getState(),
      { accountIdOrCliKey, clientId: testId }
    );
  },
  waitForStateCondition = (
    accountIdOrCliKey: string | undefined,
    conditionFn: (state: Client.State) => boolean,
    deviceStoreId?: string
  ) => {
    const testId = getTestId();

    return _waitForStateCondition(
      getDeviceStore(deviceStoreId ?? accountIdOrCliKey ?? testId),
      { accountIdOrCliKey, clientId: testId },
      conditionFn
    );
  },
  waitForSerialAction = (
    accountIdOrCliKey: string | undefined,
    deviceStoreId?: string
  ) =>
    waitForStateCondition(
      accountIdOrCliKey,
      (state) => !state.isDispatchingSerialAction,
      deviceStoreId
    ),
  dispatch = <ActionType extends Client.Action.EnvkeyAction>(
    action: Client.Action.DispatchAction<ActionType>,
    accountIdOrCliKey: string | undefined,
    deviceStoreId?: string,
    tempHostOverride?: string
  ) => {
    const store = getDeviceStore(
      deviceStoreId ?? accountIdOrCliKey ?? getTestId()
    );

    const testId = getTestId();

    return _dispatch<ActionType>(action, {
      client: clientParams,
      store,
      accountIdOrCliKey,
      clientId: testId,
      hostUrl: tempHostOverride ?? hostnameOverride,
    }).catch((err: Error) => {
      throw err;
    });
  };

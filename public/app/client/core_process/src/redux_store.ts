import { createStore } from "redux";
import { clientReducer } from "./handler";
import Client from "@core/types/client";
import { log } from "@core/lib/utils/logger";

// ensure all action handlers get loaded prior to running clientReducer
import "./handlers";

let defaultStore: Client.ReduxStore | undefined;

export const getNewStore = (
  initialState?: Client.ProcState
): Client.ReduxStore => {
  const store = createStore<
    Client.ProcState,
    Client.ActionTypeWithContextMeta<
      | Client.Action.EnvkeyAction
      | Client.Action.SuccessAction
      | Client.Action.FailureAction
    >,
    {},
    {}
  >(clientReducer() as any, initialState);

  return store;
};

export const getDefaultStore = () => {
    if (!defaultStore) {
      defaultStore = getNewStore();
    }
    return defaultStore;
  },
  clearStore = () => {
    defaultStore = undefined;
  };

export const getTempStore = (storeArg?: Client.ReduxStore) => {
  const store = storeArg ?? getDefaultStore();
  return getNewStore(store.getState());
};

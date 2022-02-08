import { createStore } from "redux";
import { clientReducer } from "./handler";
import Client from "@core/types/client";

// ensure all action handlers get loaded prior to running clientReducer
import "./handlers";

let defaultStore: Client.ReduxStore | undefined;

export const getNewStore = (): Client.ReduxStore => {
  const store = createStore<
    Client.ProcState,
    Client.ActionTypeWithContextMeta<
      | Client.Action.EnvkeyAction
      | Client.Action.SuccessAction
      | Client.Action.FailureAction
    >,
    {},
    {}
  >(clientReducer() as any);

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

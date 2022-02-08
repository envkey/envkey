import { Client } from "../../types";
import {
  get,
  put,
  del,
  enableLogging as fileStoreEnableLogging,
} from "./file_store";
import { enableLogging as keyStoreEnableLogging } from "./key_store";
import { pick } from "../utils/object";
import { log } from "../utils/logger";
import * as R from "ramda";

const STATE_KEY = "local-state";

const queue: Client.ProcState[] = [];

export const queuePersistState = (
    state: Client.ProcState,
    skipProcessQueue = false
  ) => {
    queue.push(state);
    if (queue.length == 1 && !skipProcessQueue) {
      processPersistStateQueue();
    }
  },
  processPersistStateQueue = async () => {
    const state = queue.shift();

    if (!state) {
      return;
    }

    const withPersistenceKeys = pick(Client.STATE_PERSISTENCE_KEYS, state);
    const toPersist = R.evolve(
      {
        accountStates: R.mapObjIndexed((accountState) => ({
          ...Client.defaultAccountState,
          ...pick(
            ["pendingEnvUpdates", "pendingEnvsUpdatedAt", "pendingInvites"],
            accountState as Client.PartialAccountState
          ),
        })),
      },
      withPersistenceKeys
    );

    await put(STATE_KEY, toPersist);

    if (queue.length > 0) {
      await processPersistStateQueue();
    }
  },
  getPersistedState = () =>
    get(STATE_KEY) as Promise<Client.PersistedProcState>,
  deletePersistedState = () => del(STATE_KEY),
  enableLogging = () => {
    fileStoreEnableLogging();
    keyStoreEnableLogging();
  };

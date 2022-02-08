import { ProcState, defaultProcState } from "./state";
import * as R from "ramda";

// account states are filtered in persistence logic
const defaultPersistable = R.omit(
  ["clientStates", "networkUnreachable"],
  defaultProcState
);

export type StatePersistenceKey = keyof typeof defaultPersistable;

export type PersistedProcState = Pick<ProcState, StatePersistenceKey>;

export const STATE_PERSISTENCE_KEYS = Object.keys(
  defaultPersistable
) as StatePersistenceKey[];

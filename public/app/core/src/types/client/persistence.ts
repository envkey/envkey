import { ProcState, defaultProcState } from "./state";
import * as R from "ramda";

// account states are filtered in persistence logic
const defaultPersistable = R.omit(
  [
    "clientStates",
    "networkUnreachable",
    "cloudProducts",
    "cloudPrices",
    "isLoadingCloudProducts",
    "loadCloudProductsError",
    "v1UpgradeAcceptedInvite",
    "v1ClientAliveAt",
    "v1IsUpgrading",
    "v1UpgradeInviteToken",
    "v1UpgradeEncryptionToken",
    "v1UpgradeError",
    "v1UpgradeStatus",
    "v1UpgradeAccountId",
  ],
  defaultProcState
);

export type StatePersistenceKey = keyof typeof defaultPersistable;

export type PersistedProcState = Pick<ProcState, StatePersistenceKey>;

export const STATE_PERSISTENCE_KEYS = Object.keys(
  defaultPersistable
) as StatePersistenceKey[];

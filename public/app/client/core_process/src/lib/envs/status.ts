import { log } from "@core/lib/utils/logger";
import { pick } from "@core/lib/utils/object";
import { Client } from "@core/types";

export const updateLocalSocketEnvActionStatusIfNeeded = (
  state: Client.State,
  context: Client.Context
) => {
  context.localSocketUpdate?.({
    type: "envActionStatus",
    status: pick(
      [
        "cryptoStatus",
        "isFetchingEnvs",
        "isFetchingChangesets",
        "isLoadingInvite",
        "isLoadingDeviceGrant",
        "isLoadingRecoveryKey",
        "isProcessingApi",
      ],
      state
    ),
  });
};

export const updateLocalSocketImportStatusIfNeeded = (
  state: Client.State,
  context: Client.Context
) => {
  context.localSocketUpdate?.({
    type: "importStatus",
    status: state.importOrgStatus,
  });
};

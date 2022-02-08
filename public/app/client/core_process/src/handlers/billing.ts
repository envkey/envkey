import { clientAction } from "../handler";
import { Api } from "@core/types";
import { statusProducers } from "../lib/status";

clientAction<Api.Action.RequestActions["UpdateLicense"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.UPDATE_LICENSE,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...statusProducers("isUpdatingLicense", "updateLicenseError"),
});

clientAction<Api.Action.RequestActions["FetchOrgStats"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.FETCH_ORG_STATS,
  loggableType: "authAction",
  authenticated: true,
  ...statusProducers("isFetchingOrgStats", "fetchOrgStatsError"),
  successStateProducer: (draft, { payload: { orgStats } }) => {
    draft.orgStats = orgStats;
  },
});

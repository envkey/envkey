import { apiAction } from "../../../shared/src/handler";
import { Api } from "@core/types";

// Placeholder api actions since community can't support auto-upgrades
const neverAllowed = async () => false;

apiAction<
  Api.Action.RequestActions["UpgradeSelfHosted"],
  Api.Net.ApiResultTypes["UpgradeSelfHosted"]
>({
  type: Api.ActionType.UPGRADE_SELF_HOSTED,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: neverAllowed,
  graphHandler: async (
    { payload },
    orgGraph,
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    throw new Api.ApiError("invalid action", 400);

    return {
      type: "graphHandlerResult",
      graph: orgGraph,
      logTargetIds: [],
    };
  },
});

apiAction<
  Api.Action.RequestActions["UpgradeSelfHostedForceClear"],
  Api.Net.ApiResultTypes["UpgradeSelfHostedForceClear"]
>({
  type: Api.ActionType.UPGRADE_SELF_HOSTED_FORCE_CLEAR,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: neverAllowed,
  graphHandler: async (
    { payload },
    orgGraph,
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    throw new Api.ApiError("invalid action", 400);

    return {
      type: "graphHandlerResult",
      graph: orgGraph,
      logTargetIds: [],
    };
  },
});

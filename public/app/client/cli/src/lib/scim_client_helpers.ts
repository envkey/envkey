import {dispatch} from "./core";
import {Api, Model} from "@core/types";
import {logAndExitIfActionFailed} from "./args";

export const fetchScimCandidates = async (providerId: string, all?: boolean) => {
  const res = await dispatch({
    type: Api.ActionType.LIST_INVITABLE_SCIM_USERS,
    payload: { id: providerId, all },
  });
  await logAndExitIfActionFailed(
    res,
    "Failed loading invitable SCIM users"
  );
  const candidates = (res as any).resultAction.payload
    .scimUserCandidates as Model.ScimUserCandidate[];

  return candidates;
}

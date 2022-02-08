import { authorizeUser } from "./helpers";
import { getEnvParentPermissions } from "../../.";
import { Graph, Logs, Model } from "../../../../types";
import * as R from "ramda";

export const canFetchLogs = (
  graph: Graph.Graph,
  currentUserId: string,
  currentOrgId: string,
  params: Logs.FetchLogParams
): boolean => {
  const currentUserRes = authorizeUser(graph, currentUserId);
  if (!currentUserRes) {
    return false;
  }
  const [, , currentOrgPermissions] = currentUserRes;

  if (!params.loggableTypes && !R.equals(params.orgIds, [currentOrgId])) {
    return currentOrgPermissions.has("self_hosted_read_host_logs");
  } else if (!params.loggableTypes && R.equals(params.orgIds, [currentOrgId])) {
    return currentOrgPermissions.has("org_read_logs");
  }

  if (currentOrgPermissions.has("org_read_logs")) {
    return true;
  }

  if (params.loggableTypes) {
    if ((params.userIds || params.deviceIds) && !params.targetIds) {
      return currentOrgPermissions.has("org_read_logs");
    }

    if (params.targetIds) {
      for (let targetId of params.targetIds) {
        let target = graph[targetId] as
          | Model.Environment
          | Model.Block
          | Model.App
          | Model.CliUser
          | Model.OrgUser
          | undefined;

        // if none of above was found, targetId may be a localCompositeId, so try to extract envParentId from that
        if (!target) {
          target = graph[targetId.split("|")[0]] as
            | Model.Block
            | Model.App
            | undefined;
        }

        if (
          !target ||
          !["environment", "block", "app", "cliUser", "orgUser"].includes(
            target.type
          )
        ) {
          return false;
        }

        if (target.type == "cliUser" || target.type == "orgUser") {
          return currentOrgPermissions.has("org_read_logs");
        }

        let envParentId: string;
        if (target.type == "environment") {
          envParentId = target.envParentId;
        } else {
          envParentId = targetId;
        }

        return getEnvParentPermissions(graph, envParentId, currentUserId).has(
          "app_read_logs"
        );
      }
    }
  }

  return true;
};

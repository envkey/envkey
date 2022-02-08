import { Graph, Model } from "../../../../types";
import { hasOrgPermission, hasAllOrgPermissions, presence } from "./helpers";
import { graphTypes, authz } from "../../.";

export const canListAppsForUser = (
  graph: Graph.Graph,
  currentUserId: string,
  userId: string
) => {
  const user =
    presence(graph[userId] as Model.OrgUser, "orgUser") ||
    presence(graph[userId] as Model.CliUser, "cliUser");

  if (!user) {
    return false;
  }

  if (
    hasOrgPermission(
      graph,
      currentUserId,
      user.type == "orgUser" ? "org_manage_users" : "org_manage_cli_users"
    )
  ) {
    return true;
  }

  return (
    authz.getAccessGrantableOrRemovableAppsForUser(graph, currentUserId, userId)
      .length > 0
  );
};

export const canListBlocksForUser = (
  graph: Graph.Graph,
  currentUserId: string,
  userId: string
) => {
  const user =
    presence(graph[userId] as Model.OrgUser, "orgUser") ||
    presence(graph[userId] as Model.CliUser, "cliUser");

  if (!user) {
    return false;
  }

  return hasAllOrgPermissions(graph, currentUserId, [
    user.type == "orgUser" ? "org_manage_users" : "org_manage_cli_users",
    "blocks_read_all",
  ]);
};

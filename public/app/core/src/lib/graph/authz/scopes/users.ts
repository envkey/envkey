import { Graph } from "../../../../types";
import { graphTypes, authz } from "../../.";

export const getAccessGrantableOrRemovableAppsForUser = (
  graph: Graph.Graph,
  currentUserId: string,
  userId: string
) => {
  const { apps } = graphTypes(graph);

  return apps.filter(
    ({ id: appId }) =>
      authz.canRemoveAppUserAccess(graph, currentUserId, { appId, userId }) ||
      authz.getAccessGrantableAppRolesForUser(
        graph,
        currentUserId,
        appId,
        userId
      ).length > 0
  );
};

export const getAccessGrantableAppsForUser = (
  graph: Graph.Graph,
  currentUserId: string,
  userId: string
) => {
  const { apps } = graphTypes(graph);

  return apps.filter(
    ({ id: appId }) =>
      authz.getAccessGrantableAppRolesForUser(
        graph,
        currentUserId,
        appId,
        userId
      ).length > 0
  );
};

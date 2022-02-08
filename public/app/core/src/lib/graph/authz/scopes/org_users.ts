import { Graph } from "../../../../types";
import { graphTypes } from "../..";
import * as authz from "../authorizers";
import memoize from "../../../utils/memoize";

export const getRenameableUsers = memoize(
    (graph: Graph.Graph, currentUserId: string) =>
      graphTypes(graph).orgUsers.filter(
        ({ id, deactivatedAt }) =>
          !deactivatedAt && authz.canRenameUser(graph, currentUserId, id)
      )
  ),
  getRoleUpdateableUsers = memoize(
    (graph: Graph.Graph, currentUserId: string) =>
      graphTypes(graph).orgUsers.filter(
        ({ id, deactivatedAt }) =>
          !deactivatedAt &&
          getOrgRolesAssignableToUser(graph, currentUserId, id).length > 0
      )
  ),
  getRemoveableUsers = memoize((graph: Graph.Graph, currentUserId: string) =>
    graphTypes(graph).orgUsers.filter(
      ({ id, deactivatedAt }) =>
        !deactivatedAt && authz.canRemoveFromOrg(graph, currentUserId, id)
    )
  ),
  getOrgRolesAssignableToUser = memoize(
    (graph: Graph.Graph, currentUserId: string, targetUserId: string) =>
      graphTypes(graph).orgRoles.filter(({ id: orgRoleId }) =>
        authz.canUpdateUserRole(graph, currentUserId, targetUserId, orgRoleId)
      )
  ),
  getListableOrgUsers = memoize((graph: Graph.Graph, currentUserId: string) =>
    authz.canListOrgUsers(graph, currentUserId)
      ? graphTypes(graph).orgUsers.filter(({ deactivatedAt }) => !deactivatedAt)
      : []
  );

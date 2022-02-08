import { Graph } from "../../../../types";
import { graphTypes } from "../../.";
import * as authz from "../authorizers";
import memoize from "../../../utils/memoize";

export const getCliUserCreatableOrgRoles = memoize(
    (graph: Graph.Graph, currentUserId: string) =>
      graphTypes(graph).orgRoles.filter(({ id: orgRoleId }) =>
        authz.canCreateCliUser(graph, currentUserId, { orgRoleId })
      )
  ),
  getRenameableCliUsers = memoize((graph: Graph.Graph, currentUserId: string) =>
    graphTypes(graph).cliUsers.filter(
      ({ id: cliUserId, deactivatedAt }) =>
        !deactivatedAt &&
        authz.canRenameCliUser(graph, currentUserId, cliUserId)
    )
  ),
  getDeletableCliUsers = memoize((graph: Graph.Graph, currentUserId: string) =>
    graphTypes(graph).cliUsers.filter(
      ({ id: cliUserId, deactivatedAt }) =>
        !deactivatedAt &&
        authz.canDeleteCliUser(graph, currentUserId, cliUserId)
    )
  ),
  getListableCliUsers = memoize((graph: Graph.Graph, currentUserId: string) =>
    authz.canListCliUsers(graph, currentUserId)
      ? graphTypes(graph).cliUsers.filter(
          ({ id, deactivatedAt }) =>
            !deactivatedAt && authz.canManageCliUser(graph, currentUserId, id)
        )
      : []
  );

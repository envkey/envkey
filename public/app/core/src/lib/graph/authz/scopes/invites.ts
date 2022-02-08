import { Graph } from "../../../../types";
import { graphTypes } from "../../.";
import * as authz from "../authorizers";
import memoize from "./../../../utils/memoize";

export const getInvitableOrgRoles = memoize(
    (graph: Graph.Graph, currentUserId: string) =>
      graphTypes(graph).orgRoles.filter(({ id: orgRoleId }) =>
        authz.canInvite(graph, currentUserId, { orgRoleId })
      )
  ),
  getRevokableInvites = memoize(
    (graph: Graph.Graph, currentUserId: string, now: number) =>
      graphTypes(graph).invites.filter(({ id: inviteId }) =>
        authz.canRevokeInvite(graph, currentUserId, inviteId, now)
      )
  );

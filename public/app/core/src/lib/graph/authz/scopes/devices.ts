import { Graph } from "../../../../types";
import { graphTypes } from "../../.";
import * as authz from "../authorizers";
import memoize from "../../../utils/memoize";

export const getDeviceApprovableUsers = memoize(
    (graph: Graph.Graph, currentUserId: string) =>
      graphTypes(graph).orgUsers.filter(({ id }) =>
        authz.canCreateDeviceGrant(graph, currentUserId, id)
      )
  ),
  getRevokableDeviceGrants = memoize(
    (graph: Graph.Graph, currentUserId: string, now: number) =>
      graphTypes(graph).deviceGrants.filter(({ id }) =>
        authz.canRevokeDeviceGrant(graph, currentUserId, id, now)
      )
  ),
  getRevokableDevices = memoize((graph: Graph.Graph, currentUserId: string) =>
    graphTypes(graph).orgUserDevices.filter(
      ({ id, deactivatedAt }) =>
        !deactivatedAt && authz.canRevokeDevice(graph, currentUserId, id)
    )
  );

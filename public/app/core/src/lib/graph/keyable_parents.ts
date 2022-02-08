import { Graph, Model } from "../../types";
import * as R from "ramda";
import { graphTypes } from "./base";
import { getEnvironmentPermissions, getOrgPermissions } from "./permissions";
import {
  getActiveRecoveryKeys,
  getLocalKeysByEnvironmentId,
  getServersByEnvironmentId,
  getActiveGeneratedEnvkeysByKeyableParentId,
} from "./indexed_graph";
import memoize from "../../lib/utils/memoize";
import { getConnectedEnvironments } from "./app_blocks";

export const getOrphanedLocalKeyIdsForUser = (
    graph: Graph.Graph,
    userId: string
  ) => {
    const localKeys = (graphTypes(graph).localKeys || []).filter(
      R.propEq("userId", userId)
    );

    return localKeys
      .filter(
        ({ environmentId }) =>
          !getEnvironmentPermissions(graph, environmentId, userId).has("read")
      )
      .map(R.prop("id"));
  },
  getOrphanedLocalKeyIds = (graph: Graph.Graph) => {
    const localKeys = graphTypes(graph).localKeys ?? [];

    return localKeys
      .filter(
        ({ environmentId, userId }) =>
          !getEnvironmentPermissions(graph, environmentId, userId).has("read")
      )
      .map(R.prop("id"));
  },
  getOrphanedRecoveryKeyIds = (graph: Graph.Graph) => {
    const recoveryKeys = getActiveRecoveryKeys(graph);

    return recoveryKeys
      .filter(({ userId }) => {
        const { orgRoleId } = graph[userId] as Model.OrgUser;
        return !getOrgPermissions(graph, orgRoleId).has(
          "org_generate_recovery_key"
        );
      })
      .map(R.prop("id"));
  },
  getAllConnectedKeyableParents = memoize(
    (graph: Graph.Graph, environmentId: string) => {
      const parents = [] as Model.KeyableParent[];
      parents.push(
        ...(getLocalKeysByEnvironmentId(graph)[environmentId] ?? [])
      );
      parents.push(...(getServersByEnvironmentId(graph)[environmentId] ?? []));

      for (let environment of getConnectedEnvironments(graph, environmentId)) {
        parents.push(
          ...(getLocalKeysByEnvironmentId(graph)[environment.id] ?? [])
        );
        parents.push(
          ...(getServersByEnvironmentId(graph)[environment.id] ?? [])
        );
      }
      return parents;
    }
  ),
  getConnectedActiveGeneratedEnvkeys = memoize(
    (graph: Graph.Graph, environmentId: string) =>
      getAllConnectedKeyableParents(graph, environmentId)
        .map(({ id }) => getActiveGeneratedEnvkeysByKeyableParentId(graph)[id])
        .filter(Boolean) as Model.GeneratedEnvkey[]
  );

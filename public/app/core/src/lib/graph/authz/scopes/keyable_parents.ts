import * as R from "ramda";
import { Graph } from "../../../../types";
import { graphTypes, getEnvironmentsByEnvParentId } from "../../.";
import * as authz from "../authorizers";
import memoize from "./../../../utils/memoize";

export const getServerCreatableEnvironments = memoize(
    (graph: Graph.Graph, currentUserId: string, appId: string) =>
      (
        getEnvironmentsByEnvParentId(graph)[appId] ?? []
      ).filter(({ id: environmentId }) =>
        authz.canCreateServer(graph, currentUserId, environmentId)
      )
  ),
  getLocalKeyCreatableEnvironments = memoize(
    (graph: Graph.Graph, currentUserId: string, appId: string) =>
      (
        getEnvironmentsByEnvParentId(graph)[appId] ?? []
      ).filter(({ id: environmentId }) =>
        authz.canCreateLocalKey(graph, currentUserId, environmentId)
      )
  ),
  getDeletableServers = memoize(
    (graph: Graph.Graph, currentUserId: string, appId: string) =>
      graphTypes(graph).servers.filter(
        (server) =>
          server.appId == appId &&
          authz.canDeleteServer(graph, currentUserId, server.id)
      )
  ),
  getDeletableLocalKeys = memoize(
    (graph: Graph.Graph, currentUserId: string, appId: string) =>
      graphTypes(graph).localKeys.filter(
        (localKey) =>
          localKey.appId == appId &&
          authz.canDeleteLocalKey(graph, currentUserId, localKey.id)
      )
  ),
  getKeyGeneratableServers = memoize(
    (graph: Graph.Graph, currentUserId: string, appId: string) =>
      graphTypes(graph).servers.filter(
        (server) =>
          server.appId == appId &&
          authz.canGenerateKey(graph, currentUserId, server.id)
      )
  ),
  getKeyGeneratableLocalKeys = memoize(
    (graph: Graph.Graph, currentUserId: string, appId: string) =>
      graphTypes(graph).localKeys.filter(
        (localKey) =>
          localKey.appId == appId &&
          authz.canGenerateKey(graph, currentUserId, localKey.id)
      )
  ),
  getKeyRevokableServers = memoize(
    (graph: Graph.Graph, currentUserId: string, appId: string) =>
      graphTypes(graph).servers.filter(
        (server) =>
          server.appId == appId &&
          authz.canRevokeKey(graph, currentUserId, {
            keyableParentId: server.id,
          })
      )
  ),
  getKeyRevokableLocalKeys = memoize(
    (graph: Graph.Graph, currentUserId: string, appId: string) =>
      graphTypes(graph).localKeys.filter(
        (localKey) =>
          localKey.appId == appId &&
          authz.canRevokeKey(graph, currentUserId, {
            keyableParentId: localKey.id,
          })
      )
  ),
  getAppsPassingKeyableTest = (
    graph: Graph.Graph,
    currentUserId: string,
    test: (
      graph: Graph.Graph,
      currentUserId: string,
      keyableParentId: string
    ) => boolean
  ) => {
    const allKeys = [
      ...graphTypes(graph).localKeys,
      ...graphTypes(graph).servers,
    ];
    return graphTypes(graph).apps.filter((app) => {
      const appKeys = allKeys.filter(R.propEq("appId", app.id));
      return appKeys.filter((k) => test(graph, currentUserId, k.id)).length;
    });
  };

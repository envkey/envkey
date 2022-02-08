import { Graph, Model, Rbac } from "../../../../types";
import { hasAllAppPermissions, presence } from "./helpers";
import {
  getEnvironmentPermissions,
  getActiveGeneratedEnvkeysByKeyableParentId,
} from "../../.";

export const canCreateServer = (
    graph: Graph.Graph,
    currentUserId: string,
    environmentId: string
  ): boolean => {
    const environment = presence(
      graph[environmentId] as Model.Environment,
      "environment"
    );

    if (!environment) {
      return false;
    }

    const app = presence(graph[environment.envParentId] as Model.App, "app");

    if (!app) {
      return false;
    }

    const environmentRole = graph[
      environment.environmentRoleId
    ] as Rbac.EnvironmentRole;
    if (!environmentRole.hasServers) {
      return false;
    }

    const environmentPermissions = getEnvironmentPermissions(
      graph,
      environment.id,
      currentUserId
    );

    return (
      environmentPermissions.has("read") &&
      hasAllAppPermissions(graph, currentUserId, app.id, ["app_manage_servers"])
    );
  },
  canDeleteServer = (
    graph: Graph.Graph,
    currentUserId: string,
    serverId: string
  ): boolean => {
    const server = presence(graph[serverId] as Model.Server, "server");
    if (!server) {
      return false;
    }

    const environment = presence(
      graph[server.environmentId] as Model.Environment,
      "environment"
    );
    if (!environment) {
      return false;
    }
    const environmentPermissions = getEnvironmentPermissions(
      graph,
      environment.id,
      currentUserId
    );

    return (
      environmentPermissions.has("read") &&
      hasAllAppPermissions(graph, currentUserId, server.appId, [
        "app_manage_servers",
      ])
    );
  },
  canCreateLocalKey = (
    graph: Graph.Graph,
    currentUserId: string,
    environmentId: string
  ): boolean => {
    const environment = presence(
      graph[environmentId] as Model.Environment,
      "environment"
    );

    if (!environment) {
      return false;
    }

    const app = presence(graph[environment.envParentId] as Model.App, "app");

    if (!app) {
      return false;
    }

    const environmentRole = graph[
      environment.environmentRoleId
    ] as Rbac.EnvironmentRole;

    if (!environmentRole.hasLocalKeys) {
      return false;
    }

    const environmentPermissions = getEnvironmentPermissions(
      graph,
      environment.id,
      currentUserId
    );

    return (
      environmentPermissions.has("read") &&
      hasAllAppPermissions(graph, currentUserId, app.id, [
        "app_manage_local_keys",
      ])
    );
  },
  canDeleteLocalKey = (
    graph: Graph.Graph,
    currentUserId: string,
    localKeyId: string
  ): boolean => {
    const localKey = presence(graph[localKeyId] as Model.LocalKey, "localKey");
    if (!localKey) {
      return false;
    }

    if (localKey.userId != currentUserId) {
      return false;
    }

    return hasAllAppPermissions(graph, currentUserId, localKey.appId, [
      "app_manage_local_keys",
    ]);
  },
  canGenerateKey = (
    graph: Graph.Graph,
    currentUserId: string,
    keyableParentId: string
  ) => canGenerateOrRevokeKey(graph, currentUserId, keyableParentId),
  canRevokeKey = (
    graph: Graph.Graph,
    currentUserId: string,
    params: { generatedEnvkeyId: string } | { keyableParentId: string }
  ) => {
    let generatedEnvkey: Model.GeneratedEnvkey | undefined | false;

    if ("generatedEnvkeyId" in params) {
      generatedEnvkey = presence(
        graph[params.generatedEnvkeyId] as Model.GeneratedEnvkey,
        "generatedEnvkey"
      );
    } else {
      generatedEnvkey = getActiveGeneratedEnvkeysByKeyableParentId(graph)[
        params.keyableParentId
      ];
    }

    if (!generatedEnvkey) {
      return false;
    }

    return canGenerateOrRevokeKey(
      graph,
      currentUserId,
      generatedEnvkey.keyableParentId
    );
  };

const canGenerateOrRevokeKey = (
  graph: Graph.Graph,
  currentUserId: string,
  keyableParentId: string
): boolean => {
  const keyableParent =
    presence(graph[keyableParentId] as Model.Server, "server") ||
    presence(graph[keyableParentId] as Model.LocalKey, "localKey");

  if (!keyableParent) {
    return false;
  }

  const app = presence(graph[keyableParent.appId] as Model.App, "app");
  if (!app) {
    return false;
  }

  const environment = presence(
    graph[keyableParent.environmentId] as Model.Environment,
    "environment"
  );
  if (!environment) {
    return false;
  }

  const environmentPermissions = getEnvironmentPermissions(
    graph,
    environment.id,
    currentUserId
  );

  return (
    environmentPermissions.has("read") &&
    ((keyableParent.type == "server" &&
      hasAllAppPermissions(graph, currentUserId, app.id, [
        "app_manage_servers",
      ])) ||
      (keyableParent.type == "localKey" &&
        hasAllAppPermissions(graph, currentUserId, app.id, [
          "app_manage_local_keys",
        ])))
  );
};

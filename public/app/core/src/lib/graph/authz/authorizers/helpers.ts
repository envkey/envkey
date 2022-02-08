import { getOrgPermissions, getEnvParentPermissions } from "../../permissions";
import { Graph, Model, Rbac } from "../../../../types";

export const authorizeUser = <
    UserType extends Model.OrgUser | Model.CliUser =
      | Model.OrgUser
      | Model.CliUser
  >(
    graph: Graph.Graph,
    userId: string,
    allowedUserTypes: UserType["type"][] = ["orgUser", "cliUser"]
  ): false | [UserType, Rbac.OrgRole, Set<Rbac.OrgPermission>] => {
    const user = graph[userId] as UserType;

    if (!user || !allowedUserTypes.includes(user.type)) {
      return false;
    }

    if (user.deactivatedAt || user.deletedAt) {
      return false;
    }

    const orgRole = graph[user.orgRoleId] as Rbac.OrgRole;

    if (!orgRole || orgRole.type != "orgRole") {
      return false;
    }

    return [user, orgRole, getOrgPermissions(graph, user.orgRoleId)];
  },
  hasAllOrgPermissions = <
    UserType extends Model.OrgUser | Model.CliUser =
      | Model.OrgUser
      | Model.CliUser
  >(
    graph: Graph.Graph,
    currentUserId: string,
    permissions: Rbac.OrgPermission[],
    allowedUserTypes: UserType["type"][] = ["orgUser", "cliUser"]
  ): boolean => {
    const authRes = authorizeUser(graph, currentUserId, allowedUserTypes);
    if (!authRes) {
      return false;
    }

    const [, , orgPermissions] = authRes;

    for (let permission of permissions) {
      if (!orgPermissions.has(permission)) {
        return false;
      }
    }

    return true;
  },
  hasOrgPermission = (
    graph: Graph.Graph,
    currentUserId: string,
    permission: Rbac.OrgPermission
  ) => hasAllOrgPermissions(graph, currentUserId, [permission]),
  hasAnyOrgPermissions = <
    UserType extends Model.OrgUser | Model.CliUser =
      | Model.OrgUser
      | Model.CliUser
  >(
    graph: Graph.Graph,
    currentUserId: string,
    permissions: Rbac.OrgPermission[],
    allowedUserTypes: UserType["type"][] = ["orgUser", "cliUser"]
  ): boolean => {
    const authRes = authorizeUser(graph, currentUserId, allowedUserTypes);
    if (!authRes) {
      return false;
    }

    const [, , orgPermissions] = authRes;

    for (let permission of permissions) {
      if (orgPermissions.has(permission)) {
        return true;
      }
    }

    return false;
  },
  presence = <T extends Graph.GraphObject>(
    obj: T | undefined,
    type: T["type"],
    allowDeactivated = false,
    allowDeleted = false
  ): false | T => {
    if (
      !obj ||
      obj.type != type ||
      (obj.deletedAt && !allowDeleted) ||
      ((obj as any).deactivatedAt && !allowDeactivated)
    ) {
      return false;
    }
    return obj;
  },
  hasAllAppPermissions = (
    graph: Graph.Graph,
    currentUserId: string,
    appId: string,
    permissions: Rbac.AppPermission[]
  ) =>
    hasAllEnvParentPermissions(graph, currentUserId, "app", appId, permissions),
  hasAppPermission = (
    graph: Graph.Graph,
    currentUserId: string,
    appId: string,
    permission: Rbac.AppPermission
  ) => hasAllAppPermissions(graph, currentUserId, appId, [permission]),
  hasAnyAppPermissions = (
    graph: Graph.Graph,
    currentUserId: string,
    appId: string,
    permissions: Rbac.AppPermission[]
  ) =>
    hasAnyEnvParentPermissions(graph, currentUserId, "app", appId, permissions),
  hasAllConnectedBlockPermissions = (
    graph: Graph.Graph,
    currentUserId: string,
    blockId: string,
    permissions: Rbac.AppPermission[]
  ) =>
    hasAllEnvParentPermissions(
      graph,
      currentUserId,
      "block",
      blockId,
      permissions
    ),
  hasConnectedBlockPermission = (
    graph: Graph.Graph,
    currentUserId: string,
    blockId: string,
    permission: Rbac.AppPermission
  ) =>
    hasAllConnectedBlockPermissions(graph, currentUserId, blockId, [
      permission,
    ]),
  hasAnyConnectedBlockPermissions = (
    graph: Graph.Graph,
    currentUserId: string,
    blockId: string,
    permissions: Rbac.AppPermission[]
  ) =>
    hasAnyEnvParentPermissions(
      graph,
      currentUserId,
      "block",
      blockId,
      permissions
    );

const hasAllEnvParentPermissions = <EnvParentType extends Model.EnvParent>(
    graph: Graph.Graph,
    currentUserId: string,
    envParentType: EnvParentType["type"],
    envParentId: string,
    permissions: Rbac.AppPermission[]
  ): boolean => {
    if (!presence(graph[envParentId], envParentType)) {
      return false;
    }

    const envParentPermissions = getEnvParentPermissions(
      graph,
      envParentId,
      currentUserId
    );

    for (let permission of permissions) {
      if (!envParentPermissions.has(permission)) {
        return false;
      }
    }

    return true;
  },
  hasAnyEnvParentPermissions = <EnvParentType extends Model.EnvParent>(
    graph: Graph.Graph,
    currentUserId: string,
    envParentType: EnvParentType["type"],
    envParentId: string,
    permissions: Rbac.AppPermission[]
  ): boolean => {
    if (!presence(graph[envParentId], envParentType)) {
      return false;
    }

    const envParentPermissions = getEnvParentPermissions(
      graph,
      envParentId,
      currentUserId
    );

    for (let permission of permissions) {
      if (envParentPermissions.has(permission)) {
        return true;
      }
    }

    return false;
  };

import {
  hasOrgPermission,
  hasAppPermission,
  hasAnyAppPermissions,
  authorizeUser,
  presence,
} from "./helpers";
import { Graph, Model, Rbac } from "../../../../types";
import {
  getIncludedAppRolesByComposite,
  getAppRoleForUserOrInvitee,
} from "../../.";
import {
  getAppUserGrantsByComposite,
  getAppUserGroupsByComposite,
} from "../../indexed_graph";
import { canReadAnyEnvParentVersions } from "..";
import { getAppRoleForUserGroup } from "../../permissions";

export const canCreateApp = (graph: Graph.Graph, currentUserId: string) =>
    hasOrgPermission(graph, currentUserId, "apps_create"),
  canRenameApp = (graph: Graph.Graph, currentUserId: string, appId: string) =>
    hasAppPermission(graph, currentUserId, appId, "app_rename"),
  canUpdateAppSettings = (
    graph: Graph.Graph,
    currentUserId: string,
    appId: string
  ) => hasAppPermission(graph, currentUserId, appId, "app_manage_settings"),
  canDeleteApp = (graph: Graph.Graph, currentUserId: string, appId: string) =>
    hasOrgPermission(graph, currentUserId, "apps_delete") &&
    Boolean(presence(graph[appId], "app")),
  canGrantAppAccess = (
    graph: Graph.Graph,
    currentUserId: string,
    appId: string,
    userType?: "orgUser" | "cliUser"
  ) => {
    if (userType && userType == "orgUser") {
      return hasAppPermission(graph, currentUserId, appId, "app_manage_users");
    } else if (userType && userType == "cliUser") {
      return hasAppPermission(
        graph,
        currentUserId,
        appId,
        "app_manage_cli_users"
      );
    }

    return hasAnyAppPermissions(graph, currentUserId, appId, [
      "app_manage_users",
      "app_manage_cli_users",
    ]);
  },
  canGrantAppRoleToOrgRole = (
    graph: Graph.Graph,
    currentUserId: string,
    params: {
      appId: string;
      orgRoleId: string;
      appRoleId: string;
    }
  ): boolean => {
    if (!canGrantAppAccess(graph, currentUserId, params.appId)) {
      return false;
    }
    const app = presence(graph[params.appId] as Model.App, "app");
    if (!app) {
      return false;
    }

    const targetAppRole = presence(
        graph[params.appRoleId] as Rbac.AppRole,
        "appRole"
      ),
      includedAppRole = presence(
        getIncludedAppRolesByComposite(graph)[
          [params.appRoleId, params.appId].join("|")
        ] as Model.IncludedAppRole | undefined,
        "includedAppRole"
      ),
      currentAppRole = presence(
        getAppRoleForUserOrInvitee(graph, params.appId, currentUserId),
        "appRole"
      );

    if (!targetAppRole || !currentAppRole || !includedAppRole) {
      return false;
    }

    const targetOrgRole = presence(
      graph[params.orgRoleId] as Rbac.OrgRole,
      "orgRole"
    );
    if (!targetOrgRole || targetOrgRole.autoAppRoleId) {
      return false;
    }

    if (!targetAppRole.defaultAllApps) {
      const includedAppRole =
        getIncludedAppRolesByComposite(graph)[
          [targetAppRole.id, app.id].join("|")
        ];
      if (!includedAppRole) {
        return false;
      }
    }

    return currentAppRole.canManageAppRoleIds.includes(targetAppRole.id);
  },
  canGrantAppRoleToUser = (
    graph: Graph.Graph,
    currentUserId: string,
    params: {
      appId: string;
      userId: string;
      appRoleId: string;
    }
  ): boolean => {
    const targetUserRes = authorizeUser(graph, params.userId);
    if (!targetUserRes) {
      return false;
    }
    const [targetUser] = targetUserRes;

    if (
      !canGrantAppRoleToOrgRole(graph, currentUserId, {
        appId: params.appId,
        appRoleId: params.appRoleId,
        orgRoleId: targetUser.orgRoleId,
      })
    ) {
      return false;
    }

    const currentAppRole = presence(
      getAppRoleForUserOrInvitee(graph, params.appId, currentUserId),
      "appRole"
    );
    if (!currentAppRole) {
      return false;
    }

    const existingAppRole = getAppRoleForUserOrInvitee(
      graph,
      params.appId,
      params.userId
    );
    if (existingAppRole && existingAppRole.id == params.appRoleId) {
      return false;
    }

    if (
      existingAppRole &&
      !currentAppRole.canManageAppRoleIds.includes(existingAppRole.id)
    ) {
      return false;
    }

    return true;
  },
  canGrantAppRoleToUserGroup = (
    graph: Graph.Graph,
    currentUserId: string,
    params: {
      appId: string;
      userGroupId: string;
      appRoleId: string;
    }
  ): boolean => {
    const targetUserGroup = presence(
      graph[params.userGroupId] as Model.Group,
      "group"
    );
    if (!targetUserGroup || targetUserGroup.objectType != "orgUser") {
      return false;
    }

    const currentAppRole = presence(
      getAppRoleForUserOrInvitee(graph, params.appId, currentUserId),
      "appRole"
    );

    if (!currentAppRole) {
      return false;
    }

    if (
      !hasAppPermission(graph, currentUserId, params.appId, "app_manage_users")
    ) {
      return false;
    }

    if (!currentAppRole.canManageAppRoleIds.includes(params.appRoleId)) {
      return false;
    }

    const existingAppRole = getAppRoleForUserGroup(
      graph,
      params.appId,
      params.userGroupId
    );

    if (existingAppRole?.id == params.appRoleId) {
      return false;
    }

    if (
      existingAppRole &&
      !currentAppRole.canManageAppRoleIds.includes(existingAppRole.id)
    ) {
      return false;
    }

    return true;
  },
  canRemoveAppAccess = (
    graph: Graph.Graph,
    currentUserId: string,
    appId: string
  ) =>
    hasAnyAppPermissions(graph, currentUserId, appId, [
      "app_manage_users",
      "app_manage_cli_users",
    ]),
  canRemoveAppUserAccess = (
    graph: Graph.Graph,
    currentUserId: string,
    params:
      | {
          appUserGrantId: string;
        }
      | {
          appId: string;
          userId: string;
        }
  ): boolean => {
    const appUserGrantId =
      "appUserGrantId" in params
        ? params.appUserGrantId
        : getAppUserGrantsByComposite(graph)[params.userId + "|" + params.appId]
            ?.id;

    if (!appUserGrantId) {
      return false;
    }

    const targetAppUserGrant = presence(
      graph[appUserGrantId] as Model.AppUserGrant,
      "appUserGrant"
    );

    if (!targetAppUserGrant) {
      return false;
    }

    if (!canRemoveAppAccess(graph, currentUserId, targetAppUserGrant.appId)) {
      return false;
    }

    const currentUserRes = authorizeUser(graph, currentUserId),
      targetUserRes = authorizeUser(graph, targetAppUserGrant.userId);
    if (!currentUserRes || !targetUserRes) {
      return false;
    }
    const [_, currentOrgRole, currentOrgPermissions] = currentUserRes,
      [targetUser, targetOrgRole] = targetUserRes,
      currentAppRole = presence(
        getAppRoleForUserOrInvitee(
          graph,
          targetAppUserGrant.appId,
          currentUserId
        ),
        "appRole"
      ),
      targetAppRole = presence(
        graph[targetAppUserGrant.appRoleId] as Rbac.AppRole,
        "appRole"
      );

    if (!currentAppRole || !targetAppRole || targetOrgRole.autoAppRoleId) {
      return false;
    }

    const isInviter =
        targetUser.type == "cliUser"
          ? targetUser.creatorId == currentUserId
          : targetUser.invitedById == currentUserId,
      hasInviterPermissions =
        isInviter &&
        currentOrgPermissions.has("org_invite_users_to_permitted_apps") &&
        (currentOrgRole.canInviteAllOrgRoles ||
          currentOrgRole.canInviteOrgRoleIds.includes(targetUser.orgRoleId)) &&
        hasAppPermission(
          graph,
          currentUserId,
          targetAppUserGrant.appId,
          "app_manage_users"
        ) &&
        currentAppRole.canInviteAppRoleIds.includes(targetAppRole.id),
      appManagePermission =
        targetUser.type == "cliUser"
          ? <const>"app_manage_cli_users"
          : <const>"app_manage_users";

    return (
      hasInviterPermissions ||
      (hasAppPermission(
        graph,
        currentUserId,
        targetAppUserGrant.appId,
        appManagePermission
      ) &&
        currentAppRole.canManageAppRoleIds.includes(targetAppRole.id))
    );
  },
  canRemoveAppUserGroupAccess = (
    graph: Graph.Graph,
    currentUserId: string,
    params:
      | {
          appUserGroupId: string;
        }
      | {
          appId: string;
          userGroupId: string;
        }
  ): boolean => {
    const appUserGroupId =
      "appUserGroupId" in params
        ? params.appUserGroupId
        : getAppUserGroupsByComposite(graph)[
            params.appId + "|" + params.userGroupId
          ]?.id;

    if (!appUserGroupId) {
      return false;
    }

    const targetAppUserGroup = presence(
      graph[appUserGroupId] as Model.AppUserGroup,
      "appUserGroup"
    );

    if (!targetAppUserGroup) {
      return false;
    }

    const currentAppRole = presence(
        getAppRoleForUserOrInvitee(
          graph,
          targetAppUserGroup.appId,
          currentUserId
        ),
        "appRole"
      ),
      targetAppRole = presence(
        graph[targetAppUserGroup.appRoleId] as Rbac.AppRole,
        "appRole"
      );

    if (!currentAppRole || !targetAppRole) {
      return false;
    }

    return (
      hasAppPermission(
        graph,
        currentUserId,
        targetAppUserGroup.appId,
        "app_manage_users"
      ) && currentAppRole.canManageAppRoleIds.includes(targetAppRole.id)
    );
  },
  canListAppCollaborators = (
    graph: Graph.Graph,
    currentUserId: string,
    appId: string,
    userType: "orgUser" | "cliUser"
  ) => {
    const orgManagePermission: Rbac.OrgPermission = {
      orgUser: <const>"org_manage_users",
      cliUser: <const>"org_manage_cli_users",
    }[userType];

    const appManagePermission: Rbac.AppPermission = {
      orgUser: <const>"app_manage_users",
      cliUser: <const>"app_manage_cli_users",
    }[userType];

    return (
      hasOrgPermission(graph, currentUserId, orgManagePermission) ||
      hasAppPermission(graph, currentUserId, appId, appManagePermission)
    );
  },
  canReadAppVersions = (
    graph: Graph.Graph,
    currentUserId: string,
    appId: string
  ) =>
    hasAppPermission(
      graph,
      currentUserId,
      appId,
      "app_read_user_locals_history"
    ) || canReadAnyEnvParentVersions(graph, currentUserId, appId);

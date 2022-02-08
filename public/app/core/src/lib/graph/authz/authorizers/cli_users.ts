import { Graph, Model, Rbac, Api } from "../../../../types";
import {
  authorizeUser,
  hasAllAppPermissions,
  hasAppPermission,
  hasOrgPermission,
  presence,
} from "./helpers";
import { getAppRoleForUserOrInvitee, graphTypes } from "../../.";
import { getAppsWithAllPermissions } from "../scopes";

export const canCreateCliUser = (
    graph: Graph.Graph,
    currentUserId: string,
    params: Pick<
      Api.Net.ApiParamTypes["CreateCliUser"],
      "orgRoleId" | "appUserGrants"
    >
  ): boolean => {
    // don't allow cli users to create other cli users, only org users
    const currentUserRes = authorizeUser(graph, currentUserId, ["orgUser"]);
    if (!currentUserRes) {
      return false;
    }
    const [, currentOrgRole, currentOrgPermissions] = currentUserRes;

    const targetOrgRole = presence(
        graph[params.orgRoleId] as Rbac.OrgRole,
        "orgRole"
      ),
      targetAppUserGrants = params.appUserGrants;

    if (
      !targetOrgRole ||
      !targetOrgRole.canHaveCliUsers ||
      !(
        currentOrgPermissions.has("org_manage_cli_users") ||
        (currentOrgPermissions.has("org_create_cli_users_for_permitted_apps") &&
          targetAppUserGrants &&
          targetAppUserGrants.length > 0)
      ) ||
      !(
        currentOrgRole.canInviteAllOrgRoles ||
        currentOrgRole.canInviteOrgRoleIds.includes(targetOrgRole.id)
      )
    ) {
      return false;
    }

    if (targetAppUserGrants && targetAppUserGrants.length > 0) {
      for (let targetAppUserGrant of targetAppUserGrants) {
        const currentUserAppRole = presence(
            getAppRoleForUserOrInvitee(
              graph,
              targetAppUserGrant.appId,
              currentUserId
            ),
            "appRole"
          ),
          targetAppRole = presence(
            graph[targetAppUserGrant.appRoleId] as Api.Db.AppRole,
            "appRole"
          );

        if (
          !currentUserAppRole ||
          !hasAllAppPermissions(
            graph,
            currentUserId,
            targetAppUserGrant.appId,
            ["app_manage_cli_users"]
          ) ||
          !targetAppRole ||
          !targetAppRole.canHaveCliUsers ||
          !currentUserAppRole.canInviteAppRoleIds.includes(targetAppRole.id)
        ) {
          return false;
        }
      }
    }

    return true;
  },
  canCreateCliUserForApp = (
    graph: Graph.Graph,
    currentUserId: string,
    appId: string
  ) =>
    hasOrgPermission(graph, currentUserId, "org_manage_cli_users") ||
    (hasOrgPermission(
      graph,
      currentUserId,
      "org_create_cli_users_for_permitted_apps"
    ) &&
      hasAppPermission(graph, currentUserId, appId, "app_manage_cli_users")),
  canCreateAnyCliUser = (graph: Graph.Graph, currentUserId: string) =>
    hasOrgPermission(graph, currentUserId, "org_manage_cli_users") ||
    (hasOrgPermission(
      graph,
      currentUserId,
      "org_create_cli_users_for_permitted_apps"
    ) &&
      getAppsWithAllPermissions(graph, currentUserId, ["app_manage_cli_users"])
        .length > 0),
  canRenameCliUser = (
    graph: Graph.Graph,
    currentUserId: string,
    cliUserId: string
  ) => canManageCliUser(graph, currentUserId, cliUserId),
  canDeleteCliUser = (
    graph: Graph.Graph,
    currentUserId: string,
    cliUserId: string
  ) => canManageCliUser(graph, currentUserId, cliUserId),
  canListCliUsers = (graph: Graph.Graph, currentUserId: string) =>
    hasOrgPermission(graph, currentUserId, "org_manage_cli_users"),
  canManageCliUser = (
    graph: Graph.Graph,
    currentUserId: string,
    cliUserId: string
  ): boolean => {
    const currentUserRes = authorizeUser(graph, currentUserId);
    if (!currentUserRes) {
      return false;
    }
    const [, currentOrgRole, currentOrgPermissions] = currentUserRes;

    const cliUserRes = authorizeUser<Model.CliUser>(graph, cliUserId, [
      "cliUser",
    ]);

    if (!cliUserRes) {
      return false;
    }

    const [cliUser] = cliUserRes;

    if (
      currentOrgPermissions.has("org_manage_cli_users") &&
      // for cli users, unlike human users, any role that can be invited/created can also be managed
      (currentOrgRole.canInviteAllOrgRoles ||
        currentOrgRole.canInviteOrgRoleIds.includes(cliUser.orgRoleId) ||
        currentOrgRole.canManageAllOrgRoles ||
        currentOrgRole.canManageOrgRoleIds.includes(cliUser.orgRoleId))
    ) {
      return true;
    }

    let creatorCanManage =
      currentOrgPermissions.has("org_create_cli_users_for_permitted_apps") &&
      cliUser.creatorId == currentUserId &&
      (currentOrgRole.canInviteAllOrgRoles ||
        currentOrgRole.canInviteOrgRoleIds.includes(cliUser.orgRoleId));

    if (creatorCanManage) {
      const { apps } = graphTypes(graph);

      for (let app of apps) {
        const targetAppRole = presence(
            getAppRoleForUserOrInvitee(graph, app.id, cliUser.id),
            "appRole"
          ),
          currentAppRole = presence(
            getAppRoleForUserOrInvitee(graph, app.id, currentUserId),
            "appRole"
          );

        if (!targetAppRole) {
          continue;
        }

        if (
          !currentAppRole ||
          !hasAllAppPermissions(graph, currentUserId, app.id, [
            "app_manage_cli_users",
          ])
        ) {
          creatorCanManage = false;
          break;
        }

        if (!currentAppRole.canManageAppRoleIds.includes(targetAppRole.id)) {
        } else if (
          creatorCanManage &&
          !currentAppRole.canInviteAppRoleIds.includes(targetAppRole.id)
        ) {
          creatorCanManage = false;
          break;
        }
      }
    }

    return creatorCanManage;
  };

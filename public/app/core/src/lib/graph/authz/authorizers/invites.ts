import { canManageUserGroups } from "./groups";
import { Graph, Api, Rbac, Model } from "../../../../types";
import {
  authorizeUser,
  hasAllAppPermissions,
  hasAppPermission,
  hasOrgPermission,
  presence,
} from "./helpers";
import { getAppRoleForUserOrInvitee, getUserAppRolesByAppId } from "../../.";
import { getAppsWithAllPermissions } from "../scopes";

export const canInvite = (
    graph: Graph.Graph,
    currentUserId: string,
    params: Pick<
      Api.Net.ApiParamTypes["CreateInvite"],
      "appUserGrants" | "userGroupIds"
    > & {
      orgRoleId: string;
    }
  ): boolean => {
    const currentUserRes = authorizeUser(graph, currentUserId);
    if (!currentUserRes) {
      return false;
    }
    const [_, currentOrgRole, currentOrgPermissions] = currentUserRes;
    const targetOrgRole = presence(
      graph[params.orgRoleId] as Rbac.OrgRole,
      "orgRole"
    );

    if (!targetOrgRole) {
      return false;
    }

    if (
      !(
        currentOrgPermissions.has("org_manage_users") ||
        currentOrgPermissions.has("org_invite_users_to_permitted_apps")
      ) ||
      !(
        currentOrgRole.canInviteAllOrgRoles ||
        currentOrgRole.canInviteOrgRoleIds.includes(params.orgRoleId)
      )
    ) {
      return false;
    }

    if (params.appUserGrants && params.appUserGrants.length) {
      if (targetOrgRole.autoAppRoleId) {
        return false;
      }
      for (let { appId, appRoleId } of params.appUserGrants) {
        const currentUserAppRole = presence(
          getAppRoleForUserOrInvitee(graph, appId, currentUserId),
          "appRole"
        );

        if (
          !currentUserAppRole ||
          !hasAllAppPermissions(graph, currentUserId, appId, [
            "app_manage_users",
          ]) ||
          !currentUserAppRole.canInviteAppRoleIds.includes(appRoleId)
        ) {
          return false;
        }
      }
    }

    if (params.userGroupIds) {
      if (targetOrgRole.autoAppRoleId) {
        return false;
      }

      if (!canManageUserGroups(graph, currentUserId)) {
        return false;
      }

      for (let groupId of params.userGroupIds) {
        const group = presence(graph[groupId] as Model.Group, "group");
        if (!group || group.objectType != "orgUser") {
          return false;
        }
      }
    }

    return true;
  },
  canInviteToApp = (graph: Graph.Graph, currentUserId: string, appId: string) =>
    hasOrgPermission(graph, currentUserId, "org_manage_users") ||
    (hasOrgPermission(
      graph,
      currentUserId,
      "org_invite_users_to_permitted_apps"
    ) &&
      hasAppPermission(graph, currentUserId, appId, "app_manage_users")),
  canInviteAny = (graph: Graph.Graph, currentUserId: string) =>
    hasOrgPermission(graph, currentUserId, "org_manage_users") ||
    (hasOrgPermission(
      graph,
      currentUserId,
      "org_invite_users_to_permitted_apps"
    ) &&
      getAppsWithAllPermissions(graph, currentUserId, ["app_manage_users"])
        .length > 0),
  canRevokeInvite = (
    graph: Graph.Graph,
    currentUserId: string,
    inviteId: string,
    now: number
  ): boolean => {
    const currentUserRes = authorizeUser(graph, currentUserId);
    if (!currentUserRes) {
      return false;
    }
    const [_, currentOrgRole, currentOrgPermissions] = currentUserRes;

    const invite = presence(graph[inviteId] as Api.Db.Invite, "invite");

    if (!invite || invite.acceptedAt || now >= invite.expiresAt) {
      return false;
    }

    const inviteeId = invite.inviteeId,
      targetOrgUser = presence(graph[inviteeId] as Api.Db.OrgUser, "orgUser");

    if (!targetOrgUser) {
      return false;
    }

    if (
      !(
        currentOrgRole.canManageAllOrgRoles ||
        currentOrgRole.canManageOrgRoleIds.includes(targetOrgUser.orgRoleId) ||
        (invite.invitedByUserId == currentUserId &&
          (currentOrgRole.canInviteAllOrgRoles ||
            currentOrgRole.canInviteOrgRoleIds.includes(
              targetOrgUser.orgRoleId
            )))
      )
    ) {
      return false;
    }

    if (currentOrgPermissions.has("org_manage_users")) {
      return true;
    } else if (
      currentOrgPermissions.has("org_invite_users_to_permitted_apps") &&
      invite.invitedByUserId == currentUserId
    ) {
      // ensure user has invite permissions for each of the target user's apps
      const currentUserAppRoles = getUserAppRolesByAppId(graph, currentUserId),
        targetAppUserRoles = getUserAppRolesByAppId(graph, currentUserId);

      for (let appId in targetAppUserRoles) {
        const currentUserAppRole = presence(
          currentUserAppRoles[appId],
          "appRole"
        );
        if (!currentUserAppRole) {
          return false;
        }
        const targetUserAppRole = targetAppUserRoles[appId];
        if (
          !(
            hasAllAppPermissions(graph, currentUserId, appId, [
              "app_manage_users",
            ]) &&
            (currentUserAppRole.canManageAppRoleIds.includes(
              targetUserAppRole.id
            ) ||
              (invite.invitedByUserId == currentUserId &&
                currentUserAppRole.canInviteAppRoleIds.includes(
                  targetUserAppRole.id
                )))
          )
        ) {
          return false;
        }
      }

      return true;
    } else {
      return false;
    }
  };

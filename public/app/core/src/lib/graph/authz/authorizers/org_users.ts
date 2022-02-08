import { Graph, Model, Rbac } from "../../../../types";
import * as R from "ramda";
import {
  authorizeUser,
  hasAllAppPermissions,
  hasOrgPermission,
  presence,
} from "./helpers";
import {
  getAppRoleForUserOrInvitee,
  getActiveOrgUsers,
  graphTypes,
} from "../..";

export const canRenameUser = (
  graph: Graph.Graph,
  currentUserId: string,
  targetUserId: string
) => canManageOrgUser(graph, currentUserId, targetUserId);

export const canUpdateUserRole = (
  graph: Graph.Graph,
  currentUserId: string,
  targetUserId: string,
  newOrgRoleId: string
): boolean => {
  const currentUserRes = authorizeUser(graph, currentUserId);
  if (!currentUserRes) {
    return false;
  }
  const [_, currentOrgRole, currentOrgPermissions] = currentUserRes;

  const targetUserRes = authorizeUser(graph, targetUserId);

  if (!targetUserRes) {
    return false;
  }

  const [user] = targetUserRes;

  if (!presence(graph[newOrgRoleId], "orgRole")) {
    return false;
  }

  const managePermission =
    user.type == "orgUser"
      ? <const>"org_manage_users"
      : <const>"org_manage_cli_users";

  if (
    !(
      currentOrgPermissions.has(managePermission) &&
      (currentOrgRole.canManageAllOrgRoles ||
        currentOrgRole.canManageOrgRoleIds.includes(user.orgRoleId)) &&
      (currentOrgRole.canManageAllOrgRoles ||
        currentOrgRole.canManageOrgRoleIds.includes(newOrgRoleId) ||
        currentOrgRole.canInviteAllOrgRoles ||
        currentOrgRole.canInviteOrgRoleIds.includes(newOrgRoleId))
    )
  ) {
    return false;
  }

  // cannot remove the last remaining human owner
  if (user.type == "orgUser" && (user.isCreator || user.inviteAcceptedAt)) {
    const oldOrgRole = graph[user.orgRoleId] as Rbac.OrgRole;
    if (oldOrgRole.isDefault && oldOrgRole.defaultName == "Org Owner") {
      const numOwners = getActiveOrgUsers(graph).filter(
        R.propEq("orgRoleId", oldOrgRole.id)
      ).length;

      if (numOwners == 1) {
        return false;
      }
    }
  }

  return true;
};

export const canRemoveFromOrg = (
  graph: Graph.Graph,
  currentUserId: string,
  targetUserId: string
): boolean => {
  const currentUserRes = authorizeUser(graph, currentUserId);
  if (!currentUserRes) {
    return false;
  }
  const [_, currentOrgRole, currentOrgPermissions] = currentUserRes;

  const targetUserRes = authorizeUser<Model.OrgUser>(graph, targetUserId, [
    "orgUser",
  ]);

  if (!targetUserRes) {
    return false;
  }

  const [user] = targetUserRes;

  // cannot remove the last remaining owner
  if (user.type == "orgUser" && (user.isCreator || user.inviteAcceptedAt)) {
    const oldOrgRole = graph[user.orgRoleId] as Rbac.OrgRole;
    if (oldOrgRole.isDefault && oldOrgRole.defaultName == "Org Owner") {
      const numOwners = getActiveOrgUsers(graph).filter(
        R.propEq("orgRoleId", oldOrgRole.id)
      ).length;

      if (numOwners == 1) {
        return false;
      }
    }
  }

  // unless last remaining owner, can always remove self from org (i.e. delete account)
  if (currentUserId == targetUserId) {
    return true;
  }

  return canManageOrgUser(graph, currentUserId, targetUserId);
};

export const canListOrgUsers = (graph: Graph.Graph, currentUserId: string) =>
  hasOrgPermission(graph, currentUserId, "org_manage_users");

export const canManageOrgUser = (
  graph: Graph.Graph,
  currentUserId: string,
  orgUserId: string
) => {
  const currentUserRes = authorizeUser(graph, currentUserId);
  if (!currentUserRes) {
    return false;
  }
  const [, currentOrgRole, currentOrgPermissions] = currentUserRes;

  const orgUserRes = authorizeUser<Model.OrgUser>(graph, orgUserId, [
    "orgUser",
  ]);

  if (!orgUserRes) {
    return false;
  }

  const [orgUser] = orgUserRes;

  if (
    currentOrgPermissions.has("org_manage_users") &&
    (currentOrgRole.canManageAllOrgRoles ||
      currentOrgRole.canManageOrgRoleIds.includes(orgUser.orgRoleId))
  ) {
    return true;
  }

  let inviterCanManage =
    currentOrgPermissions.has("org_invite_users_to_permitted_apps") &&
    orgUser.invitedById == currentUserId &&
    !orgUser.inviteAcceptedAt &&
    (currentOrgRole.canInviteAllOrgRoles ||
      currentOrgRole.canInviteOrgRoleIds.includes(orgUser.orgRoleId));

  if (inviterCanManage) {
    const { apps } = graphTypes(graph);

    for (let app of apps) {
      const targetAppRole = presence(
          getAppRoleForUserOrInvitee(graph, app.id, orgUser.id),
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
          "app_manage_users",
        ])
      ) {
        inviterCanManage = false;
        break;
      }

      if (
        inviterCanManage &&
        !currentAppRole.canInviteAppRoleIds.includes(targetAppRole.id)
      ) {
        inviterCanManage = false;
        break;
      }
    }
  }

  return inviterCanManage;
};

import {
  getDeviceApprovableUsers,
  getRevokableDevices,
  getRevokableDeviceGrants,
} from "../scopes/devices";
import * as R from "ramda";
import { Graph, Model, Rbac } from "../../../../types";
import { authorizeUser, hasAllAppPermissions, presence } from "./helpers";
import {
  getUserAppRolesByAppId,
  getActiveOrgUsers,
  getActiveOrgUserDevicesByUserId,
} from "../../.";

export const canCreateDeviceGrant = (
    graph: Graph.Graph,
    currentUserId: string,
    granteeId: string
  ): boolean => {
    const currentUserRes = authorizeUser(graph, currentUserId);
    if (!currentUserRes) {
      return false;
    }
    const [_, currentOrgRole, currentOrgPermissions] = currentUserRes;

    // only org users can have devices granted (not cli users)
    const targetUserRes = authorizeUser<Model.OrgUser>(graph, granteeId, [
      "orgUser",
    ]);
    if (!targetUserRes) {
      return false;
    }
    const [targetOrgUser] = targetUserRes,
      isInviter = targetOrgUser.invitedById == currentUserId;

    if (!(targetOrgUser.isCreator || targetOrgUser.inviteAcceptedAt)) {
      return false;
    }

    // allow users with 'org_manage_user_devices' to authorize new devices
    // (but not necessarily revoke them) for all users
    // in practice, allows Org Admins to authorize devices for an Org Owner
    // which is low risk and could be very helpful for restoring access to
    // an org if the Org Owner leaves or is locked out somehow
    if (currentOrgPermissions.has("org_manage_user_devices")) {
      return true;
    }

    if (
      !(
        currentOrgRole.canInviteAllOrgRoles ||
        currentOrgRole.canInviteOrgRoleIds.includes(targetOrgUser.orgRoleId) ||
        isInviter
      )
    ) {
      return false;
    }

    if (currentOrgPermissions.has("org_approve_devices_for_permitted")) {
      // ensure user has approve device permissions for each of the target user's apps
      const currentUserAppRoles = getUserAppRolesByAppId(graph, currentUserId),
        targetAppUserRoles = getUserAppRolesByAppId(graph, currentUserId);

      for (let appId in targetAppUserRoles) {
        const currentUserAppRole = currentUserAppRoles[appId];
        if (!currentUserAppRole) {
          return false;
        }
        const targetUserAppRole = targetAppUserRoles[appId];
        if (
          !(
            hasAllAppPermissions(graph, currentUserId, appId, [
              "app_approve_user_devices",
            ]) &&
            currentUserAppRole.canInviteAppRoleIds.includes(
              targetUserAppRole.id
            )
          )
        ) {
          return false;
        }
      }

      return true;
    } else {
      return false;
    }
  },
  canRevokeDeviceGrant = (
    graph: Graph.Graph,
    currentUserId: string,
    deviceGrantId: string
  ): boolean => {
    const currentUserRes = authorizeUser(graph, currentUserId);
    if (!currentUserRes) {
      return false;
    }
    const [_, currentOrgRole, currentOrgPermissions] = currentUserRes;

    const toRevokeGrant = presence(
      graph[deviceGrantId] as Model.DeviceGrant,
      "deviceGrant"
    );
    if (!toRevokeGrant || toRevokeGrant.acceptedAt) {
      return false;
    }

    if (!canCreateDeviceGrant(graph, currentUserId, toRevokeGrant.granteeId)) {
      return false;
    }

    const targetOrgUser = presence(
      graph[toRevokeGrant.granteeId] as Model.OrgUser,
      "orgUser"
    );
    if (!targetOrgUser) {
      return false;
    }

    return (
      toRevokeGrant.grantedByUserId == currentUserId ||
      (currentOrgPermissions.has("org_manage_user_devices") &&
        (currentOrgRole.canManageAllOrgRoles ||
          currentOrgRole.canManageOrgRoleIds.includes(targetOrgUser.orgRoleId)))
    );
  },
  canRevokeDevice = (
    graph: Graph.Graph,
    currentUserId: string,
    deviceId: string
  ): boolean => {
    const currentUserRes = authorizeUser(graph, currentUserId);
    if (!currentUserRes) {
      return false;
    }
    const [_, currentOrgRole, currentOrgPermissions] = currentUserRes;

    const orgUserDevice = presence(
      graph[deviceId] as Model.OrgUserDevice,
      "orgUserDevice"
    );

    if (!orgUserDevice) {
      return false;
    }

    const targetOrgUser = presence(
      graph[orgUserDevice.userId] as Model.OrgUser,
      "orgUser"
    );
    if (!targetOrgUser) {
      return false;
    }

    // cannot remove the last remaining owner's last remaining device
    const targetOrgRole = graph[targetOrgUser.orgRoleId] as Rbac.OrgRole;

    if (targetOrgRole.isDefault && targetOrgRole.defaultName == "Org Owner") {
      const numOwners = getActiveOrgUsers(graph).filter(
        R.propEq("orgRoleId", targetOrgRole.id)
      ).length;

      if (numOwners == 1) {
        const numDevices = (
          getActiveOrgUserDevicesByUserId(graph)[targetOrgUser.id] ?? []
        ).length;
        if (numDevices == 1) {
          return false;
        }
      }
    }

    return (
      currentOrgPermissions.has("org_manage_user_devices") &&
      (currentOrgRole.canManageAllOrgRoles ||
        currentOrgRole.canManageOrgRoleIds.includes(targetOrgUser.orgRoleId))
    );
  },
  canManageAnyDevicesOrGrants = (graph: Graph.Graph, currentUserId: string) =>
    getDeviceApprovableUsers(graph, currentUserId).length > 0 ||
    getRevokableDevices(graph, currentUserId).length > 0 ||
    getRevokableDeviceGrants(graph, currentUserId).length > 0,
  canManageAnyUserDevicesOrGrants = (
    graph: Graph.Graph,
    currentUserId: string,
    userId: string
  ) =>
    getDeviceApprovableUsers(graph, currentUserId).filter(
      R.propEq("id", userId)
    ).length == 1 ||
    getRevokableDevices(graph, currentUserId).filter(R.propEq("userId", userId))
      .length > 0 ||
    getRevokableDeviceGrants(graph, currentUserId).filter(
      R.propEq("granteeId", userId)
    ).length > 0;

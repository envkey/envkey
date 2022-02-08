import { Graph, Rbac, Model } from "../../types";
import * as R from "ramda";
import memoize from "../../lib/utils/memoize";
import { graphTypes } from "./base";
import { indexBy, groupBy } from "../utils/array";

export const environmentCompositeId = (environment: Model.Environment) => {
    let s = environment.environmentRoleId;
    if (environment.isSub) {
      s += "|" + environment.subName.toLowerCase();
    }
    return s;
  },
  getOrgUsersByOrgRoleId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("orgRoleId"),
        graphTypes(graph).orgUsers
      ) as Graph.MaybeGrouped<Model.OrgUser>
  ),
  getCliUsersByOrgRoleId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("orgRoleId"),
        graphTypes(graph).cliUsers
      ) as Graph.MaybeGrouped<Model.CliUser>
  ),
  getOrgRolesByAutoAppRoleId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.propOr(undefined, "autoAppRoleId"),
        graphTypes(graph).orgRoles
      ) as Graph.MaybeGrouped<Rbac.OrgRole>
  ),
  getOrgRolesByExtendsId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.propOr(undefined, "extendsOrgRoleId"),
        graphTypes(graph).orgRoles
      ) as Graph.MaybeGrouped<Rbac.OrgRole>
  ),
  getAppRolesByExtendsId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.propOr(undefined, "extendsAppRoleId"),
        graphTypes(graph).appRoles
      ) as Graph.MaybeGrouped<Rbac.AppRole>
  ),
  getOrgUserDevicesByUserId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("userId"),
        graphTypes(graph).orgUserDevices
      ) as Graph.MaybeGrouped<Model.OrgUserDevice>
  ),
  getActiveOrgUserDevicesByUserId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("userId"),
        graphTypes(graph).orgUserDevices.filter(
          ({ deactivatedAt, deletedAt }) => !deletedAt && !deactivatedAt
        )
      ) as Graph.MaybeGrouped<Model.OrgUserDevice>
  ),
  getActiveInvites = memoize((graph: Graph.Graph, now: number) =>
    graphTypes(graph).invites.filter(
      ({ acceptedAt, expiresAt }) => !acceptedAt && expiresAt > now
    )
  ),
  getActiveOrgUsers = memoize((graph: Graph.Graph) =>
    graphTypes(graph).orgUsers.filter(
      ({ isCreator, deactivatedAt, deletedAt, inviteAcceptedAt }) =>
        !deletedAt && !deactivatedAt && (inviteAcceptedAt || isCreator)
    )
  ),
  getActiveOrInvitedOrgUsers = memoize((graph: Graph.Graph) =>
    graphTypes(graph).orgUsers.filter(
      ({ deactivatedAt, deletedAt }) => !deletedAt && !deactivatedAt
    )
  ),
  getActiveCliUsers = memoize((graph: Graph.Graph) =>
    graphTypes(graph).cliUsers.filter(
      ({ deactivatedAt, deletedAt }) => !deletedAt && !deactivatedAt
    )
  ),
  getActiveOrExpiredInvites = memoize((graph: Graph.Graph) =>
    graphTypes(graph).invites.filter(({ acceptedAt }) => !acceptedAt)
  ),
  getActiveDeviceGrants = memoize((graph: Graph.Graph, now: number) =>
    graphTypes(graph).deviceGrants.filter(
      ({ acceptedAt, expiresAt }) => !acceptedAt && expiresAt > now
    )
  ),
  getNumActiveDeviceLike = memoize((graph: Graph.Graph, now: number) => {
    const numActiveDevices = Object.values(
      getActiveOrgUserDevicesByUserId(graph)
    ).flat().length;
    const numActiveInvites = getActiveInvites(graph, now).length;
    const numActiveGrants = getActiveDeviceGrants(graph, now).length;
    const numActiveCliKeys = getActiveCliUsers(graph).length;

    return (
      numActiveDevices + numActiveInvites + numActiveGrants + numActiveCliKeys
    );
  }),
  getExpiredDeviceGrants = memoize((graph: Graph.Graph, now: number) =>
    graphTypes(graph).deviceGrants.filter(
      ({ acceptedAt, expiresAt }) => !acceptedAt && now > expiresAt
    )
  ),
  getActiveOrExpiredDeviceGrants = memoize((graph: Graph.Graph) =>
    graphTypes(graph).deviceGrants.filter(({ acceptedAt }) => !acceptedAt)
  ),
  getActiveInvitesByInviteeId = memoize(
    (graph: Graph.Graph, now: number) =>
      groupBy(
        R.prop("inviteeId"),
        getActiveInvites(graph, now)
      ) as Graph.MaybeGrouped<Model.Invite>
  ),
  getActiveOrExpiredInvitesByInviteeId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("inviteeId"),
        getActiveOrExpiredInvites(graph)
      ) as Graph.MaybeGrouped<Model.Invite>
  ),
  getActiveDeviceGrantsByGranteeId = memoize(
    (graph: Graph.Graph, now: number) =>
      groupBy(
        R.prop("granteeId"),
        getActiveDeviceGrants(graph, now)
      ) as Graph.MaybeGrouped<Model.DeviceGrant>
  ),
  getExpiredDeviceGrantsByGranteeId = memoize(
    (graph: Graph.Graph, now: number) =>
      groupBy(
        R.prop("granteeId"),
        getExpiredDeviceGrants(graph, now)
      ) as Graph.MaybeGrouped<Model.DeviceGrant>
  ),
  getActiveOrExpiredDeviceGrantsByGranteeId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("granteeId"),
        getActiveOrExpiredDeviceGrants(graph)
      ) as Graph.MaybeGrouped<Model.DeviceGrant>
  ),
  getActiveInvitesByInvitedByUserId = memoize(
    (graph: Graph.Graph, now: number) =>
      groupBy(
        R.prop("invitedByUserId"),
        getActiveInvites(graph, now)
      ) as Graph.MaybeGrouped<Model.Invite>
  ),
  getActiveOrExpiredInvitesByInvitedByUserId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("invitedByUserId"),
        getActiveOrExpiredInvites(graph)
      ) as Graph.MaybeGrouped<Model.Invite>
  ),
  getActiveDeviceGrantsByGrantedByUserId = memoize(
    (graph: Graph.Graph, now: number) =>
      groupBy(
        R.prop("grantedByUserId"),
        getActiveDeviceGrants(graph, now)
      ) as Graph.MaybeGrouped<Model.DeviceGrant>
  ),
  getActiveOrExpiredDeviceGrantsByGrantedByUserId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("grantedByUserId"),
        getActiveOrExpiredDeviceGrants(graph)
      ) as Graph.MaybeGrouped<Model.DeviceGrant>
  ),
  getActiveRecoveryKeys = memoize((graph: Graph.Graph) =>
    graphTypes(graph).recoveryKeys.filter(({ redeemedAt }) => !redeemedAt)
  ),
  getActiveRecoveryKeysByUserId = memoize(
    (graph: Graph.Graph) =>
      indexBy(
        R.prop("userId"),
        getActiveRecoveryKeys(graph)
      ) as Graph.MaybeIndexed<Model.RecoveryKey>
  ),
  getAppUserGrantsByUserId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("userId"),
        graphTypes(graph).appUserGrants
      ) as Graph.MaybeGrouped<Model.AppUserGrant>
  ),
  getAppUserGrantsByComposite = memoize(
    (graph: Graph.Graph) =>
      indexBy(
        ({ userId, appId }) => userId + "|" + appId,
        graphTypes(graph).appUserGrants
      ) as Graph.MaybeIndexed<Model.AppUserGrant>
  ),
  getAppUserGrantsByAppRoleId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("appRoleId"),
        graphTypes(graph).appUserGrants
      ) as Graph.MaybeGrouped<Model.AppUserGrant>
  ),
  getAppRoleEnvironmentRolesByAppRoleId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("appRoleId"),
        graphTypes(graph).appRoleEnvironmentRoles
      ) as Graph.Grouped<Rbac.AppRoleEnvironmentRole>
  ),
  getAppRoleEnvironmentRolesByEnvironmentRoleId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("environmentRoleId"),
        graphTypes(graph).appRoleEnvironmentRoles
      ) as Graph.Grouped<Rbac.AppRoleEnvironmentRole>
  ),
  getAppRoleEnvironmentRolesByComposite = memoize(
    (graph: Graph.Graph) =>
      indexBy(
        ({ appRoleId, environmentRoleId }) =>
          appRoleId + "|" + environmentRoleId,
        graphTypes(graph).appRoleEnvironmentRoles
      ) as Graph.Indexed<Rbac.AppRoleEnvironmentRole>
  ),
  getAppBlocksByBlockId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("blockId"),
        R.sortBy(R.prop("orderIndex"), graphTypes(graph).appBlocks)
      ) as Graph.MaybeGrouped<Model.AppBlock>
  ),
  getAppBlocksByAppId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("appId"),
        graphTypes(graph).appBlocks
      ) as Graph.MaybeGrouped<Model.AppBlock>
  ),
  getAppBlocksByComposite = memoize(
    (graph: Graph.Graph) =>
      indexBy(
        ({ appId, blockId }) => appId + "|" + blockId,
        graphTypes(graph).appBlocks
      ) as Graph.MaybeIndexed<Model.AppBlock>
  ),
  getEnvironmentsByEnvParentId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("envParentId"),
        graphTypes(graph).environments
      ) as Graph.MaybeGrouped<Model.Environment>
  ),
  getEnvironmentsByRoleId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("environmentRoleId"),
        graphTypes(graph).environments
      ) as Graph.MaybeGrouped<Model.Environment>
  ),
  getSubEnvironmentsByParentEnvironmentId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("parentEnvironmentId"),
        graphTypes(graph).environments.filter(
          R.prop("isSub")
        ) as (Model.Environment & { isSub: true })[]
      ) as Graph.MaybeGrouped<Model.Environment & { isSub: true }>
  ),
  getLocalKeysByEnvironmentId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("environmentId"),
        graphTypes(graph).localKeys
      ) as Graph.MaybeGrouped<Model.LocalKey>
  ),
  getLocalKeysByUserId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("userId"),
        graphTypes(graph).localKeys
      ) as Graph.MaybeGrouped<Model.LocalKey>
  ),
  getLocalKeysByDeviceId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("deviceId"),
        graphTypes(graph).localKeys
      ) as Graph.MaybeGrouped<Model.LocalKey>
  ),
  getLocalKeysByEnvironmentComposite = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        ({ environmentId, userId }) => environmentId + "|" + userId,
        graphTypes(graph).localKeys
      ) as Graph.MaybeGrouped<Model.LocalKey>
  ),
  getLocalKeysByLocalsComposite = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        ({ appId, userId }) => appId + "|" + userId,
        graphTypes(graph).localKeys
      ) as Graph.MaybeGrouped<Model.LocalKey>
  ),
  getServersByEnvironmentId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("environmentId"),
        graphTypes(graph).servers
      ) as Graph.MaybeGrouped<Model.Server>
  ),
  getIncludedAppRolesByAppId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("appId"),
        graphTypes(graph).includedAppRoles
      ) as Graph.Grouped<Model.IncludedAppRole>
  ),
  getIncludedAppRolesByAppRoleId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("appRoleId"),
        graphTypes(graph).includedAppRoles
      ) as Graph.MaybeGrouped<Model.IncludedAppRole>
  ),
  getIncludedAppRolesByComposite = memoize(
    (graph: Graph.Graph) =>
      indexBy(
        ({ appRoleId, appId }) => appRoleId + "|" + appId,
        graphTypes(graph).includedAppRoles
      ) as Graph.Indexed<Model.IncludedAppRole>
  ),
  getActiveGeneratedEnvkeysByKeyableParentId = memoize(
    (graph: Graph.Graph) =>
      indexBy(
        R.prop("keyableParentId"),
        graphTypes(graph).generatedEnvkeys.filter(({ deletedAt }) => !deletedAt)
      ) as Graph.MaybeIndexed<Model.GeneratedEnvkey>
  ),
  getActiveGeneratedEnvkeysByAppId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("appId"),
        graphTypes(graph).generatedEnvkeys.filter(({ deletedAt }) => !deletedAt)
      ) as Graph.MaybeGrouped<Model.GeneratedEnvkey>
  ),
  getGroupsByObjectType = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("objectType"),
        graphTypes(graph).groups
      ) as Graph.MaybeGrouped<Model.Group>
  ),
  getGroupMembershipsByObjectId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("objectId"),
        graphTypes(graph).groupMemberships
      ) as Graph.MaybeGrouped<Model.GroupMembership>
  ),
  getGroupMembershipsByGroupId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("groupId"),
        graphTypes(graph).groupMemberships
      ) as Graph.MaybeGrouped<Model.GroupMembership>
  ),
  getGroupMembershipsByComposite = memoize(
    (graph: Graph.Graph) =>
      indexBy(
        ({ groupId, objectId }) => groupId + "|" + objectId,
        graphTypes(graph).groupMemberships
      ) as Graph.MaybeIndexed<Model.GroupMembership>
  ),
  getAppUserGroupsByAppId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("appId"),
        graphTypes(graph).appUserGroups
      ) as Graph.MaybeGrouped<Model.AppUserGroup>
  ),
  getAppUserGroupsByGroupId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("userGroupId"),
        graphTypes(graph).appUserGroups
      ) as Graph.MaybeGrouped<Model.AppUserGroup>
  ),
  getAppUserGroupsByComposite = memoize(
    (graph: Graph.Graph) =>
      indexBy(
        ({ appId, userGroupId }) => appId + "|" + userGroupId,
        graphTypes(graph).appUserGroups
      ) as Graph.MaybeIndexed<Model.AppUserGroup>
  ),
  getAppGroupUserGroupsByComposite = memoize(
    (graph: Graph.Graph) =>
      indexBy(
        ({ appGroupId, userGroupId }) => appGroupId + "|" + userGroupId,
        graphTypes(graph).appGroupUserGroups
      ) as Graph.MaybeIndexed<Model.AppGroupUserGroup>
  ),
  getAppGroupUserGroupsByAppGroupId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("appGroupId"),
        graphTypes(graph).appGroupUserGroups
      ) as Graph.MaybeGrouped<Model.AppGroupUserGroup>
  ),
  getAppGroupUserGroupsByUserGroupId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("userGroupId"),
        graphTypes(graph).appGroupUserGroups
      ) as Graph.MaybeGrouped<Model.AppGroupUserGroup>
  ),
  getAppGroupUsersByComposite = memoize(
    (graph: Graph.Graph) =>
      indexBy(
        ({ appGroupId, userId }) => appGroupId + "|" + userId,
        graphTypes(graph).appGroupUsers
      ) as Graph.MaybeIndexed<Model.AppGroupUser>
  ),
  getAppGroupUsersByAppGroupId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("appGroupId"),
        graphTypes(graph).appGroupUsers
      ) as Graph.MaybeGrouped<Model.AppGroupUser>
  ),
  getAppBlockGroupsByAppId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("appId"),
        graphTypes(graph).appBlockGroups
      ) as Graph.MaybeGrouped<Model.AppBlockGroup>
  ),
  getAppBlockGroupsByBlockGroupId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("blockGroupId"),
        graphTypes(graph).appBlockGroups
      ) as Graph.MaybeGrouped<Model.AppBlockGroup>
  ),
  getAppBlockGroupsByComposite = memoize(
    (graph: Graph.Graph) =>
      indexBy(
        ({ appId, blockGroupId }) => appId + "|" + blockGroupId,
        graphTypes(graph).appBlockGroups
      ) as Graph.MaybeIndexed<Model.AppBlockGroup>
  ),
  getAppGroupBlockGroupsByAppGroupId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("appGroupId"),
        graphTypes(graph).appGroupBlockGroups
      ) as Graph.MaybeGrouped<Model.AppGroupBlockGroup>
  ),
  getAppGroupBlockGroupsByBlockGroupId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("blockGroupId"),
        graphTypes(graph).appGroupBlockGroups
      ) as Graph.MaybeGrouped<Model.AppGroupBlockGroup>
  ),
  getAppGroupBlockGroupsByComposite = memoize(
    (graph: Graph.Graph) =>
      indexBy(
        ({ appGroupId, blockGroupId }) => appGroupId + "|" + blockGroupId,
        graphTypes(graph).appGroupBlockGroups
      ) as Graph.MaybeIndexed<Model.AppGroupBlockGroup>
  ),
  getAppGroupBlocksByAppGroupId = memoize(
    (graph: Graph.Graph) =>
      groupBy(
        R.prop("appGroupId"),
        graphTypes(graph).appGroupBlocks
      ) as Graph.MaybeGrouped<Model.AppGroupBlock>
  ),
  getAppGroupBlocksByComposite = memoize(
    (graph: Graph.Graph) =>
      indexBy(
        ({ appGroupId, blockId }) => appGroupId + "|" + blockId,
        graphTypes(graph).appGroupBlocks
      ) as Graph.MaybeIndexed<Model.AppGroupBlock>
  );

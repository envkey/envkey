import { Graph, Rbac, Model } from "../../types";
import memoize from "../../lib/utils/memoize";
import {
  getAppUserGroupsByGroupId,
  getAppGroupUserGroupsByUserGroupId,
  getGroupMembershipsByGroupId,
  getAppGroupUsersByAppGroupId,
  getAppGroupUserGroupsByAppGroupId,
  getAppGroupBlocksByAppGroupId,
  getAppGroupBlockGroupsByAppGroupId,
  getAppGroupBlockGroupsByBlockGroupId,
  getAppBlockGroupsByBlockGroupId,
} from "./indexed_graph";
import { getConnectedBlocksForApp } from "./app_blocks";
import * as R from "ramda";
import { mergeAccessScopes } from "./org_access";

export const getOrgAccessScopeForGroupMembership = memoize(
  (
    graph: Graph.Graph,
    groupId: string,
    objectId?: string
  ): Rbac.OrgAccessScope => {
    const group = graph[groupId] as Model.Group;

    if (group.objectType == "orgUser") {
      // find all apps this group is connected to
      const appUserGroups = getAppUserGroupsByGroupId(graph)[groupId] ?? [];
      const appGroupUserGroups =
        getAppGroupUserGroupsByUserGroupId(graph)[groupId] ?? [];

      const appIds = new Set<string>();
      const blockIds = new Set<string>();
      const envParentIds = new Set<string>();

      for (let { appId } of appUserGroups) {
        appIds.add(appId);
        envParentIds.add(appId);
      }

      for (let { appGroupId } of appGroupUserGroups) {
        const memberships =
          getGroupMembershipsByGroupId(graph)[appGroupId] ?? [];
        for (let { objectId: appId } of memberships) {
          appIds.add(appId);
          envParentIds.add(appId);
        }
      }

      // through connected apps, find all blocks this group is connected to
      for (let appId of appIds) {
        const connectedBlocks = getConnectedBlocksForApp(graph, appId);
        for (let { id } of connectedBlocks) {
          blockIds.add(id);
          envParentIds.add(id);
        }
      }

      return {
        envParentIds,
        userIds: new Set([objectId].filter(Boolean) as string[]),
      };
    } else if (group.objectType == "app") {
      const userIds = new Set<string>();
      const envParentIds = new Set<string>(
        [objectId].filter(Boolean) as string[]
      );

      const appGroupUsers = getAppGroupUsersByAppGroupId(graph)[groupId] ?? [];
      const appGroupUserGroups =
        getAppGroupUserGroupsByAppGroupId(graph)[groupId] ?? [];
      const appGroupBlocks =
        getAppGroupBlocksByAppGroupId(graph)[groupId] ?? [];
      const appGroupBlockGroups =
        getAppGroupBlockGroupsByAppGroupId(graph)[groupId] ?? [];

      for (let { userId } of appGroupUsers) {
        userIds.add(userId);
      }

      for (let { userGroupId } of appGroupUserGroups) {
        const memberships =
          getGroupMembershipsByGroupId(graph)[userGroupId] ?? [];
        for (let { objectId: userId } of memberships) {
          userIds.add(userId);
        }
      }

      for (let { blockId } of appGroupBlocks) {
        envParentIds.add(blockId);
      }

      for (let { blockGroupId } of appGroupBlockGroups) {
        const memberships =
          getGroupMembershipsByGroupId(graph)[blockGroupId] ?? [];
        for (let { objectId: blockId } of memberships) {
          envParentIds.add(blockId);
        }
      }

      return {
        userIds,
        envParentIds,
        keyableParentIds: "all",
      };
    } else if (group.objectType == "block") {
      const envParentIds = new Set<string>(
        [objectId].filter(Boolean) as string[]
      );
      const appBlockGroups =
        getAppBlockGroupsByBlockGroupId(graph)[groupId] ?? [];
      const appGroupBlockGroups =
        getAppGroupBlockGroupsByBlockGroupId(graph)[groupId] ?? [];

      for (let { appId } of appBlockGroups) {
        envParentIds.add(appId);
      }

      for (let { appGroupId } of appGroupBlockGroups) {
        const memberships =
          getGroupMembershipsByGroupId(graph)[appGroupId] ?? [];
        for (let { objectId: appId } of memberships) {
          envParentIds.add(appId);
        }
      }

      return {
        envParentIds,
        userIds: "all",
        keyableParentIds: "all",
      };
    }

    throw new Error("Invalid group object type");
  }
);

export const getOrgAccessScopeForGroupMembers = memoize(
  (
    graph: Graph.Graph,
    groupId: string,
    includeConnectedBlocks?: true
  ): Rbac.OrgAccessScope => {
    const group = graph[groupId] as Model.Group;
    const memberships = getGroupMembershipsByGroupId(graph)[groupId] ?? [];
    const objectIds = memberships.map(R.prop("objectId"));
    const objectIdsSet = new Set(objectIds);

    let scope: Rbac.OrgAccessScope | undefined;

    if (group.objectType == "orgUser") {
      scope = {
        userIds: objectIdsSet,
      };
    } else if (group.objectType == "app" && includeConnectedBlocks) {
      scope = {
        envParentIds: new Set([
          ...objectIds,
          ...R.flatten(
            objectIds.map((appId) =>
              getConnectedBlocksForApp(graph, appId).map(R.prop("id"))
            )
          ),
        ]),
      };
    } else {
      scope = {
        envParentIds: objectIdsSet,
      };
    }

    if (!scope) {
      throw new Error("Invalid group object type");
    }

    return mergeAccessScopes(
      scope,
      getOrgAccessScopeForGroupMembership(graph, groupId)
    );
  }
);

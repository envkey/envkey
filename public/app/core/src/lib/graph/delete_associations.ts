import { Graph, Model } from "../../types";
import * as R from "ramda";
import {
  graphTypes,
  getIncludedAppRolesByAppId,
  getAppBlocksByAppId,
  getGroupMembershipsByObjectId,
  getEnvironmentsByEnvParentId,
  getActiveGeneratedEnvkeysByKeyableParentId,
  getActiveGeneratedEnvkeysByAppId,
} from ".";
import {
  getAppBlocksByBlockId,
  getSubEnvironmentsByParentEnvironmentId,
} from "./indexed_graph";

export const getDeleteAppAssociations = (
    graph: Graph.Graph,
    appId: string
  ): Graph.GraphObject[] => {
    const app = graph[appId] as Model.App,
      byType = graphTypes(graph),
      appUserGrants = byType.appUserGrants.filter(
        R.propEq("appId", app.id)
      ) as Model.AppUserGrant[],
      includedAppRoles = getIncludedAppRolesByAppId(graph)[app.id],
      localKeys = byType.localKeys.filter(R.propEq("appId", app.id)),
      servers = byType.servers.filter(R.propEq("appId", app.id)),
      generatedEnvkeys = getActiveGeneratedEnvkeysByAppId(graph)[app.id] ?? [],
      appBlocks = (getAppBlocksByAppId(graph)[app.id] ??
        []) as Model.AppBlock[],
      groupMemberships = getGroupMembershipsByObjectId(graph)[app.id] ?? [],
      appUserGroups = byType.appUserGroups.filter(R.propEq("appId", app.id)),
      appBlockGroups = byType.appBlockGroups.filter(R.propEq("appId", app.id)),
      environments = getEnvironmentsByEnvParentId(graph)[app.id] ?? [];

    return [
      ...appUserGrants,
      ...appBlocks,
      ...generatedEnvkeys,
      ...localKeys,
      ...servers,
      ...includedAppRoles,
      ...groupMemberships,
      ...appUserGroups,
      ...appBlockGroups,
      ...environments,
    ];
  },
  getDeleteBlockAssociations = (
    graph: Graph.Graph,
    blockId: string
  ): Graph.GraphObject[] => {
    const byType = graphTypes(graph),
      appBlocks = (getAppBlocksByBlockId(graph)[blockId] ??
        []) as Model.AppBlock[],
      groupMemberships = getGroupMembershipsByObjectId(graph)[blockId] || [],
      appGroupBlocks = byType.appGroupBlocks.filter(
        R.propEq("blockId", blockId)
      ),
      environments = getEnvironmentsByEnvParentId(graph)[blockId] ?? [];

    return [
      ...appBlocks,
      ...groupMemberships,
      ...appGroupBlocks,
      ...environments,
    ];
  },
  getDeleteGroupAssociations = (
    graph: Graph.Graph,
    groupId: string
  ): Graph.GraphObject[] => {
    const byType = graphTypes(graph),
      groupMemberships = byType.groupMemberships.filter(
        R.propEq("groupId", groupId)
      ),
      appUserGroups = byType.appUserGroups.filter(
        R.propEq("userGroupId", groupId)
      ),
      appGroupUserGroups = byType.appGroupUserGroups.filter(
        ({ appGroupId, userGroupId }) =>
          appGroupId == groupId || userGroupId == groupId
      ),
      appGroupUsers = byType.appGroupUsers.filter(
        R.propEq("appGroupId", groupId)
      ),
      appBlockGroups = byType.appBlockGroups.filter(
        R.propEq("blockGroupId", groupId)
      ),
      appGroupBlocks = byType.appGroupBlocks.filter(
        R.propEq("appGroupId", groupId)
      ),
      appGroupBlockGroups = byType.appGroupBlockGroups.filter(
        ({ appGroupId, blockGroupId }) =>
          appGroupId == groupId || blockGroupId == groupId
      );

    return [
      ...groupMemberships,
      ...appUserGroups,
      ...appGroupUserGroups,
      ...appGroupUsers,
      ...appBlockGroups,
      ...appGroupBlocks,
      ...appGroupBlockGroups,
    ];
  },
  getDeleteEnvironmentAssociations = (
    graph: Graph.Graph,
    environmentId: string
  ): Graph.GraphObject[] => {
    const byType = graphTypes(graph),
      localKeys = byType.localKeys.filter(
        R.propEq("environmentId", environmentId)
      ),
      servers = byType.servers.filter(R.propEq("environmentId", environmentId)),
      keyableParentAssociations = R.flatten(
        [...localKeys, ...servers].map(({ id }) =>
          getDeleteKeyableParentAssociations(graph, id)
        )
      ),
      subEnvironments =
        getSubEnvironmentsByParentEnvironmentId(graph)[environmentId] ?? [],
      subEnvironmentAssociations = R.flatten(
        subEnvironments.map(({ id }) =>
          getDeleteEnvironmentAssociations(graph, id)
        )
      );

    return [
      ...localKeys,
      ...servers,
      ...keyableParentAssociations,
      ...subEnvironments,
      ...subEnvironmentAssociations,
    ];
  },
  getDeleteKeyableParentAssociations = (
    graph: Graph.Graph,
    keyableParentId: string
  ): Graph.GraphObject[] => {
    const generatedEnvkey =
      getActiveGeneratedEnvkeysByKeyableParentId(graph)[keyableParentId];
    return generatedEnvkey ? [generatedEnvkey] : [];
  };

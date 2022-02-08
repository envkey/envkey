import { Graph, Model, Client } from "../../types";
import * as R from "ramda";
import memoize from "../../lib/utils/memoize";
import {
  getGroupMembershipsByObjectId,
  getAppBlockGroupsByComposite,
  getAppGroupBlocksByComposite,
  getAppGroupBlockGroupsByComposite,
  getAppBlocksByComposite,
  getEnvironmentsByEnvParentId,
  environmentCompositeId,
  getSubEnvironmentsByParentEnvironmentId,
} from "./indexed_graph";
import { graphTypes } from "./base";
import { indexBy, groupBy } from "../utils/array";

export const getAppBlockGroupAssoc = memoize(
    (graph: Graph.Graph, appId: string, blockId: string) => {
      // we want to sort from most general attachment (group to group)
      // to most specific attachment (app to block). more specific connections
      // override more general.
      // we want to look for connections in REVERSE of the sort order so that
      // in cases of duplicate connections, the most specific takes precedence

      const blockGroupIds = (
          getGroupMembershipsByObjectId(graph)[blockId] || []
        ).map(R.prop("groupId")),
        appGroupIds = (getGroupMembershipsByObjectId(graph)[appId] || []).map(
          R.prop("groupId")
        );

      const appBlockGroup = blockGroupIds
        .map(
          (blockGroupId) =>
            getAppBlockGroupsByComposite(graph)[appId + "|" + blockGroupId]
        )
        .filter(Boolean)[0];

      if (appBlockGroup) {
        return appBlockGroup;
      }

      const appGroupBlock = appGroupIds
        .map(
          (appGroupId) =>
            getAppGroupBlocksByComposite(graph)[appGroupId + "|" + blockId]
        )
        .filter(Boolean)[0];

      if (appGroupBlock) {
        return appGroupBlock;
      }

      const appGroupBlockGroup = R.flatten(
        blockGroupIds.map((blockGroupId) =>
          appGroupIds.map(
            (appGroupId) =>
              getAppGroupBlockGroupsByComposite(graph)[
                appGroupId + "|" + blockGroupId
              ]
          )
        )
      ).filter(Boolean)[0];

      if (appGroupBlockGroup) {
        return appGroupBlockGroup;
      }
    }
  ),
  getAppBlockGroupMembership = memoize(
    (graph: Graph.Graph, appId: string, blockId: string) => {
      const assoc = getAppBlockGroupAssoc(graph, appId, blockId);
      if (assoc && "blockGroupId" in assoc) {
        const membership = getGroupMembershipsByObjectId(graph)[
          blockId
        ]?.filter(R.propEq("groupId", assoc.blockGroupId))[0];

        if (
          membership &&
          (graph[membership.groupId] as Model.Group).objectType == "block"
        ) {
          return membership;
        }
      }
    }
  ),
  getConnectedAppsForBlock = memoize((graph: Graph.Graph, blockId: string) => {
    const apps = graphTypes(graph).apps;

    return apps.filter(
      ({ id: id }) =>
        getAppBlocksByComposite(graph)[id + "|" + blockId] ??
        getAppBlockGroupAssoc(graph, id, blockId)
    );
  }),
  getConnectedBlocksForApp = memoize((graph: Graph.Graph, appId: string) => {
    const blocks = graphTypes(graph).blocks,
      connected = R.sortBy(
        ({ id: id }) => getBlockSortVal(graph, appId, id),
        blocks.filter(
          ({ id: id }) =>
            getAppBlocksByComposite(graph)[appId + "|" + id] ??
            getAppBlockGroupAssoc(graph, appId, id)
        )
      );

    return connected;
  }),
  getBlockSortVal = (graph: Graph.Graph, appId: string, blockId: string) => {
    const assoc = getAppBlockGroupAssoc(graph, appId, blockId),
      blockGroupMembership = assoc
        ? getAppBlockGroupMembership(graph, appId, blockId)
        : undefined,
      appBlock = getAppBlocksByComposite(graph)[appId + "|" + blockId];

    // we want to sort from most general attachment (group to group)
    // to most specific attachment (app to block). more specific connections
    // override more general.
    // we want to look for connections in REVERSE of the sort order so that
    // in cases of duplicate connections, the most specific takes precedence

    let res: string[] | undefined;

    if (appBlock) {
      const padsize = 15 - appBlock.orderIndex.toString().length,
        zeroPadding = R.repeat("0", padsize);

      res = ["4", ...zeroPadding, appBlock.orderIndex.toString()];
    } else if (assoc) {
      const padsize = blockGroupMembership
          ? 15 -
            (assoc.orderIndex.toString().length +
              blockGroupMembership.orderIndex!.toString().length)
          : 15 - assoc.orderIndex.toString().length,
        zeroPadding = R.repeat("0", padsize);

      switch (assoc.type) {
        case "appBlockGroup":
          res = [
            "3",
            ...zeroPadding,
            assoc.orderIndex.toString(),
            blockGroupMembership!.orderIndex!.toString(),
          ];
          break;

        case "appGroupBlock":
          res = ["2", ...zeroPadding, assoc.orderIndex.toString()];
          break;

        case "appGroupBlockGroup":
          res = [
            "1",
            ...zeroPadding,
            assoc.orderIndex.toString(),
            blockGroupMembership!.orderIndex!.toString(),
          ];
          break;
      }
    }

    if (!res) {
      return -1;
    }

    return parseInt(res.join(""));
  },
  getEnvParentWithConnectedIds = memoize(
    (graph: Client.Graph.UserGraph, envParentId: string) => {
      const envParent = graph[envParentId] as Model.EnvParent;
      if (envParent.type == "app") {
        return [
          envParentId,
          ...getConnectedBlocksForApp(graph, envParentId).map(R.prop("id")),
        ];
      } else {
        return [envParentId];
      }
    }
  ),
  getConnectedBlockEnvironmentsForApp = memoize(
    (
      graph: Graph.Graph,
      appId: string,
      blockId?: string,
      environmentId?: string,
      environmentRoleId?: string
    ) => {
      let appEnvironments = getEnvironmentsByEnvParentId(graph)[appId] || [];
      if (environmentId || environmentRoleId) {
        appEnvironments = appEnvironments.filter(
          (appEnvironment) =>
            (environmentId && appEnvironment.id == environmentId) ||
            (environmentRoleId &&
              appEnvironment.environmentRoleId == environmentRoleId)
        );
      }

      const blockIds: string[] = blockId
          ? [blockId]
          : getConnectedBlocksForApp(graph, appId).map(R.prop("id")),
        indexByBlockId: { [id: string]: number } = {};

      blockIds.forEach((id, i) => (indexByBlockId[id] = i));

      let blockEnvironments = R.flatten(
        blockIds.map(
          (connectedBlockId) =>
            getEnvironmentsByEnvParentId(graph)[connectedBlockId] || []
        )
      );

      const blockEnvironmentsByComposite = groupBy(
        environmentCompositeId,
        blockEnvironments
      );

      let connectedBlockEnvironments: typeof blockEnvironments = [];

      for (let appEnvironment of appEnvironments) {
        let connected =
          blockEnvironmentsByComposite[environmentCompositeId(appEnvironment)];

        if (appEnvironment.isSub && !connected) {
          const parentEnvironment = graph[
            appEnvironment.parentEnvironmentId
          ] as Model.Environment;
          connected =
            blockEnvironmentsByComposite[
              environmentCompositeId(parentEnvironment)
            ];
        }

        if (connected) {
          connectedBlockEnvironments.push(...connected);
        }
      }

      const res = R.sortBy(
        ({ envParentId }) => indexByBlockId[envParentId],
        connectedBlockEnvironments
      );

      return res;
    }
  ),
  getAllConnectedAppEnvironmentsForBlock = memoize(
    (
      graph: Graph.Graph,
      blockId: string,
      blockEnvironmentIds?: Set<string>
    ) => {
      const connectedApps = getConnectedAppsForBlock(graph, blockId);

      let blockEnvironments =
        getEnvironmentsByEnvParentId(graph)[blockId] || [];

      if (blockEnvironmentIds) {
        blockEnvironments = blockEnvironments.filter(({ id }) =>
          blockEnvironmentIds.has(id)
        );
      }

      const blockEnvironmentComposites = blockEnvironments.map(
        environmentCompositeId
      );

      return R.flatten(
        connectedApps.map((app) =>
          Object.values(
            R.pick(
              blockEnvironmentComposites,
              groupBy(
                environmentCompositeId,
                getEnvironmentsByEnvParentId(graph)[app.id] || []
              )
            )
          )
        )
      );
    }
  ),
  getConnectedEnvironments = memoize(
    (graph: Graph.Graph, environmentId: string) => {
      const environment = graph[environmentId] as Model.Environment,
        envParent = graph[environment.envParentId] as Model.EnvParent;

      let connectedEnvironments: Model.Environment[] = [];

      if (envParent.type == "block") {
        connectedEnvironments = connectedEnvironments.concat(
          getConnectedAppEnvironmentsForBlock(
            graph,
            envParent.id,
            environmentId
          )
        );
      }

      connectedEnvironments = [
        ...connectedEnvironments,
        ...(getSubEnvironmentsByParentEnvironmentId(graph)[environmentId] ??
          []),
        ...R.flatten(
          connectedEnvironments.map((connectedEnvironment) => {
            return connectedEnvironment.isSub
              ? []
              : getSubEnvironmentsByParentEnvironmentId(graph)[
                  connectedEnvironment.id
                ] ?? [];
          })
        ),
      ];

      return connectedEnvironments;
    }
  ),
  getConnectedAppEnvironmentsForBlock = memoize(
    (
      graph: Graph.Graph,
      blockId: string,
      environmentId?: string,
      appId?: string
    ) => {
      const environmentsByEnvParentId = getEnvironmentsByEnvParentId(graph),
        blockEnvironments = environmentId
          ? [graph[environmentId] as Model.Environment]
          : environmentsByEnvParentId[blockId] || [],
        blockEnvironmentsByComposite = indexBy(
          environmentCompositeId,
          blockEnvironments
        );

      let connectedApps = getConnectedAppsForBlock(graph, blockId);
      if (appId) {
        connectedApps = connectedApps.filter(R.propEq("id", appId));
      }

      const connectedAppIds = connectedApps.map(R.prop("id"));
      return R.flatten(
        connectedAppIds.map((appId) =>
          (environmentsByEnvParentId[appId] || []).filter(
            (appEnvironment) =>
              blockEnvironmentsByComposite[
                environmentCompositeId(appEnvironment)
              ]
          )
        )
      );
    }
  );

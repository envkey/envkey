import { Graph, Model, Rbac } from "../../types";
import memoize from "../../lib/utils/memoize";
import {
  getAppBlocksByComposite,
  getEnvironmentsByEnvParentId,
} from "./indexed_graph";
import { graphTypes } from "./base";
import {
  getEnvironmentPermissions,
  getEnvParentPermissions,
  getOrgPermissions,
} from "./permissions";
import { getAppBlockGroupAssoc } from "./app_blocks";

export const getPermittedBlocksForUser = memoize(
  (graph: Graph.Graph, userId: string) => {
    const user = graph[userId] as Model.CliUser | Model.OrgUser;
    const currentOrgRole = graph[user.orgRoleId] as Rbac.OrgRole;
    const currentOrgPermissions = getOrgPermissions(graph, currentOrgRole.id);

    const { blocks } = graphTypes(graph);

    if (currentOrgPermissions.has("blocks_read_all")) {
      return blocks;
    }

    return blocks.filter(({ id: blockId }) => {
      const envParentPermissionsIntersection = getEnvParentPermissions(
        graph,
        blockId,
        userId
      );
      if (envParentPermissionsIntersection.size > 0) {
        return true;
      }

      const blockEnvironments =
        getEnvironmentsByEnvParentId(graph)[blockId] ?? [];

      for (let environment of blockEnvironments) {
        const permissions = getEnvironmentPermissions(
          graph,
          environment.id,
          userId
        );
        if (permissions.size > 0) {
          return true;
        }
      }

      return false;
    });
  }
);

export const getAppConnectionsByBlockId = memoize(
  (graph: Graph.Graph, userId: string): Record<string, Model.App[]> => {
    const user = graph[userId] as Model.CliUser | Model.OrgUser;
    const currentOrgRole = graph[user.orgRoleId] as Rbac.OrgRole;
    const currentOrgPermissions = getOrgPermissions(graph, currentOrgRole.id);

    const canReadAllOrgBlocks = currentOrgPermissions.has("blocks_read_all");
    if (canReadAllOrgBlocks) {
      return {};
    }

    let { apps, blocks } = graphTypes(graph);
    const appConnectionsByBlockId: Record<string, Model.App[]> = {};

    apps = apps.filter(
      (app) => getEnvParentPermissions(graph, app.id, userId).size > 0
    );

    for (let block of blocks) {
      for (let app of apps) {
        const appBlock =
          getAppBlocksByComposite(graph)[app.id + "|" + block.id];
        const appBlockAssoc = getAppBlockGroupAssoc(graph, app.id, block.id);

        if (appBlock || appBlockAssoc) {
          if (!appConnectionsByBlockId[block.id]) {
            appConnectionsByBlockId[block.id] = [];
          }
          appConnectionsByBlockId[block.id].push(graph[app.id] as Model.App);
        }
      }
    }

    return appConnectionsByBlockId;
  }
);

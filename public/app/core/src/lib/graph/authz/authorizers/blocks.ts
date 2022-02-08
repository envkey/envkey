import {
  hasOrgPermission,
  hasAllOrgPermissions,
  hasAllConnectedBlockPermissions,
  authorizeUser,
  hasAllAppPermissions,
  presence,
  hasAppPermission,
} from "./helpers";
import {
  getAppBlocksByComposite,
  getConnectedBlockEnvironmentsForApp,
  getEnvironmentPermissions,
  getAppBlocksByAppId,
  getEnvParentPermissions,
  graphTypes,
} from "../../.";
import { canReadAnyEnvParentVersions } from "..";
import { Graph, Model, Rbac } from "../../../../types";
import * as R from "ramda";

export const canCreateBlock = (graph: Graph.Graph, currentUserId: string) =>
    hasAllOrgPermissions(graph, currentUserId, ["blocks_create"]),
  canRenameBlock = (
    graph: Graph.Graph,
    currentUserId: string,
    blockId: string
  ) => {
    if (!presence(graph[blockId] as Model.Block, "block")) {
      return false;
    }

    return (
      hasAllOrgPermissions(graph, currentUserId, ["blocks_rename"]) ||
      hasAllConnectedBlockPermissions(graph, currentUserId, blockId, [
        "app_rename",
      ])
    );
  },
  canUpdateBlockSettings = (
    graph: Graph.Graph,
    currentUserId: string,
    blockId: string
  ) =>
    hasAllOrgPermissions(graph, currentUserId, ["blocks_manage_settings"]) &&
    Boolean(presence(graph[blockId] as Model.Block, "block")),
  canDeleteBlock = (
    graph: Graph.Graph,
    currentUserId: string,
    blockId: string
  ) =>
    hasAllOrgPermissions(graph, currentUserId, ["blocks_delete"]) &&
    Boolean(presence(graph[blockId] as Model.Block, "block")),
  canConnectBlock = (
    graph: Graph.Graph,
    currentUserId: string,
    appId: string,
    blockId: string
  ): boolean => {
    const currentUserRes = authorizeUser(graph, currentUserId);
    if (!currentUserRes) {
      return false;
    }
    const [, , currentOrgPermissions] = currentUserRes;

    const app = presence(graph[appId] as Model.App, "app");
    if (!app) {
      return false;
    }

    const block = presence(graph[blockId] as Model.Block, "block");
    if (!block) {
      return false;
    }

    const appBlockComposite = app.id + "|" + block.id,
      existingAppBlock = getAppBlocksByComposite(graph)[appBlockComposite];

    if (existingAppBlock) {
      return false;
    }

    if (
      !currentOrgPermissions.has("blocks_manage_connections_permitted") ||
      !hasAllAppPermissions(graph, currentUserId, appId, ["app_manage_blocks"])
    ) {
      return false;
    }

    // ensure user has write access to all overlapping block environments
    const blockEnvironments = getConnectedBlockEnvironmentsForApp(
      graph,
      app.id,
      block.id
    );

    return R.all(
      Boolean,
      blockEnvironments.map(({ id: environmentId }) =>
        getEnvironmentPermissions(graph, environmentId, currentUserId).has(
          "write"
        )
      )
    );
  },
  canDisconnectBlock = (
    graph: Graph.Graph,
    currentUserId: string,
    params: { appBlockId: string } | { appId: string; blockId: string }
  ): boolean => {
    const appBlockId =
      "appBlockId" in params
        ? params.appBlockId
        : getAppBlocksByComposite(graph)[params.appId + "|" + params.blockId]
            ?.id;

    if (!appBlockId) {
      return false;
    }

    const currentUserRes = authorizeUser(graph, currentUserId);
    if (!currentUserRes) {
      return false;
    }
    const [, , currentOrgPermissions] = currentUserRes;

    const existingAppBlock = presence(
      graph[appBlockId] as Model.AppBlock,
      "appBlock"
    );

    if (!existingAppBlock) {
      return false;
    }

    const { appId, blockId } = existingAppBlock;

    const app = presence(graph[appId] as Model.App, "app");
    if (!app) {
      return false;
    }

    const block = presence(graph[blockId] as Model.Block, "block");
    if (!block) {
      return false;
    }

    if (
      !currentOrgPermissions.has("blocks_manage_connections_permitted") ||
      !hasAllAppPermissions(graph, currentUserId, appId, ["app_manage_blocks"])
    ) {
      return false;
    }

    return true;
  },
  canReorderBlocks = (
    graph: Graph.Graph,
    currentUserId: string,
    appId: string,
    order?: Record<string, number>
  ) => {
    const currentUserRes = authorizeUser(graph, currentUserId);
    if (!currentUserRes) {
      return false;
    }
    const [, , currentOrgPermissions] = currentUserRes;

    const app = presence(graph[appId] as Model.App, "app");
    if (!app) {
      return false;
    }

    if (
      !currentOrgPermissions.has("blocks_manage_connections_permitted") ||
      !hasAllAppPermissions(graph, currentUserId, appId, ["app_manage_blocks"])
    ) {
      return false;
    }

    const blockIds = (getAppBlocksByAppId(graph)[app.id] ?? []).map(
      R.prop("blockId")
    );
    if (blockIds.length < 2) {
      return false;
    }

    if (
      order &&
      !R.equals(
        R.sortBy(R.identity, Object.keys(order)),
        R.sortBy(R.identity, blockIds)
      )
    ) {
      return false;
    }

    return true;
  },
  canListBlockCollaborators = (
    graph: Graph.Graph,
    currentUserId: string,
    blockId: string,
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
      getEnvParentPermissions(graph, blockId, currentUserId).has(
        appManagePermission
      )
    );
  },
  canReadBlockVersions = (
    graph: Graph.Graph,
    currentUserId: string,
    blockId: string
  ) =>
    hasOrgPermission(graph, currentUserId, "blocks_read_all") ||
    canReadAnyEnvParentVersions(graph, currentUserId, blockId);

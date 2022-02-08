import { Graph, Model, Rbac } from "../../../../types";
import { graphTypes } from "../../.";
import * as authz from "../authorizers";
import * as R from "ramda";
import memoize from "../../../utils/memoize";
import { getConnectedAppPermissionsUnionForBlock } from "../../permissions";
import { getAppConnectionsByBlockId } from "../../user_blocks";

export const getRenameableBlocks = memoize(
    (graph: Graph.Graph, currentUserId: string) =>
      graphTypes(graph).blocks.filter(({ id }) =>
        authz.canRenameBlock(graph, currentUserId, id)
      )
  ),
  getSettingsUpdatableBlocks = memoize(
    (graph: Graph.Graph, currentUserId: string) =>
      graphTypes(graph).blocks.filter(({ id }) =>
        authz.canUpdateBlockSettings(graph, currentUserId, id)
      )
  ),
  getDeletableBlocks = memoize((graph: Graph.Graph, currentUserId: string) =>
    graphTypes(graph).blocks.filter(({ id }) =>
      authz.canDeleteBlock(graph, currentUserId, id)
    )
  ),
  getConnectableBlocksForApp = memoize(
    (graph: Graph.Graph, currentUserId: string, appId: string) =>
      graphTypes(graph).blocks.filter(({ id }) =>
        authz.canConnectBlock(graph, currentUserId, appId, id)
      )
  ),
  getConnectableAppsForBlock = memoize(
    (graph: Graph.Graph, currentUserId: string, blockId: string) =>
      graphTypes(graph).apps.filter(({ id }) => {
        const res = authz.canConnectBlock(graph, currentUserId, id, blockId);
        return res;
      })
  ),
  getDisconnectableBlocksForApp = memoize(
    (graph: Graph.Graph, currentUserId: string, appId: string) =>
      graphTypes(graph).blocks.filter(({ id }) =>
        authz.canDisconnectBlock(graph, currentUserId, {
          blockId: id,
          appId,
        })
      )
  ),
  getDisconnectableAppsForBlock = memoize(
    (graph: Graph.Graph, currentUserId: string, blockId: string) =>
      graphTypes(graph).apps.filter(({ id }) =>
        authz.canDisconnectBlock(graph, currentUserId, {
          appId: id,
          blockId,
        })
      )
  ),
  getBlockCollaborators = memoize(
    <UserType extends "orgUser" | "cliUser">(
      graph: Graph.Graph,
      currentUserId: string,
      blockId: string,
      userType: UserType
    ) => {
      type GraphType = UserType extends "orgUser" ? "orgUsers" : "cliUsers";
      type User = UserType extends "orgUser" ? Model.OrgUser : Model.CliUser;

      if (
        !authz.canListBlockCollaborators(
          graph,
          currentUserId,
          blockId,
          userType
        )
      ) {
        return [];
      }
      const users = graphTypes(graph)[(userType + "s") as GraphType] as User[];

      let collaborators = users.filter((user) => {
        return (
          authz.hasOrgPermission(graph, user.id, "blocks_read_all") ||
          getConnectedAppPermissionsUnionForBlock(graph, blockId, user.id)
            .size > 0
        );
      });

      collaborators = R.sortBy((user) => {
        if (authz.hasOrgPermission(graph, user.id, "blocks_read_all")) {
          const orgRole = graph[user.orgRoleId] as Rbac.OrgRole;
          return orgRole.orderIndex;
        }

        return user.type == "cliUser" ? user.name : user.lastName;
      }, collaborators);

      return collaborators;
    }
  ),
  getLocalsReadableBlockCollaborators = memoize(
    <UserType extends "orgUser" | "cliUser">(
      graph: Graph.Graph,
      currentUserId: string,
      blockId: string,
      userType: UserType
    ) =>
      R.sortBy(
        (user) =>
          user.type == "cliUser"
            ? user.name
            : `${user.lastName} ${user.firstName}`,
        getBlockCollaborators(graph, currentUserId, blockId, userType).filter(
          (user) => authz.canReadLocals(graph, currentUserId, blockId, user.id)
        )
      )
  );

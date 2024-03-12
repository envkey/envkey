import { getInviteStatus } from "./../../invites";
import { Graph, Model, Rbac } from "../../../../types";
import {
  graphTypes,
  getAppRoleForUserOrInvitee,
  getAppUserGroupsByAppId,
  getGroupMembershipsByObjectId,
  getAppGroupUserGroupsByAppGroupId,
} from "../../.";
import {
  hasAllAppPermissions,
  hasAnyAppPermissions,
} from "../authorizers/helpers";
import * as authz from "../authorizers";
import * as R from "ramda";
import memoize from "../../../utils/memoize";

export const getAppsWithAllPermissions = memoize(
    (
      graph: Graph.Graph,
      currentUserId: string,
      appPermissions: Rbac.AppPermission[]
    ) =>
      graphTypes(graph).apps.filter(({ id }) =>
        hasAllAppPermissions(graph, currentUserId, id, appPermissions)
      )
  ),
  getAppsWithAnyPermissions = memoize(
    (
      graph: Graph.Graph,
      currentUserId: string,
      appPermissions: Rbac.AppPermission[]
    ) =>
      graphTypes(graph).apps.filter(({ id }) =>
        hasAnyAppPermissions(graph, currentUserId, id, appPermissions)
      )
  ),
  getRenameableApps = memoize((graph: Graph.Graph, currentUserId: string) =>
    graphTypes(graph).apps.filter(({ id }) =>
      authz.canRenameApp(graph, currentUserId, id)
    )
  ),
  getSettingsUpdatableApps = memoize(
    (graph: Graph.Graph, currentUserId: string) =>
      graphTypes(graph).apps.filter(({ id }) =>
        authz.canUpdateAppSettings(graph, currentUserId, id)
      )
  ),
  getDeletableApps = memoize((graph: Graph.Graph, currentUserId: string) =>
    graphTypes(graph).apps.filter(({ id }) =>
      authz.canDeleteApp(graph, currentUserId, id)
    )
  ),
  getAccessGrantableApps = memoize(
    (graph: Graph.Graph, currentUserId: string) =>
      getAppsWithAnyPermissions(graph, currentUserId, [
        "app_manage_users",
        "app_manage_cli_users",
      ])
  ),
  getAccessGrantableUsersForApp = memoize(
    (
      graph: Graph.Graph,
      currentUserId: string,
      appId: string
    ): (Model.OrgUser | Model.CliUser)[] => {
      const { orgUsers, cliUsers } = graphTypes(graph);
      return [...orgUsers, ...cliUsers].filter(
        ({ id: userId }) =>
          getAccessGrantableAppRolesForUser(graph, currentUserId, appId, userId)
            .length > 0
      );
    }
  ),
  getAccessGrantableUserGroupsForApp = memoize(
    (graph: Graph.Graph, currentUserId: string, appId: string) => {
      const { groups } = graphTypes(graph);
      return groups.filter(
        ({ objectType, id }) =>
          objectType == "orgUser" &&
          getAccessGrantableAppRolesForUserGroup(
            graph,
            currentUserId,
            appId,
            id
          ).length > 0
      );
    }
  ),
  getAccessGrantableOrgUsersForApp = memoize(
    (graph: Graph.Graph, currentUserId: string, appId: string, now: number) =>
      getAccessGrantableUsersForApp(graph, currentUserId, appId).filter(
        (user) =>
          user.type == "orgUser" &&
          !["expired", "failed"].includes(getInviteStatus(graph, user.id, now))
      ) as Model.OrgUser[]
  ),
  getAccessGrantableCliUsersForApp = memoize(
    (graph: Graph.Graph, currentUserId: string, appId: string) =>
      getAccessGrantableUsersForApp(graph, currentUserId, appId).filter(
        R.propEq("type", "cliUser")
      ) as Model.CliUser[]
  ),
  getAccessGrantableAppRolesForUser = memoize(
    (
      graph: Graph.Graph,
      currentUserId: string,
      appId: string,
      userId: string
    ) =>
      graphTypes(graph).appRoles.filter(({ id: appRoleId }) =>
        authz.canGrantAppRoleToUser(graph, currentUserId, {
          appId,
          userId,
          appRoleId,
        })
      )
  ),
  getAccessGrantableAppRolesForUserGroup = memoize(
    (
      graph: Graph.Graph,
      currentUserId: string,
      appId: string,
      userGroupId: string
    ) =>
      graphTypes(graph).appRoles.filter(({ id: appRoleId }) =>
        authz.canGrantAppRoleToUserGroup(graph, currentUserId, {
          appId,
          userGroupId,
          appRoleId,
        })
      )
  ),
  getAccessGrantableAppsForUserGroup = memoize(
    (graph: Graph.Graph, currentUserId: string, userGroupId: string) =>
      graphTypes(graph).apps.filter(
        ({ id: appId }) =>
          getAccessGrantableAppRolesForUserGroup(
            graph,
            currentUserId,
            appId,
            userGroupId
          ).length > 0
      )
  ),
  getAccessGrantableAppRolesForOrgRole = memoize(
    (
      graph: Graph.Graph,
      currentUserId: string,
      appId: string,
      orgRoleId: string
    ) =>
      graphTypes(graph).appRoles.filter(({ id: appRoleId }) =>
        authz.canGrantAppRoleToOrgRole(graph, currentUserId, {
          appId,
          orgRoleId,
          appRoleId,
        })
      )
  ),
  getAccessGrantableAppRoles = memoize(
    (graph: Graph.Graph, currentUserId: string, appId: string) =>
      R.uniqBy(
        R.prop("id"),
        graphTypes(graph).orgRoles.flatMap(({ id: orgRoleId }) =>
          getAccessGrantableAppRolesForOrgRole(
            graph,
            currentUserId,
            appId,
            orgRoleId
          )
        )
      )
  ),
  getAccessRemoveableApps = memoize(
    (graph: Graph.Graph, currentUserId: string) =>
      graphTypes(graph).apps.filter(({ id }) =>
        authz.canRemoveAppAccess(graph, currentUserId, id)
      )
  ),
  getAccessRemoveableUsersForApp = memoize(
    (
      graph: Graph.Graph,
      currentUserId: string,
      appId: string
    ): (Model.OrgUser | Model.CliUser)[] => {
      const { orgUsers, cliUsers } = graphTypes(graph);
      return [...orgUsers, ...cliUsers].filter(({ id: userId }) =>
        authz.canRemoveAppUserAccess(graph, currentUserId, {
          appId,
          userId,
        })
      );
    }
  ),
  getAccessRemoveableUserGroupsForApp = memoize(
    (graph: Graph.Graph, currentUserId: string, appId: string) =>
      graphTypes(graph).groups.filter(
        ({ objectType, id }) =>
          objectType == "orgUser" &&
          authz.canRemoveAppUserGroupAccess(graph, currentUserId, {
            appId,
            userGroupId: id,
          })
      )
  ),
  getAppCollaborators = memoize(
    <UserType extends "orgUser" | "cliUser">(
      graph: Graph.Graph,
      currentUserId: string,
      appId: string,
      userType: UserType
    ) => {
      type GraphType = UserType extends "orgUser" ? "orgUsers" : "cliUsers";
      type User = UserType extends "orgUser" ? Model.OrgUser : Model.CliUser;

      if (
        !authz.canListAppCollaborators(graph, currentUserId, appId, userType)
      ) {
        return [];
      }

      const users = graphTypes(graph)[(userType + "s") as GraphType] as User[];

      let collaborators = users.filter((user) =>
        Boolean(getAppRoleForUserOrInvitee(graph, appId, user.id))
      );

      return collaborators;
    }
  ),
  getLocalsReadableAppCollaborators = memoize(
    <UserType extends "orgUser" | "cliUser">(
      graph: Graph.Graph,
      currentUserId: string,
      appId: string,
      userType: UserType
    ) =>
      R.sortBy(
        (user) =>
          user.type == "cliUser"
            ? user.name
            : `${user.lastName} ${user.firstName}`,

        getAppCollaborators(graph, currentUserId, appId, userType).filter(
          (user) => authz.canReadLocals(graph, currentUserId, appId, user.id)
        )
      )
  ),
  getAppConnectedUserGroups = memoize(
    (graph: Graph.Graph, currentUserId: string, appId: string) => {
      if (
        !authz.canListAppCollaborators(graph, currentUserId, appId, "orgUser")
      ) {
        return [];
      }

      // user groups connected directly to app
      const directlyConnected = (
        getAppUserGroupsByAppId(graph)[appId] ?? []
      ).map(({ userGroupId }) => graph[userGroupId] as Model.Group);
      const directlyConnectedIds = new Set(directlyConnected.map(R.prop("id")));

      // groups this app belongs to
      const appGroupIds = (
        getGroupMembershipsByObjectId(graph)[appId] ?? []
      ).map(R.prop("groupId"));

      const indirectlyConnected = appGroupIds
        .flatMap((appGroupId) =>
          (getAppGroupUserGroupsByAppGroupId(graph)[appGroupId] ?? []).map(
            ({ userGroupId }) => graph[userGroupId] as Model.Group
          )
        )
        // filter out those already in direct connections, since those take precedence
        .filter(({ id }) => !directlyConnectedIds.has(id));

      return indirectlyConnected.concat(directlyConnected);
    }
  );

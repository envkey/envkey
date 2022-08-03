import { Graph, Rbac, Model } from "../../types";
import * as R from "ramda";
import memoize from "../../lib/utils/memoize";
import { getConnectedAppsForBlock } from "./app_blocks";
import {
  getEnvironmentsByEnvParentId,
  getAppRoleEnvironmentRolesByComposite,
  getAppUserGrantsByComposite,
  getAppUserGroupsByComposite,
  getGroupMembershipsByObjectId,
  getAppGroupUserGroupsByComposite,
} from "./indexed_graph";
import { graphTypes } from "./base";
import { getAppUserGroupAssoc } from "./app_users";

const allEnvironmentReadPermissions = Object.keys(
    Rbac.environmentReadPermissions
  ) as Rbac.EnvironmentReadPermission[],
  allEnvironmentWritePermissions = Object.keys(
    Rbac.environmentWritePermissions
  ) as Rbac.EnvironmentWritePermission[],
  allEnvironmentPermissions = Object.keys(
    Rbac.environmentPermissions
  ) as Rbac.EnvironmentPermission[];

export const getOrgPermissions = memoize(
    (graph: Graph.Graph, orgRoleId: string): Set<Rbac.OrgPermission> => {
      const orgRole = graph[orgRoleId];
      if (!orgRole || orgRole.type != "orgRole") {
        return new Set();
      }

      if (orgRole.isDefault) {
        return new Set(
          Rbac.ORG_PERMISSIONS_BY_DEFAULT_ROLE[orgRole.defaultName]
        );
      } else if (orgRole.extendsRoleId) {
        return new Set(
          R.union(
            orgRole.addPermissions,
            R.difference(
              Array.from(getOrgPermissions(graph, orgRole.extendsRoleId)),
              orgRole.removePermissions
            )
          )
        );
      } else if (orgRole.extendsRoleId === undefined) {
        return new Set(orgRole.permissions);
      }

      return new Set();
    }
  ),
  getAppPermissions = memoize(
    (graph: Graph.Graph, appRoleId: string): Set<Rbac.AppPermission> => {
      const appRole = graph[appRoleId];
      if (!appRole || appRole.type != "appRole") {
        return new Set();
      }

      if (appRole.isDefault) {
        return new Set(
          Rbac.APP_PERMISSIONS_BY_DEFAULT_ROLE[appRole.defaultName]
        );
      } else if (appRole.extendsRoleId) {
        return new Set(
          R.union(
            appRole.addPermissions,
            R.difference(
              Array.from(getAppPermissions(graph, appRole.extendsRoleId)),
              appRole.removePermissions
            )
          )
        );
      } else if (appRole.extendsRoleId === undefined) {
        return new Set(appRole.permissions);
      }

      return new Set();
    }
  ),
  getEnvironmentPermissions = memoize(
    (
      graph: Graph.Graph,
      environmentId: string,
      userId?: string,
      accessParams?: Model.AccessParams
    ): Set<Rbac.EnvironmentPermission> => {
      // const start = process.hrtime.bigint(),
      //   elapsedNs = (msg: string) =>
      //     console.log(
      //       "environment permissions",
      //       msg,
      //       "-",
      //       process.hrtime.bigint() - start,
      //       "ns elapsed"
      //     );

      const environment = graph[environmentId] as Model.Environment;

      if (!environment) {
        return new Set();
      }

      let orgRoleId: string,
        permissions: Rbac.EnvironmentPermission[] = [];
      if (userId) {
        const user = graph[userId] as Model.OrgUser | Model.CliUser;
        orgRoleId = user.orgRoleId;
      } else {
        orgRoleId = accessParams!.orgRoleId;
      }

      const envParent = graph[environment.envParentId] as Model.EnvParent,
        orgPermissions = getOrgPermissions(graph, orgRoleId);

      if (envParent.type == "app") {
        const appRole = getAppRoleForUserOrInvitee(
          graph,
          envParent.id,
          userId,
          accessParams
        );

        if (!appRole) {
          return new Set();
        }

        permissions = getAppRoleEnvironmentRolePermissions(
          graph,
          appRole.id,
          environment.environmentRoleId
        );

        // elapsedNs("got app environment permissions");
      } else if (envParent.type == "block") {
        if (orgPermissions.has("blocks_write_envs_all")) {
          permissions = allEnvironmentPermissions;
        } else {
          if (orgPermissions.has("blocks_read_all")) {
            permissions = allEnvironmentReadPermissions;
          } else if (orgPermissions.has("blocks_write_envs_permitted")) {
            const connectedApps = getConnectedAppsForBlock(graph, envParent.id);

            if (connectedApps.length > 0) {
              const environmentsByEnvParentId =
                getEnvironmentsByEnvParentId(graph);

              permissions = permissions.concat(
                connectedApps.reduce<Rbac.EnvironmentPermission[]>(
                  (agg, app) => {
                    const matchEnvironment = R.find(
                      ({ environmentRoleId, isSub }) =>
                        !isSub &&
                        environmentRoleId == environment.environmentRoleId,
                      environmentsByEnvParentId[app.id] ?? []
                    );

                    if (!matchEnvironment) {
                      return agg;
                    }

                    const appPermissions = Array.from(
                      getEnvironmentPermissions(
                        graph,
                        matchEnvironment.id,
                        userId,
                        accessParams
                      )
                    );

                    const res = [
                      ...R.intersection(
                        R.intersection(agg, allEnvironmentWritePermissions),
                        R.intersection(
                          appPermissions,
                          allEnvironmentWritePermissions
                        )
                      ),
                      ...R.union(
                        R.intersection(agg, allEnvironmentReadPermissions),
                        R.intersection(
                          appPermissions,
                          allEnvironmentReadPermissions
                        )
                      ),
                    ] as Rbac.EnvironmentPermission[];

                    return res;
                  },
                  /* R.intersection will filter out any write permissions not granted on all connected app environments
                  (read permissions use union - i.e. if you can read *any* connected app environment, you can read
                  block environment) */
                  allEnvironmentWritePermissions
                )
              );
            }
          }
        }

        // elapsedNs("got block environment permissions");
      }

      // for sub-environments filter out permissions granted by the role if
      // corresponding _subenvs scoped permission is missing
      const permissionSet = new Set(permissions);
      if (environment.isSub) {
        if (
          permissionSet.has("write") &&
          !permissionSet.has("write_branches")
        ) {
          permissionSet.delete("write");
        }

        if (permissionSet.has("read") && !permissionSet.has("read_branches")) {
          permissionSet.delete("read");
        }

        if (
          permissionSet.has("read_meta") &&
          !permissionSet.has("read_branches_meta")
        ) {
          permissionSet.delete("read_meta");
        }

        if (
          permissionSet.has("read_inherits") &&
          !permissionSet.has("read_branches_inherits")
        ) {
          permissionSet.delete("read_inherits");
        }

        if (
          permissionSet.has("read_history") &&
          !permissionSet.has("read_branches_history")
        ) {
          permissionSet.delete("read_history");
        }
      }

      const res = new Set<Rbac.EnvironmentPermission>();

      // map subenv-specific permissions to generic environment permissions
      for (let permission of permissionSet) {
        let v: Rbac.EnvironmentPermission | undefined;
        if (environment.isSub) {
          if (permission == "read_branches") v = "read";
          if (permission == "read_branches_history") v = "read_history";
          if (permission == "write_branches") v = "write";
          if (permission == "read_branches_inherits") v = "read_inherits";
          if (permission == "read_branches_meta") v = "read_meta";
        }
        if (!v) {
          v = permission;
        }
        res.add(v);
      }

      // elapsedNs("got res");

      return res;
    }
  ),
  getAppRoleEnvironmentRolePermissions = (
    graph: Graph.Graph,
    appRoleId: string,
    environmentRoleId: string
  ): Rbac.EnvironmentPermission[] => {
    const appRole = graph[appRoleId],
      environmentRole = graph[environmentRoleId];

    if (
      !appRole ||
      appRole.type != "appRole" ||
      !environmentRole ||
      environmentRole.type != "environmentRole"
    ) {
      return [];
    }

    if (appRole.hasFullEnvironmentPermissions) {
      return Rbac.ENVIRONMENT_FULL_PERMISSIONS;
    }

    if (appRole.isDefault && environmentRole.isDefault) {
      return Rbac.ENVIRONMENT_PERMISSIONS_BY_DEFAULT_ROLE[appRole.defaultName][
        environmentRole.defaultName
      ];
    } else {
      const appRoleEnvironmentRole =
        getAppRoleEnvironmentRolesByComposite(graph)[
          appRoleId + "|" + environmentRoleId
        ];

      return [...appRoleEnvironmentRole.permissions, "read_inherits"];
    }
  },
  getUserAppRolesByAppId = (graph: Graph.Graph, userId: string) =>
    graphTypes(graph)
      .apps.map(({ id: appId }) => {
        const appRole = getAppRoleForUserOrInvitee(graph, appId, userId);
        return appRole ? { [appId]: appRole! } : undefined;
      })
      .filter(Boolean)
      .reduce<{ [appId: string]: Rbac.AppRole }>(R.merge, {}),
  getAppRoleForUserOrInvitee = memoize(
    (
      graph: Graph.Graph,
      appId: string,
      userId?: string,
      accessParams?: Model.AccessParams
    ) => {
      let orgRoleId: string;
      if (userId) {
        const user = graph[userId] as Model.OrgUser | Model.CliUser | undefined;
        if (!user) {
          return undefined;
        }
        ({ orgRoleId } = user);
      } else {
        orgRoleId = accessParams!.orgRoleId;
      }

      const orgRole = graph[orgRoleId] as Rbac.OrgRole;

      let appRoleId: string | undefined;
      if (orgRole.autoAppRoleId) {
        appRoleId = orgRole.autoAppRoleId;
      } else if (userId) {
        const appUserGrant =
          getAppUserGrantsByComposite(graph)[userId + "|" + appId];
        if (appUserGrant && !appUserGrant.deletedAt) {
          appRoleId = appUserGrant.appRoleId;
        } else {
          const appUserGroupAssoc = getAppUserGroupAssoc(graph, appId, userId);

          if (appUserGroupAssoc && !appUserGroupAssoc.deletedAt) {
            appRoleId = appUserGroupAssoc.appRoleId;
          }
        }
      } else if (accessParams && accessParams.appUserGrants) {
        const inviteAppUserGrant = R.find(
          R.propEq("appId", appId),
          accessParams.appUserGrants
        );
        if (inviteAppUserGrant) {
          appRoleId = inviteAppUserGrant.appRoleId;
        }
      } else if (accessParams && accessParams.userGroupIds) {
        for (let userGroupId of accessParams.userGroupIds) {
          let currentAppRole: Rbac.AppRole | undefined;

          const appUserGroup =
            getAppUserGroupsByComposite(graph)[appId + "|" + userGroupId];
          if (appUserGroup) {
            const appRole = graph[appUserGroup.appRoleId] as Rbac.AppRole;

            if (
              !currentAppRole ||
              appRole.orderIndex < currentAppRole.orderIndex
            ) {
              currentAppRole = appRole;
              appRoleId = appUserGroup.appRoleId;
            }
          }
        }
      }

      if (!appRoleId) {
        return undefined;
      }

      return graph[appRoleId] as Rbac.AppRole;
    }
  ),
  getAppRoleForUserGroup = memoize(
    (graph: Graph.Graph, appId: string, userGroupId: string) => {
      const appUserGroup =
        getAppUserGroupsByComposite(graph)[appId + "|" + userGroupId];

      if (appUserGroup) {
        return graph[appUserGroup.appRoleId] as Rbac.AppRole;
      }

      // groups this app belongs to
      const appGroupIds = (
        getGroupMembershipsByObjectId(graph)[appId] ?? []
      ).map(R.prop("groupId"));

      const appGroupUserGroupsByComposite =
        getAppGroupUserGroupsByComposite(graph);
      for (let appGroupId of appGroupIds) {
        const appGroupUserGroup =
          appGroupUserGroupsByComposite[appGroupId + "|" + userGroupId];
        if (appGroupUserGroup) {
          return graph[appGroupUserGroup.appRoleId] as Rbac.AppRole;
        }
      }
      return undefined;
    }
  ),
  getConnectedAppPermissionsIntersectionForBlock = memoize(
    (
      graph: Graph.Graph,
      blockId: string,
      userId?: string,
      accessParams?: Model.AccessParams
    ) => {
      const connectedApps = getConnectedAppsForBlock(graph, blockId);

      let intersection: Rbac.AppPermission[] | undefined;

      for (let { id: appId } of connectedApps) {
        const appRole = getAppRoleForUserOrInvitee(
            graph,
            appId,
            userId,
            accessParams
          ),
          permissions = appRole
            ? Array.from(getAppPermissions(graph, appRole.id))
            : [];

        if (intersection) {
          intersection = R.intersection(intersection, permissions);
        } else {
          intersection = permissions;
        }
      }

      return new Set(intersection);
    }
  ),
  getConnectedAppPermissionsUnionForBlock = memoize(
    (
      graph: Graph.Graph,
      blockId: string,
      userId?: string,
      accessParams?: Model.AccessParams
    ) => {
      const connectedApps = getConnectedAppsForBlock(graph, blockId);

      let union: Rbac.AppPermission[] = [];

      for (let { id: appId } of connectedApps) {
        const appRole = getAppRoleForUserOrInvitee(
          graph,
          appId,
          userId,
          accessParams
        );

        if (appRole) {
          union = union.concat(
            Array.from(getAppPermissions(graph, appRole.id))
          );
        }
      }

      return new Set(union);
    }
  ),
  getEnvParentPermissions = memoize(
    (
      graph: Graph.Graph,
      envParentId: string,
      userId?: string,
      accessParams?: Model.AccessParams
    ): Set<Rbac.AppPermission> => {
      const envParent = graph[envParentId] as Model.EnvParent | undefined;

      if (!envParent) {
        return new Set();
      }

      if (envParent.type == "app") {
        let appRole: Rbac.AppRole | undefined;

        appRole = getAppRoleForUserOrInvitee(
          graph,
          envParentId,
          userId,
          accessParams
        );

        return appRole ? getAppPermissions(graph, appRole.id) : new Set();
      } else {
        return getConnectedAppPermissionsIntersectionForBlock(
          graph,
          envParentId,
          userId,
          accessParams
        );
      }
    }
  );

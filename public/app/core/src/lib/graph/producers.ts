import { v4 as uuid } from "uuid";
import produce, { Draft } from "immer";
import { Graph, Api, Model, Rbac } from "../../types";
import {
  graphTypes,
  getOrphanedLocalKeyIds,
  getOrphanedRecoveryKeyIds,
  getAppRoleEnvironmentRolesByComposite,
  getIncludedAppRolesByComposite,
  getLocalKeysByEnvironmentId,
  getEnvironmentsByRoleId,
  getServersByEnvironmentId,
  getDeleteAppAssociations,
  getDeleteGroupAssociations,
  getDeleteBlockAssociations,
  getDeleteEnvironmentAssociations,
  getDeleteKeyableParentAssociations,
  getEnvironmentsByEnvParentId,
  getNumActiveOrInvitedUsers,
} from ".";
import * as R from "ramda";
import { pickDefined } from "../utils/object";
import { indexBy, groupBy } from "../utils/array";
import { log } from "../utils/logger";
import { getOrg } from "./base";

export const getDeleteAppProducer =
    <T extends Graph.Graph = Graph.Graph>(
      id: string,
      now: number
    ): Graph.Producer<T> =>
    (graphDraft) => {
      getDeleteGraphObjectsProducer(
        [id, ...getDeleteAppAssociations(graphDraft, id).map(R.prop("id"))],
        now
      )(graphDraft);
    },
  getDeleteBlockProducer =
    <T extends Graph.Graph = Graph.Graph>(
      id: string,
      now: number
    ): Graph.Producer<T> =>
    (graphDraft) => {
      getDeleteGraphObjectsProducer(
        [id, ...getDeleteBlockAssociations(graphDraft, id).map(R.prop("id"))],
        now
      )(graphDraft);
    },
  getDeleteGroupProducer =
    <T extends Graph.Graph>(id: string, now: number): Graph.Producer<T> =>
    (graphDraft) => {
      getDeleteGraphObjectsProducer(
        [id, ...getDeleteGroupAssociations(graphDraft, id).map(R.prop("id"))],
        now
      )(graphDraft);
    },
  getDeleteEnvironmentProducer =
    <T extends Graph.Graph>(id: string, now: number): Graph.Producer<T> =>
    (graphDraft) => {
      getDeleteGraphObjectsProducer(
        [
          id,
          ...getDeleteEnvironmentAssociations(graphDraft, id).map(R.prop("id")),
        ],
        now
      )(graphDraft);
    },
  getDeleteKeyableParentProducer =
    <T extends Graph.Graph>(id: string, now: number): Graph.Producer<T> =>
    (graphDraft) => {
      getDeleteGraphObjectsProducer(
        [
          id,
          ...getDeleteKeyableParentAssociations(graphDraft, id).map(
            R.prop("id")
          ),
        ],
        now
      )(graphDraft);
    },
  getDeleteGraphObjectsProducer =
    <T extends Graph.Graph>(ids: string[], now: number) =>
    (graphDraft: Draft<T>) => {
      let deletedServerEnvkeys = 0;

      for (let id of ids) {
        const obj = graphDraft[id];

        if (
          obj.type == "generatedEnvkey" &&
          obj.keyableParentType == "server"
        ) {
          deletedServerEnvkeys++;
        }

        graphDraft[id].deletedAt = now;
      }

      if (deletedServerEnvkeys > 0) {
        const org = getOrg(graphDraft) as Draft<Model.Org>;
        org.serverEnvkeyCount -= deletedServerEnvkeys;
        org.updatedAt = now;
      }
    },
  deleteGraphObjects = <T extends Graph.Graph>(
    graph: T,
    ids: string[],
    now: number
  ) => produce(graph, getDeleteGraphObjectsProducer<T>(ids, now)),
  getDeleteExpiredAuthObjectsProducer =
    <T extends Graph.Graph>(graph: T, now: number) =>
    (graphDraft: Draft<T>) => {
      // for invites and deviceGrants, we want to keep only the latest expired object per user, and delete any older ones
      const expiredFilterFn = ({
        acceptedAt,
        expiresAt,
        deletedAt,
      }: Model.Invite | Model.DeviceGrant) =>
        !acceptedAt && !deletedAt && now >= expiresAt;

      const byType = graphTypes(graph),
        authObjects: {
          [userId: string]: (Model.DeviceGrant | Model.Invite)[];
        }[] = [
          groupBy(R.prop("inviteeId"), byType.invites.filter(expiredFilterFn)),
          groupBy(
            R.prop("granteeId"),
            byType.deviceGrants.filter(expiredFilterFn)
          ),
        ],
        toDeleteIds = R.flatten(
          authObjects.map((objectsByUserId) =>
            R.flatten(
              Object.values<string>(
                R.map(
                  (objects) =>
                    R.tail(
                      R.sortBy(({ expiresAt }) => -expiresAt, objects)
                    ).map(R.prop("id")),
                  objectsByUserId
                )
              )
            )
          )
        );

      getDeleteGraphObjectsProducer(toDeleteIds, now)(graphDraft);

      if (toDeleteIds.length > 0) {
        const org = getOrg(graphDraft) as Draft<Model.Org>;
        org.activeUserOrInviteCount = getNumActiveOrInvitedUsers(
          graphDraft,
          now
        );
        org.updatedAt = now;
      }
    },
  deleteExpiredAuthObjects = <T extends Graph.Graph>(graph: T, now: number) =>
    produce(graph, getDeleteExpiredAuthObjectsProducer<T>(graph, now)),
  getUpdateOrgRoleProducer =
    <T extends Graph.Graph>(
      params: Omit<
        Api.Net.ApiParamTypes["RbacUpdateOrgRole"],
        keyof Api.Net.EnvParams
      >,
      now: number
    ): Graph.Producer<Draft<T>> =>
    (graphDraft) => {
      const orgRole = graphDraft[params.id] as Rbac.OrgRole;

      let toUpdate = params as Partial<Rbac.OrgRole>;
      if (orgRole.isDefault) {
        toUpdate = pickDefined(["name", "description"], toUpdate);
      }

      (graphDraft as Draft<Graph.Graph>)[orgRole.id] = {
        ...orgRole,
        ...toUpdate,
        updatedAt: now,
      } as Rbac.OrgRole;

      if (params.canBeManagedByOrgRoleIds) {
        for (let managingOrgRoleId of params.canBeManagedByOrgRoleIds) {
          const managingOrgRoleDraft = graphDraft[
            managingOrgRoleId
          ] as Rbac.OrgRole;
          if (
            !managingOrgRoleDraft.canManageAllOrgRoles &&
            !managingOrgRoleDraft.canManageOrgRoleIds.includes(orgRole.id)
          ) {
            managingOrgRoleDraft.canManageOrgRoleIds.push(orgRole.id);
            managingOrgRoleDraft.updatedAt = now;
          }
        }
      }

      if (params.canBeInvitedByOrgRoleIds) {
        for (let invitingOrgRoleId of params.canBeInvitedByOrgRoleIds) {
          const invitingOrgRoleDraft = graphDraft[
            invitingOrgRoleId
          ] as Rbac.OrgRole;
          if (
            !invitingOrgRoleDraft.canInviteAllOrgRoles &&
            !invitingOrgRoleDraft.canInviteOrgRoleIds.includes(orgRole.id)
          ) {
            invitingOrgRoleDraft.canInviteOrgRoleIds.push(orgRole.id);
            invitingOrgRoleDraft.updatedAt = now;
          }
        }
      }

      const orphanedLocalKeyIds = getOrphanedLocalKeyIds(graphDraft);
      if (orphanedLocalKeyIds.length > 0) {
        getDeleteGraphObjectsProducer(orphanedLocalKeyIds, now)(graphDraft);
      }

      const orphanedRecoveryKeyIds = getOrphanedRecoveryKeyIds(graphDraft);
      if (orphanedRecoveryKeyIds.length > 0) {
        getDeleteGraphObjectsProducer(orphanedRecoveryKeyIds, now)(graphDraft);
      }
    },
  getUpdateAppRoleProducer =
    <T extends Graph.Graph>(
      params: Omit<
        Api.Net.ApiParamTypes["RbacUpdateAppRole"],
        keyof Api.Net.EnvParams
      >,
      now: number
    ): Graph.Producer<T> =>
    (graphDraft) => {
      const appRole = graphDraft[params.id] as Rbac.AppRole,
        keys = (
          appRole.isDefault
            ? ["name", "description"]
            : [
                "name",
                "description",
                "defaultAllApps",
                "canInviteAllAppRoles",
                "canManageAppRoleIds",
                "canInviteAppRoleIds",
                "hasFullEnvironmentPermissions",
                "permissions",
                "extendsRoleId",
                "addPermissions",
                "removePermissions",
              ]
        ).filter((k) => k in params) as (keyof typeof params)[];

      (graphDraft as Draft<Graph.Graph>)[appRole.id] = {
        ...appRole,
        ...pickDefined(keys, params),
        updatedAt: now,
      } as Rbac.AppRole;

      if (!appRole.isDefault && params.canBeManagedByAppRoleIds) {
        for (let managingAppRoleId of params.canBeManagedByAppRoleIds) {
          const managingAppRoleDraft = graphDraft[
            managingAppRoleId
          ] as Rbac.AppRole;
          if (!managingAppRoleDraft.canManageAppRoleIds.includes(appRole.id)) {
            managingAppRoleDraft.canManageAppRoleIds.push(appRole.id);
            managingAppRoleDraft.updatedAt = now;
          }
        }
      }

      if (!appRole.isDefault && params.canBeInvitedByAppRoleIds) {
        for (let invitingAppRoleId of params.canBeInvitedByAppRoleIds) {
          const invitingAppRoleDraft = graphDraft[
            invitingAppRoleId
          ] as Rbac.AppRole;
          if (!invitingAppRoleDraft.canInviteAppRoleIds.includes(appRole.id)) {
            invitingAppRoleDraft.canInviteAppRoleIds.push(appRole.id);
            invitingAppRoleDraft.updatedAt = now;
          }
        }
      }

      if (params.appRoleEnvironmentRoles) {
        for (let environmentRoleId in params.appRoleEnvironmentRoles) {
          const appRoleEnvironmentRole = getAppRoleEnvironmentRolesByComposite(
              graphDraft
            )[
              [appRole.id, environmentRoleId].join("|")
            ] as Rbac.AppRoleEnvironmentRole,
            updatedPermissions =
              params.appRoleEnvironmentRoles[environmentRoleId];

          if (
            !R.equals(
              R.clone(appRoleEnvironmentRole.permissions).sort(),
              R.clone(updatedPermissions).sort()
            )
          ) {
            (graphDraft as Draft<Graph.Graph>)[appRoleEnvironmentRole.id] = {
              ...appRoleEnvironmentRole,
              permissions: updatedPermissions,
              updatedAt: now,
            };
          }
        }
      }

      if (
        !appRole.isDefault &&
        !appRole.defaultAllApps &&
        "defaultAllApps" in params &&
        params.defaultAllApps
      ) {
        // add included app roles
        const apps = graphTypes(graphDraft).apps;

        for (let app of apps) {
          const existing =
            getIncludedAppRolesByComposite(graphDraft)[
              [appRole.id, app.id].join("|")
            ];

          if (!existing) {
            const id = uuid(),
              includedAppRole: Model.IncludedAppRole = {
                type: "includedAppRole",
                id,
                appRoleId: appRole.id,
                appId: app.id,
                createdAt: now,
                updatedAt: now,
              };
            (graphDraft as Draft<Graph.Graph>)[includedAppRole.id] =
              includedAppRole;
          }
        }
      }

      if (!appRole.isDefault) {
        const orphanedLocalKeyIds = getOrphanedLocalKeyIds(graphDraft);

        if (orphanedLocalKeyIds) {
          getDeleteGraphObjectsProducer(orphanedLocalKeyIds, now)(graphDraft);
        }
      }
    },
  getUpdateEnvironmentRoleProducer =
    <T extends Graph.Graph>(
      params: Omit<
        Api.Net.ApiParamTypes["RbacUpdateEnvironmentRole"],
        keyof Api.Net.EnvParams
      >,
      now: number
    ): Graph.Producer<T> =>
    (graphDraft) => {
      const environmentRole = graphDraft[params.id] as Rbac.EnvironmentRole,
        keys = [
          "name",
          "description",
          "hasLocalKeys",
          "hasServers",
          "defaultAllApps",
          "defaultAllBlocks",
          "settings",
        ].filter((k) => k in params) as (keyof typeof params)[];

      (graphDraft as Graph.Graph)[environmentRole.id] = {
        ...environmentRole,
        ...pickDefined(keys, params),
        updatedAt: now,
      } as Rbac.EnvironmentRole;

      if (
        !environmentRole.isDefault &&
        !environmentRole.defaultAllApps &&
        params.defaultAllApps
      ) {
        // add app environments

        graphTypes(graphDraft).apps.forEach((app) => {
          const existingEnvironmentForRole = indexBy(
            R.prop("environmentRoleId"),
            getEnvironmentsByEnvParentId(graphDraft)[app.id] ?? []
          )[environmentRole.id];

          if (!existingEnvironmentForRole) {
            const id = uuid(),
              environment: Model.Environment = {
                type: "environment",
                id,
                envParentId: app.id,
                environmentRoleId: environmentRole.id,
                envUpdatedAt: now,
                isSub: false,
                settings: {},
                createdAt: now,
                updatedAt: now,
              };
            (graphDraft as Graph.Graph)[environment.id] = environment;
          }
        });
      }

      if (
        !environmentRole.isDefault &&
        !environmentRole.defaultAllBlocks &&
        params.defaultAllBlocks
      ) {
        // add block environments
        graphTypes(graphDraft).blocks.forEach((block) => {
          const existingEnvironmentForRole = indexBy(
            R.prop("environmentRoleId"),
            getEnvironmentsByEnvParentId(graphDraft)[block.id] ?? []
          )[environmentRole.id];

          if (!existingEnvironmentForRole) {
            const id = uuid(),
              environment: Model.Environment = {
                type: "environment",
                id,
                envParentId: block.id,
                environmentRoleId: environmentRole.id,
                envUpdatedAt: now,
                isSub: false,
                settings: {},
                createdAt: now,
                updatedAt: now,
              };
            (graphDraft as Graph.Graph)[environment.id] = environment;
          }
        });
      }

      if (params.appRoleEnvironmentRoles) {
        for (let appRoleId in params.appRoleEnvironmentRoles) {
          const appRole = graphDraft[appRoleId] as Rbac.AppRole;
          if (appRole.hasFullEnvironmentPermissions) {
            continue;
          }

          const appRoleEnvironmentRole = getAppRoleEnvironmentRolesByComposite(
              graphDraft
            )[
              [appRoleId, environmentRole.id].join("|")
            ] as Rbac.AppRoleEnvironmentRole,
            updatedPermissions = params.appRoleEnvironmentRoles[appRoleId];

          if (
            !R.equals(
              R.clone(appRoleEnvironmentRole.permissions).sort(),
              R.clone(updatedPermissions).sort()
            )
          ) {
            (graphDraft as Graph.Graph)[appRoleEnvironmentRole.id] = {
              ...appRoleEnvironmentRole,
              permissions: updatedPermissions,
              updatedAt: now,
            };
          }
        }
      }

      let toDeleteIds: string[] = [];

      if (
        environmentRole.hasLocalKeys &&
        "hasLocalKeys" in params &&
        !params.hasLocalKeys
      ) {
        // delete all connected local keys
        const localKeysByEnvironmentId =
            getLocalKeysByEnvironmentId(graphDraft),
          environments =
            getEnvironmentsByRoleId(graphDraft)[environmentRole.id] || [];

        for (let environment of environments) {
          const localKeys = localKeysByEnvironmentId[environment.id] || [];
          toDeleteIds = toDeleteIds.concat(localKeys.map(R.prop("id")));
        }
      }

      if (
        environmentRole.hasServers &&
        "hasServers" in params &&
        !params.hasServers
      ) {
        // delete all connected servers
        const serversByEnvironmentId = getServersByEnvironmentId(graphDraft),
          environments =
            getEnvironmentsByRoleId(graphDraft)[environmentRole.id] || [];

        for (let environment of environments) {
          const servers = serversByEnvironmentId[environment.id] || [];
          toDeleteIds = toDeleteIds.concat(servers.map(R.prop("id")));
        }
      }

      if (toDeleteIds.length > 0) {
        getDeleteGraphObjectsProducer(toDeleteIds, now)(graphDraft);
      }

      return graphDraft;
    };

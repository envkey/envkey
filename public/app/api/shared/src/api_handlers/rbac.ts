import {
  graphTypes,
  getEnvironmentsByRoleId,
  getAppRoleEnvironmentRolesByEnvironmentRoleId,
  deleteGraphObjects,
  getUpdateEnvironmentRoleProducer,
  getOrphanedLocalKeyIds,
} from "@core/lib/graph";
import { apiAction } from "../handler";
import { Api } from "@core/types";
import { v4 as uuid } from "uuid";
import { pickDefined } from "@core/lib/utils/object";
import produce, { Draft } from "immer";
import * as R from "ramda";
import * as graphKey from "../graph_key";
import { log } from "@core/lib/utils/logger";

apiAction<
  Api.Action.RequestActions["RbacCreateEnvironmentRole"],
  Api.Net.ApiResultTypes["RbacCreateEnvironmentRole"]
>({
  type: Api.ActionType.RBAC_CREATE_ENVIRONMENT_ROLE,
  authenticated: true,
  graphAction: true,
  rbacUpdate: true,

  graphAuthorizer: async ({ payload }, orgGraph, userGraph, auth) => {
    const appRoleIds = graphTypes(orgGraph)
      .appRoles.filter(R.complement(R.prop("hasFullEnvironmentPermissions")))
      .map(R.prop("id"));

    if (
      !R.equals(
        appRoleIds.sort(),
        Object.keys(payload.appRoleEnvironmentRoles).sort()
      )
    ) {
      return false;
    }

    return auth.orgPermissions.has("org_manage_environment_roles");
  },
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    const environmentRoles = graphTypes(orgGraph).environmentRoles;
    const id = uuid(),
      environmentRole = {
        type: "environmentRole",
        id,
        ...graphKey.environmentRole(auth.org.id, id),
        isDefault: false,
        ...pickDefined(
          [
            "name",
            "description",
            "hasLocalKeys",
            "hasServers",
            "defaultAllApps",
            "defaultAllBlocks",
            "settings",
            "importId",
          ],
          payload
        ),
        orderIndex:
          environmentRoles[environmentRoles.length - 1].orderIndex + 1,
        createdAt: now,
        updatedAt: now,
      } as Api.Db.EnvironmentRole;

    const updatedGraph = produce(orgGraph, (draft) => {
      draft[environmentRole.id] = environmentRole;

      if (environmentRole.defaultAllApps) {
        const apps = graphTypes(orgGraph).apps;

        for (let app of apps) {
          const id = uuid(),
            environment: Api.Db.Environment = {
              type: "environment",
              id,
              ...graphKey.environment(auth.org.id, app.id, id),
              envParentId: app.id,
              environmentRoleId: environmentRole.id,
              isSub: false,
              settings: {},
              createdAt: now,
              updatedAt: now,
            };

          draft[environment.id] = environment;
        }
      }

      if (environmentRole.defaultAllBlocks) {
        const blocks = graphTypes(orgGraph).blocks;

        for (let block of blocks) {
          const id = uuid(),
            environment: Api.Db.Environment = {
              type: "environment",
              id,
              ...graphKey.environment(auth.org.id, block.id, id),
              envParentId: block.id,
              environmentRoleId: environmentRole.id,
              isSub: false,
              settings: {},
              createdAt: now,
              updatedAt: now,
            };

          draft[environment.id] = environment;
        }
      }

      for (let appRoleId in payload.appRoleEnvironmentRoles) {
        const id = uuid(),
          appRoleEnvironmentRole: Api.Db.AppRoleEnvironmentRole = {
            type: "appRoleEnvironmentRole",
            id,
            ...graphKey.appRoleEnvironmentRole(auth.org.id, id),
            appRoleId,
            environmentRoleId: environmentRole.id,
            permissions: payload.appRoleEnvironmentRoles[appRoleId],
            createdAt: now,
            updatedAt: now,
          };

        draft[appRoleEnvironmentRole.id] = appRoleEnvironmentRole;
      }
    });

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      logTargetIds: [
        environmentRole.id,
        ...(environmentRole.defaultAllApps
          ? graphTypes(orgGraph).apps.map(R.prop("id"))
          : []),

        ...(environmentRole.defaultAllBlocks
          ? graphTypes(orgGraph).blocks.map(R.prop("id"))
          : []),
      ],
    };
  },
});

apiAction<
  Api.Action.RequestActions["RbacDeleteEnvironmentRole"],
  Api.Net.ApiResultTypes["RbacDeleteEnvironmentRole"]
>({
  type: Api.ActionType.RBAC_DELETE_ENVIRONMENT_ROLE,
  authenticated: true,
  graphAction: true,
  rbacUpdate: true,

  graphAuthorizer: async ({ payload }, orgGraph, userGraph, auth) => {
    const environmentRole = userGraph[payload.id];
    if (
      !environmentRole ||
      environmentRole.type != "environmentRole" ||
      environmentRole.isDefault
    ) {
      return false;
    }

    return auth.orgPermissions.has("org_manage_environment_roles");
  },
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    const environmentRole = orgGraph[payload.id] as Api.Db.EnvironmentRole;
    const byType = graphTypes(orgGraph);
    const environments = getEnvironmentsByRoleId(orgGraph)[payload.id] ?? [],
      environmentIds = environments.map(R.prop("id")),
      environmentIdsSet = new Set(environmentIds),
      keyableParents = [...byType.servers, ...byType.localKeys].filter(
        ({ environmentId }) => environmentIdsSet.has(environmentId)
      ),
      keyableParentIds = keyableParents.map(R.prop("id")),
      keyableParentIdsSet = new Set(keyableParentIds),
      generatedEnvkeys = byType.generatedEnvkeys.filter(({ keyableParentId }) =>
        keyableParentIdsSet.has(keyableParentId)
      ),
      appRoleEnvironmentRoles =
        getAppRoleEnvironmentRolesByEnvironmentRoleId(orgGraph)[payload.id] ||
        [];

    // clear environment role from environmentRoleIpsAllowed (firewall config) on org or any app
    const updatedGraph = produce(orgGraph, (graphDraft) => {
      if (auth.org.environmentRoleIpsAllowed?.[environmentRole.id]) {
        const orgDraft = graphDraft[auth.org.id] as Draft<Api.Db.Org>;
        delete orgDraft.environmentRoleIpsAllowed![environmentRole.id];
      }

      for (let { id: appId, environmentRoleIpsAllowed } of byType.apps) {
        if (environmentRoleIpsAllowed?.[environmentRole.id]) {
          const appDraft = graphDraft[appId] as Draft<Api.Db.App>;
          delete appDraft.environmentRoleIpsAllowed![environmentRole.id];
        }
      }
    });

    return {
      type: "graphHandlerResult",
      graph: deleteGraphObjects(
        updatedGraph,
        [
          payload.id,
          ...environmentIds,
          ...appRoleEnvironmentRoles.map(R.prop("id")),
          ...keyableParentIds,
          ...generatedEnvkeys.map(R.prop("id")),
        ],
        now
      ),
      transactionItems: {
        hardDeleteEncryptedBlobParams: environments.flatMap((environment) => [
          {
            orgId: auth.org.id,
            envParentId: environment.envParentId,
            environmentId: environment.id,
            blobType: "env",
          },
          {
            orgId: auth.org.id,
            envParentId: environment.envParentId,
            environmentId: environment.id,
            blobType: "changeset",
          },
        ]),
      },
      logTargetIds: [
        environmentRole.id,
        ...R.uniq(environments.map(R.prop("envParentId"))),
      ],
      clearEnvkeySockets: generatedEnvkeys.map((generatedEnvkeyId) => ({
        orgId: auth.org.id,
        generatedEnvkeyId,
      })),
    };
  },
});

apiAction<
  Api.Action.RequestActions["RbacUpdateEnvironmentRole"],
  Api.Net.ApiResultTypes["RbacUpdateEnvironmentRole"]
>({
  type: Api.ActionType.RBAC_UPDATE_ENVIRONMENT_ROLE,
  authenticated: true,
  graphAction: true,
  rbacUpdate: true,
  shouldClearOrphanedLocals: true,

  graphAuthorizer: async ({ payload }, orgGraph, userGraph, auth) => {
    const environmentRole = userGraph[payload.id];
    if (!environmentRole || environmentRole.type != "environmentRole") {
      return false;
    }

    return auth.orgPermissions.has("org_manage_environment_roles");
  },
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    const environmentRole = orgGraph[payload.id] as Api.Db.EnvironmentRole;

    const environments = getEnvironmentsByRoleId(orgGraph)[payload.id] ?? [];

    const producerFn = getUpdateEnvironmentRoleProducer<Api.Graph.OrgGraph>(
      payload,
      now
    );

    const updatedGraph = produce<Api.Graph.OrgGraph>(orgGraph, producerFn);

    const orphanedLocalKeyIds = getOrphanedLocalKeyIds(updatedGraph);
    const localKeyIdsSet = new Set(orphanedLocalKeyIds);
    const generatedEnvkeys = graphTypes(orgGraph).generatedEnvkeys.filter(
      ({ keyableParentId }) => localKeyIdsSet.has(keyableParentId)
    );

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      // TODO: narrow down rbac scopes
      encryptedKeysScope: "all",
      logTargetIds: [
        environmentRole.id,
        ...R.uniq(environments.map(R.prop("envParentId"))),
      ],
      clearEnvkeySockets: generatedEnvkeys.map((generatedEnvkeyId) => ({
        orgId: auth.org.id,
        generatedEnvkeyId,
      })),
    };
  },
});

apiAction<
  Api.Action.RequestActions["RbacUpdateEnvironmentRoleSettings"],
  Api.Net.ApiResultTypes["RbacUpdateEnvironmentRoleSettings"]
>({
  type: Api.ActionType.RBAC_UPDATE_ENVIRONMENT_ROLE_SETTINGS,
  authenticated: true,
  graphAction: true,
  graphAuthorizer: async ({ payload }, orgGraph, userGraph, auth) => {
    const environmentRole = userGraph[payload.id];
    if (!environmentRole || environmentRole.type != "environmentRole") {
      return false;
    }

    return auth.orgPermissions.has("org_manage_environment_roles");
  },
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    const environmentRole = orgGraph[payload.id] as Api.Db.EnvironmentRole;
    const environments = getEnvironmentsByRoleId(orgGraph)[payload.id] ?? [];

    return {
      type: "graphHandlerResult",
      graph: {
        ...orgGraph,
        [payload.id]: {
          ...environmentRole,
          settings: payload.settings,
          updatedAt: now,
        },
      },
      logTargetIds: [
        environmentRole.id,
        ...R.uniq(environments.map(R.prop("envParentId"))),
      ],
    };
  },
});

apiAction<
  Api.Action.RequestActions["RbacReorderEnvironmentRoles"],
  Api.Net.ApiResultTypes["RbacReorderEnvironmentRoles"]
>({
  type: Api.ActionType.RBAC_REORDER_ENVIRONMENT_ROLES,
  graphAction: true,
  authenticated: true,

  graphAuthorizer: async ({ payload }, orgGraph, userGraph, auth) => {
    if (!auth.orgPermissions.has("org_manage_environment_roles")) {
      return false;
    }

    const { environmentRoles } = graphTypes(orgGraph);
    for (let { id } of environmentRoles) {
      if (typeof payload[id] != "number") {
        return false;
      }
    }

    return true;
  },
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    const updatedGraph = produce(orgGraph, (draft) => {
      for (let id in payload) {
        const draftEnvironmentRole = draft[id] as Api.Db.EnvironmentRole;
        draftEnvironmentRole.orderIndex = payload[id];
        draftEnvironmentRole.updatedAt = now;
      }
    });

    const { environments } = graphTypes(orgGraph);

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      logTargetIds: R.uniq(environments.map(R.prop("envParentId"))),
    };
  },
});

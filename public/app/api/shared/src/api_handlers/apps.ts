import { apiAction } from "../handler";
import { Api, Rbac } from "@core/types";
import * as graphKey from "../graph_key";
import { pick } from "@core/lib/utils/pick";
import { isValidIPOrCIDR } from "@core/lib/utils/ip";
import {
  graphTypes,
  getAppUserGrantsByComposite,
  getOrphanedLocalKeyIdsForUser,
  deleteGraphObjects,
  getDeleteAppProducer,
  authz,
  getConnectedBlocksForApp,
  getActiveGeneratedEnvkeysByAppId,
  getActiveGeneratedEnvkeysByKeyableParentId,
  getLocalKeysByLocalsComposite,
  getAppAllowedIps,
} from "@core/lib/graph";
import { v4 as uuid } from "uuid";
import * as R from "ramda";
import produce, { Draft } from "immer";
import { log } from "@core/lib/utils/logger";

apiAction<
  Api.Action.RequestActions["CreateApp"],
  Api.Net.ApiResultTypes["CreateApp"]
>({
  type: Api.ActionType.CREATE_APP,
  graphAction: true,
  authenticated: true,
  graphScopes: [(auth) => () => [auth.user.skey + "$"]],
  graphAuthorizer: async (action, orgGraph, userGraph, auth) =>
    authz.canCreateApp(userGraph, auth.user.id),
  graphHandler: async (action, orgGraph, auth, now) => {
    const appId = uuid(),
      { environmentRoles } = graphTypes(orgGraph),
      defaultEnvironmentRoles = environmentRoles.filter(
        R.propEq("defaultAllApps", true as boolean)
      ),
      environments = defaultEnvironmentRoles.map<Api.Db.Environment>(
        ({ id: environmentRoleId }) => {
          const id = uuid();
          return {
            type: "environment",
            id,
            ...graphKey.environment(auth.org.id, appId, id),
            envParentId: appId,
            environmentRoleId,
            isSub: false,
            settings: {},
            createdAt: now,
            updatedAt: now,
            "upgradedCrypto-2.1.0": true,
          };
        }
      ),
      allAppRoles = graphTypes(orgGraph).appRoles,
      defaultAppRoles = allAppRoles.filter(
        R.propEq("defaultAllApps", true as boolean)
      ),
      includedAppRoles = defaultAppRoles.map<Api.Db.IncludedAppRole>(
        ({ id: appRoleId }) => {
          const id = uuid();
          return {
            type: "includedAppRole",
            id,
            ...graphKey.includedAppRole(auth.org.id, appId, id),
            appId,
            appRoleId,
            createdAt: now,
            updatedAt: now,
          };
        }
      ),
      app: Api.Db.App = {
        type: "app",
        id: appId,
        ...graphKey.app(auth.org.id, appId),
        ...pick(["name", "settings", "importId"], action.payload),
        localsUpdatedAtByUserId: {},
        localsEncryptedBy: {},
        localsReencryptionRequiredAt: {},
        createdAt: now,
        updatedAt: now,
      };

    return {
      type: "graphHandlerResult",
      handlerContext: {
        type: action.type,
        createdId: appId,
      },
      graph: {
        ...orgGraph,
        ...R.indexBy(R.prop("id"), [app, ...environments, ...includedAppRoles]),
      },
      logTargetIds: [app.id],
    };
  },
});

apiAction<
  Api.Action.RequestActions["RenameApp"],
  Api.Net.ApiResultTypes["RenameApp"]
>({
  type: Api.ActionType.RENAME_APP,
  graphAction: true,
  authenticated: true,
  graphScopes: [
    (auth, { payload: { id } }) =>
      () =>
        [
          auth.user.skey + "$",
          graphKey.app(auth.org.id, id).skey + "$",
          `g|appUserGrant|${id}|`,
          `g|appUserGroup|${id}|`,

          `g|group|`,
          `g|groupMembership|${id}`,
          `g|groupMembership|${auth.user.id}`,

          `g|appGroupUser|`,
          `g|appGroupUserGroup|`,
        ],
  ],
  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) =>
    authz.canRenameApp(userGraph, auth.user.id, id),
  graphHandler: async ({ payload: { id, name } }, orgGraph, auth, now) => {
    return {
      type: "graphHandlerResult",
      graph: {
        ...orgGraph,
        [id]: {
          ...orgGraph[id],
          name,
          updatedAt: now,
        },
      },
      logTargetIds: [id],
    };
  },
});

apiAction<
  Api.Action.RequestActions["UpdateAppSettings"],
  Api.Net.ApiResultTypes["UpdateAppSettings"]
>({
  type: Api.ActionType.UPDATE_APP_SETTINGS,
  graphAction: true,
  authenticated: true,
  graphScopes: [
    (auth, { payload: { id } }) =>
      () =>
        [
          auth.user.skey + "$",
          graphKey.app(auth.org.id, id).skey + "$",
          `g|appUserGrant|${id}|`,
          `g|appUserGroup|${id}|`,

          `g|group|`,
          `g|groupMembership|${id}`,
          `g|groupMembership|${auth.user.id}`,

          `g|appGroupUser|`,
          `g|appGroupUserGroup|`,
        ],
  ],
  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) =>
    authz.canUpdateAppSettings(userGraph, auth.user.id, id),
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    const app = orgGraph[payload.id] as Api.Db.App;

    return {
      type: "graphHandlerResult",
      graph: {
        ...orgGraph,
        [app.id]: { ...app, settings: payload.settings, updatedAt: now },
      },
      logTargetIds: [payload.id],
    };
  },
});

apiAction<
  Api.Action.RequestActions["DeleteApp"],
  Api.Net.ApiResultTypes["DeleteApp"]
>({
  type: Api.ActionType.DELETE_APP,
  graphAction: true,
  authenticated: true,

  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) =>
    authz.canDeleteApp(userGraph, auth.user.id, id),
  graphHandler: async (action, orgGraph, auth, now) => {
    const scope: Rbac.OrgAccessScope = {
      envParentIds: new Set([
        action.payload.id,
        ...getConnectedBlocksForApp(orgGraph, action.payload.id).map(
          R.prop("id")
        ),
      ]),
      userIds: "all",
      keyableParentIds: "all",
    };

    return {
      type: "graphHandlerResult",
      graph: produce(orgGraph, getDeleteAppProducer(action.payload.id, now)),
      transactionItems: {
        hardDeleteEncryptedBlobParams: [
          {
            orgId: auth.org.id,
            envParentId: action.payload.id,
            blobType: "env",
          },
          {
            orgId: auth.org.id,
            envParentId: action.payload.id,
            blobType: "changeset",
          },
        ],
      },
      encryptedKeysScope: scope,
      logTargetIds: [action.payload.id],
      clearEnvkeySockets: (
        getActiveGeneratedEnvkeysByAppId(orgGraph)[action.payload.id] ?? []
      ).map((generatedEnvkeyId) => ({ orgId: auth.org.id, generatedEnvkeyId })),
    };
  },
});

apiAction<
  Api.Action.RequestActions["GrantAppAccess"],
  Api.Net.ApiResultTypes["GrantAppAccess"]
>({
  type: Api.ActionType.GRANT_APP_ACCESS,
  graphAction: true,
  authenticated: true,
  shouldClearOrphanedLocals: true,

  graphAuthorizer: async ({ payload }, orgGraph, userGraph, auth) =>
    authz.canGrantAppRoleToUser(userGraph, auth.user.id, payload),

  graphHandler: async ({ type: actionType, payload }, orgGraph, auth, now) => {
    let updatedGraph: Api.Graph.OrgGraph = orgGraph;

    const existingAppGrant = getAppUserGrantsByComposite(orgGraph)[
      R.props(["userId", "appId"], payload).join("|")
    ] as Api.Db.AppUserGrant | undefined;

    if (existingAppGrant) {
      updatedGraph = deleteGraphObjects(orgGraph, [existingAppGrant.id], now);
    }

    const appUserGrantId = uuid(),
      appUserGrant: Api.Db.AppUserGrant = {
        type: "appUserGrant",
        id: appUserGrantId,
        ...graphKey.appUserGrant(
          auth.org.id,
          payload.appId,
          payload.userId,
          appUserGrantId
        ),
        ...pick(["appId", "appRoleId", "userId", "importId"], payload),
        createdAt: now,
        updatedAt: now,
      };

    updatedGraph = {
      ...updatedGraph,
      [appUserGrantId]: appUserGrant,
    };

    const orphanedLocalKeyIds = getOrphanedLocalKeyIdsForUser(
      updatedGraph,
      auth.user.id
    );
    if (orphanedLocalKeyIds.length > 0) {
      updatedGraph = deleteGraphObjects(updatedGraph, orphanedLocalKeyIds, now);
    }

    const clearEnvkeySockets = orphanedLocalKeyIds.reduce((agg, localKeyId) => {
      const generatedEnvkey =
        getActiveGeneratedEnvkeysByKeyableParentId(orgGraph)[localKeyId];

      if (generatedEnvkey) {
        agg.push({
          orgId: auth.org.id,
          generatedEnvkeyId: generatedEnvkey.id,
        });
      }

      return agg;
    }, [] as Api.ClearEnvkeySocketParams[]);

    const scope: Rbac.OrgAccessScope = {
      envParentIds: new Set([
        appUserGrant.appId,
        ...getConnectedBlocksForApp(orgGraph, appUserGrant.appId).map(
          R.prop("id")
        ),
      ]),
      userIds: new Set([appUserGrant.userId]),
      environmentIds: "all",
      keyableParentIds: "all",
    };

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      handlerContext: {
        type: actionType,
        createdId: appUserGrantId,
      },
      encryptedKeysScope: scope,
      logTargetIds: [appUserGrant.appId, appUserGrant.userId],
      clearEnvkeySockets,
    };
  },
});

apiAction<
  Api.Action.RequestActions["RemoveAppAccess"],
  Api.Net.ApiResultTypes["RemoveAppAccess"]
>({
  type: Api.ActionType.REMOVE_APP_ACCESS,
  graphAction: true,
  authenticated: true,
  shouldClearOrphanedLocals: true,

  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) =>
    authz.canRemoveAppUserAccess(userGraph, auth.user.id, {
      appUserGrantId: id,
    }),
  graphHandler: async (action, orgGraph, auth, now) => {
    const targetAppUserGrant = orgGraph[
        action.payload.id
      ] as Api.Db.AppUserGrant,
      localKeys = graphTypes(orgGraph).localKeys.filter(
        R.whereEq({
          userId: targetAppUserGrant.userId,
          appId: targetAppUserGrant.appId,
        })
      ),
      generatedEnvkeys = localKeys
        .map(
          (localKey) =>
            getActiveGeneratedEnvkeysByKeyableParentId(orgGraph)[localKey.id]
        )
        .filter(Boolean) as Api.Db.GeneratedEnvkey[];

    const connectedBlockIds = getConnectedBlocksForApp(
      orgGraph,
      targetAppUserGrant.appId
    ).map(R.prop("id"));

    const scope: Rbac.OrgAccessScope = {
      envParentIds: new Set([targetAppUserGrant.appId, ...connectedBlockIds]),
      environmentIds: "all",
      userIds: new Set([targetAppUserGrant.userId]),
      keyableParentIds: "all",
    };

    const clearEnvkeySockets = (
      getLocalKeysByLocalsComposite(orgGraph)[
        targetAppUserGrant.appId + "|" + targetAppUserGrant.userId
      ] ?? []
    ).reduce((agg, { id: localKeyId }) => {
      const generatedEnvkey =
        getActiveGeneratedEnvkeysByKeyableParentId(orgGraph)[localKeyId];

      if (generatedEnvkey) {
        agg.push({
          orgId: auth.org.id,
          generatedEnvkeyId: generatedEnvkey.id,
        });
      }

      return agg;
    }, [] as Api.ClearEnvkeySocketParams[]);

    return {
      type: "graphHandlerResult",
      graph: deleteGraphObjects(
        orgGraph,
        [
          targetAppUserGrant.id,
          ...localKeys.map(R.prop("id")),
          ...generatedEnvkeys.map(R.prop("id")),
        ],
        now
      ),
      encryptedKeysScope: scope,
      logTargetIds: [targetAppUserGrant.appId, targetAppUserGrant.userId],
      clearEnvkeySockets,
    };
  },
});

apiAction<
  Api.Action.RequestActions["SetAppAllowedIps"],
  Api.Net.ApiResultTypes["SetAppAllowedIps"]
>({
  type: Api.ActionType.SET_APP_ALLOWED_IPS,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) =>
    authz.canManageAppFirewall(userGraph, auth.user.id, id),
  graphHandler: async (
    { payload },
    orgGraph,
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    const app = orgGraph[payload.id] as Api.Db.App;

    if (!payload.environmentRoleIpsAllowed) {
      throw new Api.ApiError("missing environmentRoleIpsAllowed", 422);
    }

    if (!payload.environmentRoleIpsMergeStrategies) {
      throw new Api.ApiError("missing environmentRoleIpsMergeStrategies", 422);
    }

    // verify that each is a valid ip
    for (let environmentRoleId in payload.environmentRoleIpsAllowed) {
      const ips = payload.environmentRoleIpsAllowed[environmentRoleId];
      if (ips) {
        if (!R.all(isValidIPOrCIDR, ips)) {
          const msg = "Invalid IP or CIDR address";
          throw new Api.ApiError(msg, 422);
        }
      }
    }

    const updatedGraph = produce(orgGraph, (graphDraft) => {
      const appDraft = graphDraft[app.id] as Draft<Api.Db.App>;

      appDraft.environmentRoleIpsMergeStrategies =
        payload.environmentRoleIpsMergeStrategies;

      appDraft.environmentRoleIpsAllowed = payload.environmentRoleIpsAllowed;

      appDraft.updatedAt = now;

      const generatedEnvkeys =
        getActiveGeneratedEnvkeysByAppId(orgGraph)[app.id] ?? [];

      for (let generatedEnvkey of generatedEnvkeys) {
        const environment = orgGraph[
          generatedEnvkey.environmentId
        ] as Api.Db.Environment;

        const generatedEnvkeyDraft = graphDraft[
          generatedEnvkey.id
        ] as Draft<Api.Db.GeneratedEnvkey>;

        generatedEnvkeyDraft.allowedIps = getAppAllowedIps(
          graphDraft,
          app.id,
          environment.environmentRoleId
        );

        generatedEnvkeyDraft.updatedAt = now;
      }
    });

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      logTargetIds: [app.id],
    };
  },
});

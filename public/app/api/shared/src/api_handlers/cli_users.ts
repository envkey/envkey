import {
  authz,
  getLocalKeysByUserId,
  getActiveGeneratedEnvkeysByKeyableParentId,
} from "@core/lib/graph";
import produce from "immer";
import { pick } from "@core/lib/utils/pick";
import { apiAction } from "../handler";
import { Api, Auth } from "@core/types";
import { v4 as uuid } from "uuid";
import { getDb } from "../db";
import * as graphKey from "../graph_key";
import { getPubkeyHash } from "@core/lib/client";
import { getOrgGraph, getApiUserGraph } from "../graph";
import { env } from "../env";
import { getDeleteUsersWithTransactionItems } from "../blob";

apiAction<
  Api.Action.RequestActions["CreateCliUser"],
  Api.Net.ApiResultTypes["CreateCliUser"],
  Auth.TokenAuthContext
>({
  type: Api.ActionType.CREATE_CLI_USER,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async (
    { payload },
    orgGraph,
    userGraph,
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    const numActive = auth.org.deviceLikeCount;

    if (auth.license.maxDevices != -1 && numActive >= auth.license.maxDevices) {
      return false;
    }

    return authz.canCreateCliUser(userGraph, auth.user.id, payload);
  },

  graphHandler: async (action, orgGraph, auth, now) => {
    const cliUserId = uuid(),
      cliUser: Api.Db.CliUser = {
        type: "cliUser",
        id: cliUserId,
        ...graphKey.cliUser(auth.org.id, cliUserId),
        ...pick(
          ["name", "orgRoleId", "pubkey", "encryptedPrivkey"],
          action.payload
        ),
        pubkeyId: getPubkeyHash(action.payload.pubkey),
        creatorId: auth.user.id,
        creatorDeviceId: auth.orgUserDevice.id,
        signedById: auth.orgUserDevice.id,
        pubkeyUpdatedAt: now,
        signedTrustedRoot: action.payload.signedTrustedRoot,
        trustedRootUpdatedAt: now,
        orgRoleUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      cliUserPointer: Api.Db.CliUserPointer = {
        type: "cliUserPointer",
        pkey: ["cliUser", action.payload.cliKeyIdPart].join("|"),
        skey: "cliUserPointer",
        orgId: auth.org.id,
        userId: cliUserId,
        createdAt: now,
        updatedAt: now,
      },
      appUserGrants = action.payload.appUserGrants || [],
      updatedGraph = produce(orgGraph, (draft) => {
        draft[cliUserId] = cliUser;

        for (let appUserGrantParams of appUserGrants) {
          const appUserGrantId = uuid(),
            appUserGrant: Api.Db.AppUserGrant = {
              type: "appUserGrant",
              id: appUserGrantId,
              ...graphKey.appUserGrant(
                auth.org.id,
                appUserGrantParams.appId,
                cliUser.id,
                appUserGrantId
              ),
              ...pick(["appId", "appRoleId"], appUserGrantParams),
              userId: cliUser.id,
              createdAt: now,
              updatedAt: now,
            };
          draft[appUserGrantId] = appUserGrant;
        }
      });

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      handlerContext: {
        type: action.type,
        createdId: cliUserId,
      },
      transactionItems: {
        puts: [cliUserPointer],
      },
      logTargetIds: [cliUserId],
    };
  },
});

apiAction<
  Api.Action.RequestActions["RenameCliUser"],
  Api.Net.ApiResultTypes["RenameCliUser"]
>({
  type: Api.ActionType.RENAME_CLI_USER,
  graphAction: true,
  authenticated: true,
  graphScopes: [
    (auth, { payload: { id } }) =>
      () =>
        [auth.user.skey + "$", graphKey.cliUser(auth.org.id, id).skey + "$"],
  ],
  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) =>
    authz.canRenameCliUser(userGraph, auth.user.id, id),
  graphHandler: async ({ payload: { id, name } }, orgGraph, auth, now) => {
    return {
      type: "graphHandlerResult",
      graph: {
        ...orgGraph,
        [id]: { ...orgGraph[id], name, updatedAt: now },
      },
      logTargetIds: [id],
    };
  },
});

apiAction<
  Api.Action.RequestActions["DeleteCliUser"],
  Api.Net.ApiResultTypes["DeleteCliUser"]
>({
  type: Api.ActionType.DELETE_CLI_USER,
  graphAction: true,
  authenticated: true,
  shouldClearOrphanedLocals: true,
  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) =>
    authz.canDeleteCliUser(userGraph, auth.user.id, id),
  graphHandler: async (action, orgGraph, auth, now) => {
    const userId = action.payload.id;

    const { updatedGraph, transactionItems } =
      getDeleteUsersWithTransactionItems(
        auth,
        orgGraph,
        orgGraph,
        [userId],
        now
      );

    const clearEnvkeySockets = (
      getLocalKeysByUserId(orgGraph)[userId] ?? []
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
      graph: updatedGraph,
      transactionItems,
      logTargetIds: [userId],
      clearEnvkeySockets,
    };
  },
});

apiAction<
  Api.Action.RequestActions["AuthenticateCliKey"],
  Api.Net.ApiResultTypes["AuthenticateCliKey"]
>({
  type: Api.ActionType.AUTHENTICATE_CLI_KEY,
  graphAction: false,
  authenticated: false,
  handler: async ({ type, payload }, now, requestParams, transactionConn) => {
    const cliUserPointer = await getDb<Api.Db.CliUserPointer>(
      {
        pkey: ["cliUser", payload.cliKeyIdPart].join("|"),
        skey: "cliUserPointer",
      },
      { transactionConn }
    );

    if (!cliUserPointer) {
      console.log("cli key pointer not found");
      throw new Api.ApiError("not found", 404);
    }

    const cliUser = await getDb<Api.Db.CliUser>(
      graphKey.cliUser(cliUserPointer.orgId, cliUserPointer.userId),
      { transactionConn }
    );
    if (!cliUser || cliUser.deactivatedAt) {
      console.log("cli user not found");
      throw new Api.ApiError("not found", 404);
    }

    const orgGraph = await getOrgGraph(cliUserPointer.orgId, {
      transactionConn,
    });

    const org = orgGraph[cliUserPointer.orgId] as Api.Db.Org;

    const graph = getApiUserGraph(
      orgGraph,
      cliUserPointer.orgId,
      cliUser.id,
      undefined,
      now
    );

    return {
      type: "handlerResult",
      response: {
        type: "authenticateCliKeyResult",
        orgId: cliUserPointer.orgId,
        userId: cliUserPointer.userId,
        graph,
        graphUpdatedAt: org.graphUpdatedAt,
        timestamp: now,
        signedTrustedRoot: cliUser.signedTrustedRoot,
        name: cliUser.name,
        encryptedPrivkey: cliUser.encryptedPrivkey,
        ...(env.IS_CLOUD
          ? {
              hostType: <const>"cloud",
            }
          : {
              hostType: <const>"self-hosted",
              deploymentTag: env.DEPLOYMENT_TAG!,
            }),
      },
      logTargetIds: [],
      handlerContext: {
        type,
        cliUser,
      },
    };
  },
});

import { pick } from "@core/lib/utils/object";
import { apiAction } from "../handler";
import { Api, Rbac, Auth } from "@core/types";
import * as R from "ramda";
import {
  graphTypes,
  getOrphanedLocalKeyIdsForUser,
  getGroupMembershipsByObjectId,
  getActiveRecoveryKeysByUserId,
  getOrgPermissions,
  getCurrentEncryptedKeys,
  getLocalKeysByUserId,
  deleteGraphObjects,
  getAppAllowedIps,
  authz,
} from "@core/lib/graph";
import { getOrgGraph } from "../graph";
import {
  getDeleteEncryptedKeysTransactionItems,
  getDeleteUsersWithTransactionItems,
} from "../blob";
import { getDb, mergeObjectTransactionItems } from "../db";
import { scimCandidateDbKey } from "../models/provisioning";
import { getOrg } from "../models/orgs";
import produce, { Draft } from "immer";
import { isValidIPOrCIDR, ipMatchesAny } from "@core/lib/utils/ip";
import { log, logStderr } from "@core/lib/utils/logger";
import { env } from "../env";
import {
  getResolveProductAndQuantityFn,
  getCancelSubscriptionFn,
} from "../billing";
import { PoolConnection } from "mysql2/promise";

let initV1UpgradeBillingFn:
  | ((
      transactionConn: PoolConnection,
      org: Api.Db.Org,
      orgUser: Api.Db.OrgUser,
      orgGraph: Api.Graph.OrgGraph,
      now: number,
      v1Upgrade: Api.V1Upgrade.Upgrade,
      isExistingOrgUpgrade?: boolean
    ) => Promise<[Api.Graph.OrgGraph, Api.Db.ObjectTransactionItems]>)
  | undefined;
export const registerInitV1UpgradeBillingFn = (
  fn: typeof initV1UpgradeBillingFn
) => {
  initV1UpgradeBillingFn = fn;
};

apiAction<
  Api.Action.RequestActions["UpdateOrgSettings"],
  Api.Net.ApiResultTypes["UpdateOrgSettings"]
>({
  type: Api.ActionType.UPDATE_ORG_SETTINGS,
  graphAction: true,
  authenticated: true,
  graphScopes: [(auth) => () => [auth.user.skey + "$"]],
  graphAuthorizer: async (action, orgGraph, userGraph, auth) =>
    authz.canUpdateOrgSettings(userGraph, auth.user.id),
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    const settings = payload;

    return {
      type: "graphHandlerResult",
      graph: {
        ...orgGraph,
        [auth.org.id]: {
          ...auth.org,
          settings,
          orgSettingsImported: payload.isImport
            ? true
            : auth.org.orgSettingsImported,
          updatedAt: now,
        },
      },
      logTargetIds: [],
    };
  },
});

apiAction<
  Api.Action.RequestActions["RenameOrg"],
  Api.Net.ApiResultTypes["RenameOrg"]
>({
  type: Api.ActionType.RENAME_ORG,
  graphAction: true,
  authenticated: true,
  graphScopes: [(auth) => () => [auth.user.skey + "$"]],
  graphAuthorizer: async (action, orgGraph, userGraph, auth) =>
    authz.canRenameOrg(userGraph, auth.user.id),
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    return {
      type: "graphHandlerResult",
      graph: {
        ...orgGraph,
        [auth.org.id]: {
          ...auth.org,
          name: payload.name,
          updatedAt: now,
        },
      },
      logTargetIds: [],
    };
  },
});

apiAction<
  Api.Action.RequestActions["StartedOrgImport"],
  Api.Net.ApiResultTypes["StartedOrgImport"],
  Auth.TokenAuthContext
>({
  type: Api.ActionType.STARTED_ORG_IMPORT,
  graphAction: true,
  authenticated: true,
  graphScopes: [(auth) => () => [auth.user.skey + "$"]],
  graphAuthorizer: async (action, orgGraph, userGraph, auth) =>
    authz.hasOrgPermission(
      userGraph,
      auth.user.id,
      "org_archive_import_export"
    ),
  graphHandler: async (
    { payload },
    orgGraph,
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    let updatedGraph = orgGraph;
    let transactionItems: Api.Db.ObjectTransactionItems = {};

    let importedFromV1 = auth.org.importedFromV1;
    if (env.IS_CLOUD) {
      // on cloud, don't send lifecycle emails if it's an imported org
      const { orgUsers } = graphTypes(orgGraph);

      updatedGraph = produce(updatedGraph, (graphDraft) => {
        for (let { id } of orgUsers) {
          (graphDraft[id] as Draft<Api.Db.OrgUser>).tertiaryIndex = undefined;
          (graphDraft[id] as Draft<Api.Db.OrgUser>).updatedAt = now;
        }
      });

      // if upgrading into an existing org, init v2 billing

      if (payload.isV1UpgradeIntoExistingOrg) {
        log("STARTED_ORG_IMPORT - v1 upgrade - into existing org", {
          org: auth.org,
          user: auth.user,
          now,
          payload,
        });

        if (!initV1UpgradeBillingFn) {
          throw new Error("initV1UpgradeBillingFn not registered");
        }

        const res = await initV1UpgradeBillingFn(
          transactionConn,
          auth.org,
          auth.user,
          updatedGraph,
          now,
          payload.v1Upgrade,
          true
        );

        updatedGraph = res[0];
        transactionItems = res[1];
        importedFromV1 = true;
      }
    }

    return {
      type: "graphHandlerResult",
      graph: {
        ...updatedGraph,
        [auth.org.id]: {
          ...(updatedGraph[auth.org.id] as Api.Db.Org),
          startedOrgImportAt: now,
          finishedOrgImportAt: undefined,
          updatedAt: now,
          importedFromV1,
        },
      },
      transactionItems,
      logTargetIds: [],
    };
  },
});

apiAction<
  Api.Action.RequestActions["FinishedOrgImport"],
  Api.Net.ApiResultTypes["FinishedOrgImport"]
>({
  type: Api.ActionType.FINISHED_ORG_IMPORT,
  graphAction: true,
  authenticated: true,
  graphScopes: [(auth) => () => [auth.user.skey + "$"]],
  graphAuthorizer: async (action, orgGraph, userGraph, auth) =>
    authz.hasOrgPermission(
      userGraph,
      auth.user.id,
      "org_archive_import_export"
    ),
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    return {
      type: "graphHandlerResult",
      graph: {
        ...orgGraph,
        [auth.org.id]: {
          ...(orgGraph[auth.org.id] as Api.Db.Org),
          finishedOrgImportAt: now,
          updatedAt: now,
        },
      },
      logTargetIds: [],
    };
  },
});

apiAction<
  Api.Action.RequestActions["RenameUser"],
  Api.Net.ApiResultTypes["RenameUser"]
>({
  type: Api.ActionType.RENAME_USER,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) =>
    authz.canRenameUser(userGraph, auth.user.id, id),
  graphHandler: async (
    { payload: { id, firstName, lastName } },
    orgGraph,
    auth,
    now
  ) => {
    return {
      type: "graphHandlerResult",
      graph: {
        ...orgGraph,
        [id]: { ...orgGraph[id], firstName, lastName, updatedAt: now },
      },
      logTargetIds: [id],
    };
  },
});

apiAction<
  Api.Action.RequestActions["UpdateUserRole"],
  Api.Net.ApiResultTypes["UpdateUserRole"]
>({
  type: Api.ActionType.UPDATE_USER_ROLE,
  graphAction: true,
  authenticated: true,
  shouldClearOrphanedLocals: true,

  graphAuthorizer: async (
    { payload: { id, orgRoleId } },
    orgGraph,
    userGraph,
    auth
  ) => authz.canUpdateUserRole(userGraph, auth.user.id, id, orgRoleId),
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    const target = orgGraph[payload.id] as Api.Db.OrgUser | Api.Db.CliUser,
      userId = target.id,
      oldOrgRole = orgGraph[target.orgRoleId] as Api.Db.OrgRole,
      newOrgRole = orgGraph[payload.orgRoleId] as Api.Db.OrgRole,
      byType = graphTypes(orgGraph),
      settingAutoAppRole =
        !oldOrgRole.autoAppRoleId && newOrgRole.autoAppRoleId;

    let updatedGraph = {
        ...orgGraph,
        [target.id]: {
          ...target,
          orgRoleId: payload.orgRoleId,
          orgRoleUpdatedAt: now,
          updatedAt: now,
        },
      },
      toDeleteIds: string[] = [];

    if (settingAutoAppRole) {
      const appUserGrants = byType.appUserGrants.filter(
          R.propEq("userId", userId)
        ),
        groupMemberships =
          getGroupMembershipsByObjectId(orgGraph)[userId] ?? [],
        appGroupUsers = byType.appGroupUsers.filter(R.propEq("userId", userId));

      toDeleteIds = [
        ...appUserGrants.map(R.prop("id")),
        ...groupMemberships.map(R.prop("id")),
        ...appGroupUsers.map(R.prop("id")),
      ];
    }

    const orphanedLocalKeyIds = getOrphanedLocalKeyIdsForUser(
        updatedGraph,
        auth.user.id
      ),
      orphanedLocalKeyIdsSet = new Set(orphanedLocalKeyIds),
      generatedEnvkeys = byType.generatedEnvkeys.filter(({ keyableParentId }) =>
        orphanedLocalKeyIdsSet.has(keyableParentId)
      ),
      generatedEnvkeyIds = generatedEnvkeys.map(R.prop("id"));

    toDeleteIds = [
      ...toDeleteIds,
      ...orphanedLocalKeyIds,
      ...generatedEnvkeyIds,
    ];

    if (
      getOrgPermissions(orgGraph, oldOrgRole.id).has(
        "org_generate_recovery_key"
      ) &&
      !getOrgPermissions(orgGraph, newOrgRole.id).has(
        "org_generate_recovery_key"
      )
    ) {
      const recoveryKey = getActiveRecoveryKeysByUserId(orgGraph)[userId];
      if (recoveryKey) {
        toDeleteIds.push(recoveryKey.id);
      }
    }

    if (toDeleteIds.length > 0) {
      updatedGraph = deleteGraphObjects(updatedGraph, toDeleteIds, now);
    }

    const scope: Rbac.OrgAccessScope = {
      userIds: new Set([userId]),
      envParentIds: "all",
      keyableParentIds: "all",
    };

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      encryptedKeysScope: scope,
      logTargetIds: [userId],
      clearEnvkeySockets: generatedEnvkeyIds.map((generatedEnvkeyId) => ({
        orgId: auth.org.id,
        generatedEnvkeyId,
      })),
    };
  },
});

apiAction<
  Api.Action.RequestActions["RemoveFromOrg"],
  Api.Net.ApiResultTypes["RemoveFromOrg"]
>({
  type: Api.ActionType.REMOVE_FROM_ORG,
  graphAction: true,
  authenticated: true,
  shouldClearOrphanedLocals: true,

  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) =>
    authz.canRemoveFromOrg(userGraph, auth.user.id, id),
  graphHandler: async (
    { payload },
    orgGraph,
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    const target = orgGraph[payload.id] as Api.Db.OrgUser,
      userId = target.id,
      candidate = target.scim
        ? await getDb<Api.Db.ScimUserCandidate>(
            scimCandidateDbKey({
              orgId: auth.org.id,
              providerId: target.scim.providerId,
              userCandidateId: target.scim.candidateId,
            }),
            { transactionConn }
          )
        : undefined;

    const byType = graphTypes(orgGraph);
    const localKeys = getLocalKeysByUserId(orgGraph)[userId] ?? [];
    const localKeyIds = localKeys.map(R.prop("id"));
    const localKeyIdsSet = new Set(localKeyIds);
    const generatedEnvkeys = byType.generatedEnvkeys.filter(
      ({ keyableParentId }) => localKeyIdsSet.has(keyableParentId)
    );

    let { transactionItems, updatedGraph } = getDeleteUsersWithTransactionItems(
      auth.org.id,
      orgGraph,
      orgGraph,
      [userId],
      now
    );

    const resolveProductAndQuantityFn = getResolveProductAndQuantityFn();
    if (resolveProductAndQuantityFn) {
      const productAndQuantityRes = await resolveProductAndQuantityFn(
        transactionConn,
        auth,
        updatedGraph,
        "remove-user",
        now
      );
      updatedGraph = productAndQuantityRes[0];
      transactionItems = mergeObjectTransactionItems([
        transactionItems,
        productAndQuantityRes[1],
      ]);
    }

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      transactionItems: {
        ...transactionItems,
        puts: candidate
          ? [
              {
                ...candidate,
                orgUserId: undefined,
              } as Api.Db.ScimUserCandidate,
            ]
          : undefined,
      },
      logTargetIds: [userId],
      clearUserSockets: [{ orgId: auth.org.id, userId: payload.id }],
      clearEnvkeySockets: generatedEnvkeys.map((generatedEnvkeyId) => ({
        orgId: auth.org.id,
        generatedEnvkeyId,
      })),
    };
  },
});

apiAction<
  Api.Action.RequestActions["SetOrgAllowedIps"],
  Api.Net.ApiResultTypes["SetOrgAllowedIps"]
>({
  type: Api.ActionType.SET_ORG_ALLOWED_IPS,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async (action, orgGraph, userGraph, auth) =>
    authz.hasOrgPermission(orgGraph, auth.user.id, "org_manage_firewall"),
  graphHandler: async (
    { payload },
    orgGraph,
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    if (!payload.environmentRoleIpsAllowed) {
      throw new Api.ApiError("missing environmentRoleIpsAllowed", 422);
    }

    if (payload.localIpsAllowed) {
      // verify that each is a valid ip
      // also verify that current ip is allowed so current user
      // can't be locked out
      if (!R.all(isValidIPOrCIDR, payload.localIpsAllowed)) {
        const msg = "Invalid IP or CIDR address";
        throw new Api.ApiError(msg, 422);
      }

      if (!ipMatchesAny(requestParams.ip, payload.localIpsAllowed)) {
        const msg = "Current user IP not allowed by localIpsAllowed";
        throw new Api.ApiError(msg, 422);
      }
    }

    // verify that each set in environmentRoleIpsAllowed is a valid ip
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
      const orgDraft = graphDraft[auth.org.id] as Draft<Api.Db.Org>;

      orgDraft.localIpsAllowed = payload.localIpsAllowed;
      orgDraft.environmentRoleIpsAllowed = payload.environmentRoleIpsAllowed;
      orgDraft.updatedAt = now;

      for (let { id, environmentId, appId } of graphTypes(orgGraph)
        .generatedEnvkeys) {
        const environment = orgGraph[environmentId] as Api.Db.Environment;

        const generatedEnvkeyDraft = graphDraft[
          id
        ] as Draft<Api.Db.GeneratedEnvkey>;

        generatedEnvkeyDraft.allowedIps = getAppAllowedIps(
          graphDraft,
          appId,
          environment.environmentRoleId
        );

        generatedEnvkeyDraft.updatedAt = now;
      }
    });

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      logTargetIds: [],
    };
  },
});

apiAction<
  Api.Action.RequestActions["DeleteOrg"],
  Api.Net.ApiResultTypes["DeleteOrg"]
>({
  type: Api.ActionType.DELETE_ORG,
  graphAction: false,
  authenticated: true,
  broadcastOrgSocket: true,
  authorizer: async (action, auth) => {
    return auth.orgPermissions.has("org_delete");
  },
  handler: async (action, auth, now, requestParams, transactionConn) => {
    // obtain lock on org
    await getOrg(auth.org.id, transactionConn, true);

    const orgGraph = await getOrgGraph(auth.org.id, {
        transactionConnOrPool: transactionConn,
      }),
      keySet = getCurrentEncryptedKeys(orgGraph, "all", now, true),
      { hardDeleteKeys, hardDeleteEncryptedKeyParams } =
        await getDeleteEncryptedKeysTransactionItems(
          auth.org.id,
          orgGraph,
          keySet
        );

    const cancelSubscriptionFn = getCancelSubscriptionFn();
    const customer = graphTypes(orgGraph).customer as
      | Api.Db.Customer
      | undefined;
    const subscription = graphTypes(orgGraph).subscription as
      | Api.Db.Subscription
      | undefined;
    if (cancelSubscriptionFn && customer && subscription) {
      await cancelSubscriptionFn({
        stripeCustomerId: customer.stripeId,
        stripeSubscriptionId: subscription.stripeId,
        removePaymentMethods: true,
      });
    }

    return {
      type: "handlerResult",
      response: {
        type: "success",
      },
      transactionItems: {
        hardDeleteKeys,
        softDeleteKeys: Object.values(orgGraph)
          .filter(({ pkey }) => pkey != "billing")
          .map(pick(["pkey", "skey"])),
        hardDeleteEncryptedKeyParams,
        hardDeleteEncryptedBlobParams: [{ orgId: auth.org.id }],
      },
      logTargetIds: [],
      clearUserSockets: [{ orgId: auth.org.id }],
      clearEnvkeySockets: [{ orgId: auth.org.id }],
    };
  },
});

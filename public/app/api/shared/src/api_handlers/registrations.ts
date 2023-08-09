import { LIFECYCLE_EMAILS_ENABLED } from "../email";
import { env } from "../env";
import { apiAction } from "../handler";
import { Api, Rbac } from "@core/types";
import { v4 as uuid } from "uuid";
import { secureRandomAlphanumeric, sha256 } from "@core/lib/crypto/utils";
import { mergeObjectTransactionItems, query } from "../db";
import * as graphKey from "../graph_key";
import * as R from "ramda";
import { verifyEmailToken, verifyExternalAuthSession } from "../auth";
import { getCreateExternalAuthProviderWithTransactionItems } from "../models/external_auth";
import { getAuthTokenKey } from "../models/auth_tokens";
import { pick } from "@core/lib/utils/pick";
import { getApiUserGraph } from "../graph";
import { getPubkeyHash } from "@core/lib/client";
import { PoolConnection } from "mysql2/promise";
import * as semver from "semver";
import { log } from "@core/lib/utils/logger";

let initOrgStatsFn:
  | ((
      orgId: string,
      now: number,
      transactionConn: PoolConnection
    ) => Promise<void>)
  | undefined;
export const registerInitOrgStatsFn = (fn: typeof initOrgStatsFn) => {
  initOrgStatsFn = fn;
};

let initBillingFn:
  | ((
      transactionConn: PoolConnection,
      org: Api.Db.Org,
      orgUser: Api.Db.OrgUser,
      orgGraph: Api.Graph.OrgGraph,
      now: number,
      v1Upgrade?: Api.V1Upgrade.Upgrade
    ) => Promise<[Api.Graph.OrgGraph, Api.Db.ObjectTransactionItems]>)
  | undefined;
export const registerInitBillingFn = (fn: typeof initBillingFn) => {
  initBillingFn = fn;
};

apiAction<
  Api.Action.RequestActions["Register"],
  Api.Net.ApiResultTypes["Register"]
>({
  type: Api.ActionType.REGISTER,
  graphAction: false,
  authenticated: false,
  handler: async (action, now, requestParams, transactionConn) => {
    const { payload } = action;
    const email = payload.user.email.toLowerCase().trim();

    let externalAuthSession: Api.Db.ExternalAuthSession | undefined,
      verifyTokenRes: false | Api.Db.ObjectTransactionItems | undefined;

    if (!env.IS_CLOUD && !env.IS_ENTERPRISE) {
      // community edition authentication so not just anyone can register
      if (
        !env.COMMUNITY_AUTH_HASH ||
        payload.hostType != "community" ||
        !payload.communityAuth ||
        sha256(payload.communityAuth) != env.COMMUNITY_AUTH_HASH
      ) {
        throw new Api.ApiError("forbidden", 401);
      }
    }

    if (payload.hostType == "cloud" && (env.IS_ENTERPRISE || !env.IS_CLOUD)) {
      throw new Api.ApiError("invalid host", 400);
    }

    if (!action.meta.client) {
      throw new Api.ApiError("client version required", 400);
    }
    if (
      env.NODE_ENV == "production" &&
      !semver.gte(action.meta.client.clientVersion, "2.4.0")
    ) {
      log("client upgrade required", {
        clientVersion: action.meta.client.clientVersion ?? "",
        requiresClientVersion: "2.4.0",
      });
      throw new Api.ApiError("client upgrade required", 426);
    }

    let isV1Upgrade = false;
    if (payload.provider == "email") {
      if (payload.hostType == "cloud" && payload.v1Upgrade) {
        isV1Upgrade = true;

        // if (
        //   (action.meta.client.clientName == "app" &&
        //     !semver.gte(action.meta.client.clientVersion, "2.4.8")) ||
        //   ((action.meta.client.clientName == "cli" ||
        //     action.meta.client.clientName == "core") &&
        //     !semver.gte(action.meta.client.clientVersion, "2.4.6"))
        // ) {
        //   log("client upgrade required", {
        //     clientVersion: action.meta.client.clientVersion ?? "",
        //     requiresClientVersion: {
        //       app: "2.4.8",
        //       cli: "2.4.6",
        //       core: "2.4.6",
        //     },
        //   });
        //   throw new Api.ApiError("client upgrade required", 426);
        // }
      } else if (payload.emailVerificationToken) {
        verifyTokenRes = await verifyEmailToken(
          email,
          payload.emailVerificationToken,
          "sign_up",
          now,
          transactionConn
        );
        if (!verifyTokenRes) {
          throw new Api.ApiError("email verification code invalid", 401);
        }
      } else {
        throw new Api.ApiError("email verification code required", 400);
      }
    } else if (payload.hostType == "cloud") {
      const verifyExternalAuthSessionRes = await verifyExternalAuthSession(
        payload.externalAuthSessionId,
        transactionConn
      );

      if (!verifyExternalAuthSessionRes) {
        throw new Api.ApiError("external auth session invalid", 401);
      } else {
        externalAuthSession = verifyExternalAuthSessionRes;
      }
    }

    const [userId, orgId, deviceId] = R.times(() => uuid(), 4),
      token = secureRandomAlphanumeric(22),
      environmentRoleIds = R.times(() => uuid(), 3),
      environmentRoles: Api.Db.EnvironmentRole[] = [
        {
          type: "environmentRole",
          id: environmentRoleIds[0],
          ...graphKey.environmentRole(orgId, environmentRoleIds[0]),
          defaultName: "Development",
          name: "Development",
          defaultDescription: "Default development environment",
          description: "Default development environment",
          isDefault: true,
          hasLocalKeys: true,
          hasServers: true,
          defaultAllApps: true,
          defaultAllBlocks: true,
          settings: { autoCommit: false },
          createdAt: now,
          updatedAt: now,
          orderIndex: 0,
        },
        {
          type: "environmentRole",
          id: environmentRoleIds[1],
          ...graphKey.environmentRole(orgId, environmentRoleIds[1]),
          defaultName: "Staging",
          name: "Staging",
          defaultDescription: "Default staging environment",
          description: "Default staging environment",
          isDefault: true,
          hasLocalKeys: false,
          hasServers: true,
          defaultAllApps: true,
          defaultAllBlocks: true,
          settings: { autoCommit: false },
          createdAt: now,
          updatedAt: now,
          orderIndex: 1,
        },
        {
          type: "environmentRole",
          id: environmentRoleIds[2],
          ...graphKey.environmentRole(orgId, environmentRoleIds[2]),
          defaultName: "Production",
          name: "Production",
          defaultDescription: "Default production environment",
          description: "Default production environment",
          isDefault: true,
          hasLocalKeys: false,
          hasServers: true,
          defaultAllApps: true,
          defaultAllBlocks: true,
          settings: { autoCommit: false },
          createdAt: now,
          updatedAt: now,
          orderIndex: 2,
        },
      ],
      [appDevId, appProdId, appAdminId, appOrgAdminId, appOrgOwnerId] = R.times(
        (i) => uuid(),
        5
      ),
      appRoles: Api.Db.AppRole[] = [
        {
          type: "appRole",
          id: appDevId,
          ...graphKey.appRole(orgId, appDevId),
          defaultName: "Developer",
          name: "Developer",
          defaultDescription:
            "Can view or update development and staging environments. Can see whether production variables are set, but can't read their values.",
          description:
            "Can view or update development and staging environments. Can see whether production variables are set, but can't read their values.",
          isDefault: true,
          hasFullEnvironmentPermissions: false,
          canHaveCliUsers: true,
          canManageAppRoleIds: [],
          canInviteAppRoleIds: [],
          defaultAllApps: true,
          createdAt: now,
          updatedAt: now,
          orderIndex: 4,
        },
        {
          type: "appRole",
          id: appProdId,
          ...graphKey.appRole(orgId, appProdId),
          defaultName: "DevOps",
          name: "DevOps",
          defaultDescription:
            "Can view or update development, staging, and production environments. Can manage servers. Can connect and disconnect blocks.",
          description:
            "Can view or update development, staging, and production environments. Can manage servers. Can connect and disconnect blocks.",
          isDefault: true,
          hasFullEnvironmentPermissions: false,
          canHaveCliUsers: true,
          canManageAppRoleIds: [],
          canInviteAppRoleIds: [],
          defaultAllApps: true,
          createdAt: now,
          updatedAt: now,
          orderIndex: 3,
        },
        {
          type: "appRole",
          id: appAdminId,
          ...graphKey.appRole(orgId, appAdminId),
          defaultName: "Admin",
          name: "Admin",
          defaultDescription:
            "Can view and update all environments. Can manage servers, manage users, manage CLI keys, and update app settings. Can connect and disconnect blocks. Can read app logs.",
          description:
            "Can view and update all environments. Can manage servers, manage users, manage CLI keys, and update app settings. Can connect and disconnect blocks. Can read app logs.",
          isDefault: true,
          canHaveCliUsers: true,
          canManageAppRoleIds: [appDevId, appProdId],
          canInviteAppRoleIds: [appDevId, appProdId, appAdminId],
          defaultAllApps: true,
          hasFullEnvironmentPermissions: true,
          createdAt: now,
          updatedAt: now,
          orderIndex: 2,
        },

        {
          type: "appRole",
          id: appOrgAdminId,
          ...graphKey.appRole(orgId, appOrgAdminId),
          defaultName: "Org Admin",
          name: "Org Admin",
          defaultDescription:
            "Can view and update all environments. Can manage servers, manage users, manage CLI keys, and update app settings. Can read app logs.",
          description:
            "Can view and update all environments. Can manage servers, manage users, manage CLI keys, and update app settings. Can read app logs.",
          isDefault: true,
          canHaveCliUsers: true,
          canManageAppRoleIds: [appDevId, appProdId, appAdminId],
          canInviteAppRoleIds: [appDevId, appProdId, appAdminId],
          hasFullEnvironmentPermissions: true,
          defaultAllApps: true,
          createdAt: now,
          updatedAt: now,
          orderIndex: 1,
        },

        {
          type: "appRole",
          id: appOrgOwnerId,
          ...graphKey.appRole(orgId, appOrgOwnerId),
          defaultName: "Org Owner",
          name: "Org Owner",
          defaultDescription:
            "Can view and update all environments. Can manage servers, manage users, manage CLI keys, and update app settings. Can read app logs.",
          description:
            "Can view and update all environments. Can manage servers, manage users, manage CLI keys, and update app settings. Can read app logs.",
          isDefault: true,
          canHaveCliUsers: true,
          canManageAppRoleIds: [appDevId, appProdId, appAdminId],
          canInviteAppRoleIds: [appDevId, appProdId, appAdminId],
          hasFullEnvironmentPermissions: true,
          defaultAllApps: true,
          createdAt: now,
          updatedAt: now,
          orderIndex: 0,
        },
      ],
      [basicUserId, orgAdminId, orgOwnerId] = R.times((i) => uuid(), 3),
      orgRoles: Api.Db.OrgRole[] = [
        {
          type: "orgRole",
          id: basicUserId,
          ...graphKey.orgRole(orgId, basicUserId),
          defaultName: "Basic User",
          name: "Basic User",
          defaultDescription: "Permissions are granted on a per-app basis",
          description: "Permissions are granted on a per-app basis.",
          isDefault: true,
          canHaveCliUsers: true,
          canManageOrgRoleIds: [],
          canInviteOrgRoleIds: [basicUserId],
          createdAt: now,
          updatedAt: now,
          orderIndex: 2,
        },
        {
          type: "orgRole",
          id: orgAdminId,
          ...graphKey.orgRole(orgId, orgAdminId),
          defaultName: "Org Admin",
          name: "Org Admin",
          defaultDescription:
            "Admin access to all apps and blocks. Can manage users and groups at org level. Can manage app and environment roles. Can manage org settings. Can read org logs.",
          description:
            "Admin access to all apps and blocks. Can manage users and groups at org level. Can manage app and environment roles. Can manage org settings. Can read org logs.",
          isDefault: true,
          canManageOrgRoleIds: [basicUserId],
          canInviteOrgRoleIds: [basicUserId, orgAdminId],
          canHaveCliUsers: true,
          autoAppRoleId: appOrgAdminId,
          createdAt: now,
          updatedAt: now,
          orderIndex: 1,
        },
        {
          type: "orgRole",
          id: orgOwnerId,
          ...graphKey.orgRole(orgId, orgOwnerId),
          defaultName: "Org Owner",
          name: "Org Owner",
          defaultDescription:
            "Total access. Can manage org settings, authentication settings, and billing, along with everything else.",
          description:
            "Total access. Can manage org settings, authentication settings, and billing, along with everything else.",
          isDefault: true,
          canManageAllOrgRoles: true,
          canInviteAllOrgRoles: true,
          canHaveCliUsers: false,
          autoAppRoleId: appOrgOwnerId,
          createdAt: now,
          updatedAt: now,
          orderIndex: 0,
        },
      ],
      appRoleEnvironmentRoles: Api.Db.AppRoleEnvironmentRole[] = appRoles
        .filter(R.complement(R.prop("hasFullEnvironmentPermissions")))
        .flatMap((appRole) => {
          return environmentRoles.map((environmentRole) => {
            const id = uuid();
            return {
              type: <const>"appRoleEnvironmentRole",
              id,
              ...graphKey.appRoleEnvironmentRole(orgId, id),
              appRoleId: appRole.id,
              environmentRoleId: environmentRole.id,
              permissions:
                Rbac.ENVIRONMENT_PERMISSIONS_BY_DEFAULT_ROLE[appRole.name][
                  environmentRole.name
                ],
              createdAt: now,
              updatedAt: now,
            };
          });
        }),
      org: Api.Db.Org = {
        type: "org",
        id: orgId,
        ...graphKey.org(orgId),
        name: payload.org.name.trim(),
        settings: payload.org.settings,
        graphUpdatedAt: now,
        replicatedAt: -1,
        serverEnvkeyCount: 0,
        deviceLikeCount: 1,
        activeUserOrInviteCount: 1,
        createdAt: now,
        updatedAt: now,
        creatorId: userId,
        selfHostedFailoverRegion:
          payload.hostType == "self-hosted"
            ? payload.selfHostedFailoverRegion
            : undefined,
        ...(env.IS_CLOUD ? { lifecycleEmailsEnabled: true } : {}),

        envUpdateRequiresClientVersion: "2.4.0",
        "upgradedCrypto-2.1.0": true,
        optimizeEmptyEnvs: true,
        importedFromV1: isV1Upgrade,
      },
      orgUserDevice: Api.Db.OrgUserDevice = {
        type: "orgUserDevice",
        id: deviceId,
        ...graphKey.orgUserDevice(orgId, userId, deviceId),
        userId,
        isRoot: true,
        name: payload.device.name,
        pubkey: payload.device.pubkey,
        pubkeyId: getPubkeyHash(payload.device.pubkey),
        signedTrustedRoot: payload.device.signedTrustedRoot,
        trustedRootUpdatedAt: now,
        pubkeyUpdatedAt: now,
        approvedByType: "creator",
        approvedAt: now,
        updatedAt: now,
        createdAt: now,
      },
      user: Api.Db.OrgUser = {
        ...R.pick(["provider"], payload),
        type: "orgUser",
        id: userId,
        ...graphKey.orgUser(orgId, userId),
        uid:
          payload.provider == "email"
            ? email
            : externalAuthSession!.externalUid!,
        externalAuthProviderId: externalAuthSession
          ? externalAuthSession.externalAuthProviderId
          : undefined,
        email,
        firstName: payload.user.firstName.trim(),
        lastName: payload.user.lastName.trim(),
        deviceIds: [deviceId],
        isCreator: true,
        orgRoleId: orgOwnerId,
        orgRoleUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
        ...(env.IS_CLOUD
          ? {
              // allows efficient processing of lifecycle emails in EnvKey Cloud
              tertiaryIndex: LIFECYCLE_EMAILS_ENABLED,
            }
          : {}),
      },
      authTokenProvider = externalAuthSession
        ? externalAuthSession.provider
        : "email",
      authToken: Api.Db.AuthToken = {
        type: "authToken",
        ...getAuthTokenKey(orgId, userId, deviceId, token),
        token,
        orgId,
        deviceId,
        userId,
        provider: authTokenProvider,
        uid: user.uid,
        externalAuthProviderId: externalAuthSession
          ? externalAuthSession.externalAuthProviderId
          : undefined,
        expiresAt: Date.now() + org.settings.auth.tokenExpirationMs,
        createdAt: now,
        updatedAt: now,
      },
      orgUserIdByEmail: Api.Db.OrgUserIdByEmail = {
        type: "userIdByEmail",
        email: user.email,
        userId: user.id,
        orgId,
        pkey: ["email", user.email].join("|"),
        skey: [orgId, user.id].join("|"),
        createdAt: now,
        updatedAt: now,
      },
      providerUid = [user.provider, user.externalAuthProviderId, user.uid]
        .filter(Boolean)
        .join("|"),
      orgUserIdByProviderUid: Api.Db.OrgUserIdByProviderUid = {
        type: "userIdByProviderUid",
        providerUid,
        userId: user.id,
        orgId,
        pkey: ["provider", providerUid].join("|"),
        skey: orgId,
        createdAt: now,
        updatedAt: now,
      };

    let transactionItems: Api.Db.ObjectTransactionItems = {
      puts: [
        org,
        user,
        orgUserDevice,
        authToken,
        orgUserIdByEmail,
        orgUserIdByProviderUid,
        ...orgRoles,
        ...environmentRoles,
        ...appRoles,
        ...appRoleEnvironmentRoles,
      ],
    };

    if (externalAuthSession) {
      const res = getCreateExternalAuthProviderWithTransactionItems(
        externalAuthSession,
        org.id,
        user.id,
        now
      );

      if (res) {
        const [_, externalAuthProviderTransactItems] = res;
        transactionItems = mergeObjectTransactionItems([
          transactionItems,
          externalAuthProviderTransactItems,
        ]);
      } else {
        transactionItems.softDeleteKeys = [
          R.pick(["pkey", "skey"], externalAuthSession),
        ];

        transactionItems.puts!.push({
          ...externalAuthSession,
          orgId: org.id,
          userId: user.id,
          updatedAt: now,
        } as Api.Db.ExternalAuthSession);
      }
    }

    if (verifyTokenRes) {
      transactionItems = mergeObjectTransactionItems([
        transactionItems,
        verifyTokenRes,
      ]);
    }

    let orgGraph: Api.Graph.OrgGraph = R.indexBy(R.prop("id"), [
      org,
      user,
      orgUserDevice,
      ...orgRoles,
      ...environmentRoles,
      ...appRoles,
      ...appRoleEnvironmentRoles,

      ...(env.IS_CLOUD
        ? await query<Api.Db.Product | Api.Db.Price>({
            pkey: "billing",
            transactionConn,
          })
        : []),
    ]);

    if (initOrgStatsFn) {
      await initOrgStatsFn(orgId, now, transactionConn);
    }

    if (initBillingFn && !payload.test) {
      log("REGISTER - is v1 upgrade", { org, user, now, payload });

      const initBillingRes = await initBillingFn(
        transactionConn,
        org,
        user,
        orgGraph,
        now,
        "v1Upgrade" in payload && payload.v1Upgrade
          ? payload.v1Upgrade
          : undefined
      );

      orgGraph = initBillingRes[0];

      transactionItems = mergeObjectTransactionItems([
        transactionItems,
        initBillingRes[1],
      ]);
    }

    const userGraph = getApiUserGraph(orgGraph, orgId, userId, deviceId, now);

    return {
      type: "handlerResult",
      response: {
        type: "tokenSession",
        orgId,
        token: authToken.token,
        provider: authToken.provider,
        ...pick(["uid", "email", "firstName", "lastName"], user),
        userId: user.id,
        deviceId: orgUserDevice.id,
        orgUserDeviceId: orgUserDevice.id,
        graph: userGraph,
        graphUpdatedAt: now,
        timestamp: now,
        ...(env.IS_CLOUD
          ? {
              hostType: <const>"cloud",
            }
          : {
              hostType: <const>"self-hosted",
              deploymentTag: env.DEPLOYMENT_TAG!,
            }),
      },
      transactionItems,
      logTargetIds: [],
    };
  },
});

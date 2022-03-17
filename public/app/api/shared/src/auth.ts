import { sha256 } from "@core/lib/crypto/utils";
import { getOrg, getOrgUser } from "./models/orgs";
import { Api, Auth, Rbac, Model, Client, Crypto, Blob } from "@core/types";
import { getDb, query } from "./db";
import {
  getActiveEmailVerification,
  verifyEmailVerificationTransactionItems,
} from "./models/email_verifications";
import { getAuthToken } from "./models/auth_tokens";
import {
  getEnvironmentPermissions,
  getEnvParentPermissions,
  getConnectedAppPermissionsIntersectionForBlock,
  getAppRoleForUserOrInvitee,
  getOrgPermissions,
  getAppPermissions,
} from "@core/lib/graph";
import * as R from "ramda";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { pick } from "@core/lib/utils/object";
import { validate as uuidValidate } from "uuid";
import { mustGetScimProvider } from "./models/provisioning";
import { wait } from "@core/lib/utils/wait";
import { PoolConnection } from "mysql2/promise";
import { env } from "./env";
import { ipMatchesAny } from "@core/lib/utils/ip";
import { log } from "@core/lib/utils/logger";

let getOrgStatsFn: (
  orgId: string,
  transactionConn: PoolConnection,
  includeActiveConnections?: boolean
) => Promise<Model.OrgStats> | undefined;
export const registerGetOrgStatsFn = (fn: typeof getOrgStatsFn) => {
  getOrgStatsFn = fn;
};

export const getOrgStats = async (
  orgId: string,
  transactionConn: PoolConnection,
  includeActiveConnections?: boolean
) => {
  return getOrgStatsFn
    ? getOrgStatsFn(orgId, transactionConn, includeActiveConnections)
    : undefined;
};

// any request that is authenticated runs through this
export const authenticate = async <
    T extends Auth.AuthContext = Auth.AuthContext
  >(
    params: Auth.ApiAuthParams,
    transactionConn: PoolConnection,
    ip: string,
    isSocketConnection?: boolean
  ): Promise<T> => {
    const now = Date.now();

    let shouldHaveAuthToken = false,
      authToken: Api.Db.AuthToken | undefined,
      user: Api.Db.OrgUser | Api.Db.CliUser | undefined,
      org: Api.Db.Org | undefined,
      shouldHaveOrgUserDevice = false,
      orgUserDevice: Api.Db.OrgUserDevice | undefined,
      invite: Api.Db.Invite | undefined,
      deviceGrant: Api.Db.DeviceGrant | undefined,
      recoveryKey: Api.Db.RecoveryKey | undefined,
      orgStats: Model.OrgStats | undefined;

    switch (params.type) {
      case "tokenAuthParams":
        shouldHaveAuthToken = true;
        shouldHaveOrgUserDevice = true;

        [authToken, user, org, orgStats, orgUserDevice] = await Promise.all([
          getAuthToken(
            params.orgId,
            params.userId,
            params.deviceId,
            params.token,
            transactionConn
          ),
          getOrgUser(params.orgId, params.userId, transactionConn),
          getOrg(params.orgId, transactionConn),
          getOrgStats(params.orgId, transactionConn, isSocketConnection),
          getDb<Api.Db.OrgUserDevice>(params.deviceId, { transactionConn }),
        ]);
        break;
      case "cliAuthParams":
        [user, org, orgStats] = await Promise.all([
          getDb<Api.Db.CliUser>(params.userId, { transactionConn }),
          getOrg(params.orgId, transactionConn),
          getOrgStats(params.orgId, transactionConn, isSocketConnection),
        ]);
        break;
      case "loadInviteAuthParams":
      case "acceptInviteAuthParams":
        if (!params.emailToken) {
          throw new Api.ApiError("not found", 404);
        }

        const invitePointer = await getDb<Api.Db.InvitePointer>(
          {
            pkey: ["invite", params.identityHash].join("|"),
            skey: params.emailToken,
          },
          { transactionConn }
        );

        if (
          !invitePointer ||
          sha256(params.emailToken) !== sha256(invitePointer.skey)
        ) {
          throw new Api.ApiError("not found", 404);
        }

        [org, orgStats, invite] = await Promise.all([
          getOrg(invitePointer.orgId, transactionConn),
          getOrgStats(invitePointer.orgId, transactionConn, isSocketConnection),
          getDb<Api.Db.Invite>(invitePointer.inviteId, { transactionConn }),
        ]);

        if (!invite || invite.deletedAt || invite.acceptedAt) {
          throw new Api.ApiError("not found", 404);
        }

        if (now >= invite.expiresAt) {
          throw new Api.ApiError("invite expired", 401);
        }

        user = await getOrgUser(
          invitePointer.orgId,
          invite.inviteeId,
          transactionConn
        );
        break;
      case "loadDeviceGrantAuthParams":
      case "acceptDeviceGrantAuthParams":
        if (!params.emailToken) {
          throw new Api.ApiError("not found", 404);
        }

        const deviceGrantPointer = await getDb<Api.Db.DeviceGrantPointer>(
          {
            pkey: ["deviceGrant", params.identityHash].join("|"),
            skey: params.emailToken,
          },
          { transactionConn }
        );

        if (
          !deviceGrantPointer ||
          sha256(params.emailToken) !== sha256(deviceGrantPointer.skey)
        ) {
          throw new Api.ApiError("not found", 404);
        }

        [org, orgStats, deviceGrant] = await Promise.all([
          getOrg(deviceGrantPointer.orgId, transactionConn),
          getOrgStats(
            deviceGrantPointer.orgId,
            transactionConn,
            isSocketConnection
          ),
          getDb<Api.Db.DeviceGrant>(deviceGrantPointer.deviceGrantId, {
            transactionConn,
          }),
        ]);

        if (!deviceGrant || deviceGrant.deletedAt || deviceGrant.acceptedAt) {
          throw new Api.ApiError("not found", 404);
        }

        if (now >= deviceGrant.expiresAt) {
          throw new Api.ApiError("deviceGrant expired", 401);
        }

        user = await getOrgUser(
          deviceGrantPointer.orgId,
          deviceGrant.granteeId,
          transactionConn
        );
        break;

      case "loadRecoveryKeyAuthParams":
      case "redeemRecoveryKeyAuthParams":
        const recoveryKeyPointer = await getDb<Api.Db.RecoveryKeyPointer>(
          {
            pkey: ["recoveryKey", params.identityHash].join("|"),
            skey: "recoveryKeyPointer",
          },
          { transactionConn }
        );

        if (!recoveryKeyPointer) {
          throw new Api.ApiError("not found", 404);
        }

        [org, orgStats, recoveryKey] = await Promise.all([
          getOrg(recoveryKeyPointer.orgId, transactionConn),
          getOrgStats(
            recoveryKeyPointer.orgId,
            transactionConn,
            isSocketConnection
          ),
          getDb<Api.Db.RecoveryKey>(recoveryKeyPointer.recoveryKeyId, {
            transactionConn,
          }),
        ]);

        if (!recoveryKey || recoveryKey.deletedAt || recoveryKey.redeemedAt) {
          throw new Api.ApiError("not found", 404);
        }

        user = await getOrgUser(
          recoveryKeyPointer.orgId,
          recoveryKey.userId,
          transactionConn
        );
        break;

      case "bearerTokenAuthParams":
        if (!params.secret) {
          throw new Api.ApiError(
            "This request requires a Bearer token in the Authorization header",
            401
          );
        }
        const provisioningProvider = await mustGetScimProvider(
          params.providerId,
          transactionConn
        );
        if (provisioningProvider.deletedAt) {
          throw new Api.ApiError("Provider deleted", 410);
        }
        [org, orgStats] = await Promise.all([
          getOrg(provisioningProvider.orgId, transactionConn),
          getOrgStats(
            provisioningProvider.orgId,
            transactionConn,
            isSocketConnection
          ),
        ]);
        if (!org || org?.deletedAt) {
          throw new Api.ApiError("Provider org not found", 404);
        }
        if (env.IS_CLOUD && !orgStats) {
          throw new Api.ApiError("Provider org stats not found", 404);
        }
        if (provisioningProvider.authSecretHash !== sha256(params.secret)) {
          await wait(500);
          throw new Api.ApiError("invalid bearer token credentials", 401);
        }

        const license = verifySignedLicense(
          org.id,
          org.signedLicense,
          now,
          false
        );

        return {
          type: "provisioningBearerAuthContext",
          org,
          license,
          orgStats,
          provisioningProvider,
        } as T;
    }

    if (!org || org.deletedAt) {
      throw new Api.ApiError("org not found", 404);
    }
    if (org.localIpsAllowed) {
      if (!ipMatchesAny(ip, org.localIpsAllowed)) {
        throw new Api.ApiError("ip not permitted", 401);
      }
    }

    if (!user || user.deletedAt || user.deactivatedAt) {
      throw new Api.ApiError("user not found", 404);
    }

    if (
      shouldHaveOrgUserDevice &&
      (!orgUserDevice || orgUserDevice.deletedAt || orgUserDevice.deactivatedAt)
    ) {
      throw new Api.ApiError("device not found", 404);
    }

    if (env.IS_CLOUD && !orgStats) {
      throw new Api.ApiError("org stats not found", 404);
    }

    if (shouldHaveAuthToken) {
      if (!authToken || authToken.deletedAt) {
        throw new Api.ApiError("token invalid", 401);
      }

      const now = Date.now(),
        expires = authToken.expiresAt;

      if (now >= expires) {
        throw new Api.ApiError("token expired", 401);
      }
    }

    if (
      (user.type == "orgUser" &&
        (!(
          user.isCreator ||
          user.inviteAcceptedAt ||
          [
            "loadInviteAuthParams",
            "acceptInviteAuthParams",
            "loadDeviceGrantAuthParams",
            "acceptDeviceGrantAuthParams",
          ].includes(params.type)
        ) ||
          (orgUserDevice && !user.deviceIds.includes(orgUserDevice.id)))) ||
      (shouldHaveOrgUserDevice &&
        (!orgUserDevice ||
          orgUserDevice.deletedAt ||
          orgUserDevice.deactivatedAt ||
          !orgUserDevice.approvedAt ||
          !orgUserDevice.pubkey))
    ) {
      throw new Api.ApiError("invalid credentials", 401);
    }

    let signature: string | undefined,
      signedData: string[] | undefined,
      pubkey: Crypto.Pubkey | undefined;

    if (params.type == "tokenAuthParams" && orgUserDevice) {
      signature = params.signature;
      signedData = R.props(
        ["token", "userId", "orgId", "deviceId"],
        params
      ) as string[];
      pubkey = orgUserDevice.pubkey!;
    } else if (params.type == "cliAuthParams" && user.type == "cliUser") {
      signature = params.signature;
      signedData = R.props(["userId", "orgId"], params) as string[];
      pubkey = user.pubkey;
    } else if (params.type == "acceptInviteAuthParams" && invite) {
      signature = params.signature;
      signedData = R.props(["identityHash", "emailToken"], params) as string[];
      pubkey = invite.pubkey;
    } else if (params.type == "acceptDeviceGrantAuthParams" && deviceGrant) {
      signature = params.signature;
      signedData = R.props(["identityHash", "emailToken"], params) as string[];
      pubkey = deviceGrant.pubkey;
    } else if (params.type == "redeemRecoveryKeyAuthParams" && recoveryKey) {
      signature = params.signature;
      signedData = R.props(["identityHash"], params) as string[];
      pubkey = recoveryKey.pubkey;
    }

    if (
      signature &&
      (!signedData ||
        !pubkey ||
        !nacl.sign.detached.verify(
          naclUtil.decodeUTF8(JSON.stringify(signedData)),
          naclUtil.decodeBase64(signature),
          naclUtil.decodeBase64(pubkey.keys.signingKey)
        ))
    ) {
      throw new Api.ApiError("invalid signature", 401);
    }

    const orgRoleId = user.orgRoleId,
      orgRoles = await query<Api.Db.OrgRole>({
        pkey: org.id,
        scope: "g|orgRole|",
        transactionConn,
      }),
      orgRolesById = R.indexBy(R.prop("id"), orgRoles),
      orgRole = orgRolesById[orgRoleId],
      orgPermissions = getOrgPermissions(orgRolesById, orgRoleId);

    const license = verifySignedLicense(org.id, org.signedLicense, now, false);

    switch (params.type) {
      case "tokenAuthParams":
        return {
          type: "tokenAuthContext",
          org,
          orgStats,
          license,
          user: user as Api.Db.OrgUser,
          orgRole,
          orgPermissions,
          orgUserDevice: orgUserDevice!,
          authToken: authToken!,
        } as T;

      case "cliAuthParams":
        return {
          type: "cliUserAuthContext",
          org,
          orgStats,
          license,
          user: user as Api.Db.CliUser,
          orgRole,
          orgPermissions,
        } as T;

      case "loadInviteAuthParams":
      case "acceptInviteAuthParams":
        return {
          type: "inviteAuthContext",
          org,
          orgStats,
          license,
          user: user as Api.Db.OrgUser,
          orgRole,
          orgPermissions,
          invite: invite!,
        } as T;

      case "loadDeviceGrantAuthParams":
      case "acceptDeviceGrantAuthParams":
        return {
          type: "deviceGrantAuthContext",
          org,
          orgStats,
          license,
          user: user as Api.Db.OrgUser,
          orgRole,
          orgPermissions,
          deviceGrant: deviceGrant!,
        } as T;

      case "loadRecoveryKeyAuthParams":
      case "redeemRecoveryKeyAuthParams":
        return {
          type: "recoveryKeyAuthContext",
          org,
          orgStats,
          license,
          user: user as Api.Db.OrgUser,
          orgRole,
          orgPermissions,
          recoveryKey: recoveryKey!,
        } as T;
    }
  },
  verifyEmailToken = async (
    email: string,
    token: string,
    authType: Api.Db.EmailVerification["authType"],
    now: number,
    transactionConn: PoolConnection
  ) => {
    const emailVerification = await getActiveEmailVerification(
      email,
      token,
      transactionConn
    );
    if (
      !emailVerification ||
      emailVerification.deletedAt ||
      emailVerification.verifiedAt ||
      emailVerification.authType != authType
    ) {
      return false;
    }

    const expires = emailVerification.expiresAt;

    if (now >= expires) {
      return false;
    }

    const transactionItems = await verifyEmailVerificationTransactionItems(
      emailVerification,
      now
    );

    return transactionItems;
  },
  getExternalAuthSession = async (
    externalAuthSessionId: string,
    transactionConn: PoolConnection
  ): Promise<Api.Db.ExternalAuthSession | undefined> => {
    // in this func, guard against unknown inputs scraping data from pkey

    if (!uuidValidate(externalAuthSessionId)) {
      const err = new Error(
        `Invalid externalAuthSessionId`
      ) as NodeJS.ErrnoException;
      err.code = "400";
      throw err;
    }

    const externalAuthSessions = await query<Api.Db.ExternalAuthSession>({
      pkey: externalAuthSessionId,
      limit: 1,
      transactionConn,
    });
    if (externalAuthSessions?.[0]?.type !== "externalAuthSession") {
      return undefined;
    }
    return externalAuthSessions[0];
  },
  verifyExternalAuthSession = async (
    externalAuthSessionId: string,
    transactionConn: PoolConnection
  ) => {
    const externalAuthSession = await getExternalAuthSession(
      externalAuthSessionId,
      transactionConn
    );

    return externalAuthSession?.verifiedAt ? externalAuthSession : undefined;
  },
  resolveEndpointProtocol = (endpoint: string) =>
    endpoint.match(/^https?:\/\//) ? endpoint : `http://${endpoint}`,
  getProviderSettings = (
    externalAuthSession: Api.Db.ExternalAuthSession,
    externalAuthProvider?: Api.Db.ExternalAuthProvider
  ) => {
    if (externalAuthSession.provider === "saml") {
      throw new TypeError("SAML does not have OAuth providerSettings");
    }
    if (externalAuthSession.authMethod == "oauth_hosted") {
      const isSignUpOrListInvitableUsers =
        externalAuthSession.authType == "sign_up" ||
        (externalAuthSession.authType == "invite_users" &&
          externalAuthSession.inviteExternalAuthUsersType == "initial");
      if (
        isSignUpOrListInvitableUsers &&
        "providerSettings" in externalAuthSession
      ) {
        return externalAuthSession.providerSettings as Api.Db.HostedOauthProviderSettings;
      }
      if (externalAuthProvider && "providerSettings" in externalAuthProvider) {
        return externalAuthProvider.providerSettings as Api.Db.HostedOauthProviderSettings;
      }
    }
  },
  parseLinks = (linkHeader: string) =>
    linkHeader.split(",").reduce((agg, part) => {
      const section = part.split(";"),
        url = section[0].match(/<(.*)>/)![1],
        name = section[1].match(/rel="(.*)"/)![1];
      return { ...agg, [name]: url };
    }, {} as { [name: string]: string }),
  authorizeEnvsUpdate = (
    userGraph: Client.Graph.UserGraph,
    auth: Auth.UserAuthContext,
    action: Api.Action.GraphAction
  ): boolean => {
    const envParams = action.payload as Api.Net.EnvParams,
      { keys, blobs, encryptedByTrustChain } = envParams,
      keyableParentEnvs = keys.keyableParents,
      blockKeyableParentEnvs = keys.blockKeyableParents,
      userEnvs = keys.users,
      newDeviceEnvs = keys.newDevice;

    if (userEnvs) {
      for (let userId in userEnvs) {
        let accessParams: Model.AccessParams | undefined;
        if (action.type == Api.ActionType.GRANT_APP_ACCESS) {
          const { orgRoleId } = userGraph[userId] as Model.OrgUser;
          accessParams = {
            orgRoleId,
            appUserGrants: [pick(["appId", "appRoleId"], action.payload)],
          };
        }

        for (let deviceId in userEnvs[userId]) {
          const deviceEnvParams = userEnvs[userId][deviceId];
          for (let envParentId in deviceEnvParams) {
            const { environments, locals } = deviceEnvParams[envParentId];

            for (let environmentId in environments) {
              const update = environments[environmentId];

              if (
                !authorizeEnvUpdate(
                  userGraph,
                  auth,
                  action,
                  update,
                  environmentId,
                  accessParams ? undefined : userId,
                  accessParams ? undefined : deviceId,
                  accessParams
                )
              ) {
                return false;
              }
            }

            for (let localsUserId in locals) {
              const update = locals[localsUserId];
              if (
                !authorizeLocalsEncryptedKeyUpdate(
                  userGraph,
                  auth,
                  action,
                  update,
                  envParentId,
                  localsUserId,
                  accessParams ? undefined : userId,
                  accessParams ? undefined : deviceId,
                  accessParams
                )
              ) {
                return false;
              }
            }
          }
        }
      }
    }

    if (keyableParentEnvs) {
      if (!encryptedByTrustChain) {
        return false;
      }

      for (let keyableParentId in keyableParentEnvs) {
        const update = keyableParentEnvs[keyableParentId],
          keyableParent = userGraph[keyableParentId] as
            | Model.KeyableParent
            | undefined;
        if (!keyableParent) {
          return false;
        }

        if (
          !authorizeKeyableParentUpdate(
            userGraph,
            auth,
            action,
            keyableParent,
            update
          )
        ) {
          return false;
        }
      }
    }

    if (blockKeyableParentEnvs) {
      if (!encryptedByTrustChain) {
        return false;
      }

      for (let blockId in blockKeyableParentEnvs) {
        const block = userGraph[blockId] as Model.Block | undefined;
        if (!block) {
          return false;
        }
        for (let keyableParentId in blockKeyableParentEnvs[blockId]) {
          const update = blockKeyableParentEnvs[blockId][keyableParentId],
            keyableParent = userGraph[keyableParentId] as
              | Model.KeyableParent
              | undefined;
          if (!keyableParent) {
            return false;
          }

          if (
            !authorizeKeyableParentUpdate(
              userGraph,
              auth,
              action,
              keyableParent,
              update,
              blockId
            )
          ) {
            return false;
          }
        }
      }
    }

    if (newDeviceEnvs) {
      let userId: string | undefined,
        deviceId: string | undefined,
        accessParams: Model.AccessParams | undefined;

      switch (action.type) {
        case Api.ActionType.CREATE_INVITE:
          accessParams = {
            appUserGrants: action.payload.appUserGrants,
            userGroupIds: action.payload.userGroupIds,
            orgRoleId: action.payload.user.orgRoleId,
          };
          break;
        case Api.ActionType.CREATE_DEVICE_GRANT:
          userId = action.payload.granteeId;
          break;

        case Api.ActionType.CREATE_CLI_USER:
          accessParams = {
            appUserGrants: action.payload.appUserGrants,
            orgRoleId: action.payload.orgRoleId,
          };
          break;
        case Api.ActionType.ACCEPT_INVITE:
        case Api.ActionType.ACCEPT_DEVICE_GRANT:
        case Api.ActionType.CREATE_RECOVERY_KEY:
        case Api.ActionType.REDEEM_RECOVERY_KEY:
          userId = auth.user.id;
          break;
      }

      for (let envParentId in newDeviceEnvs) {
        const { environments, locals } = newDeviceEnvs[envParentId];

        for (let environmentId in environments) {
          const update = environments[environmentId];

          if (
            !authorizeEnvUpdate(
              userGraph,
              auth,
              action,
              update,
              environmentId,
              userId,
              deviceId,
              accessParams
            )
          ) {
            return false;
          }
        }

        for (let localsUserId in locals) {
          const update = locals[localsUserId];
          if (
            !authorizeLocalsEncryptedKeyUpdate(
              userGraph,
              auth,
              action,
              update,
              envParentId,
              localsUserId,
              userId,
              deviceId,
              accessParams
            )
          ) {
            return false;
          }
        }
      }
    }

    if (blobs) {
      for (let envParentId in blobs) {
        const envParent = userGraph[envParentId] as Model.EnvParent | undefined;
        if (!envParent) {
          return false;
        }
        const { environments, locals } = blobs[envParentId];

        for (let environmentId in environments) {
          if (
            !getEnvironmentPermissions(
              userGraph,
              environmentId,
              auth.user.id
            ).has("write")
          ) {
            return false;
          }

          const {
            env,
            meta,
            inherits,
            inheritanceOverrides,
            changesets,
            changesetsById,
          } = environments[environmentId];

          if (
            !(
              (env && meta && inherits && (changesets || changesetsById)) ||
              inheritanceOverrides
            )
          ) {
            return false;
          }
        }

        const currentUserCanWriteOrgBlock =
          envParent.type == "block" &&
          auth.orgPermissions.has("blocks_write_envs_all");
        for (let localsUserId in locals) {
          if (
            !(
              localsUserId == auth.user.id ||
              currentUserCanWriteOrgBlock ||
              getEnvParentPermissions(userGraph, envParentId, auth.user.id).has(
                "app_write_user_locals"
              )
            )
          ) {
            return false;
          }

          const { env, meta, changesets, changesetsById } =
            locals[localsUserId];

          if (!(env || meta) || !(changesets || changesetsById)) {
            return false;
          }
        }
      }
    }

    return true;
  };

const authorizeEnvUpdate = (
    userGraph: Client.Graph.UserGraph,
    auth: Auth.UserAuthContext,
    action: Api.Action.RequestAction,
    update: Api.Net.UserEnvUpdate | Blob.UserEnvSet,
    environmentId: string,
    userId?: string,
    deviceId?: string,
    accessParams?: Model.AccessParams
  ): boolean => {
    if (!(userId || accessParams)) {
      return false;
    }

    if (userId && deviceId) {
      const inviteOrGrantOrRecoveryKey = userGraph[deviceId] as
          | Model.Invite
          | Model.DeviceGrant
          | Model.RecoveryKey
          | undefined,
        user = userGraph[userId] as Model.CliUser | Model.OrgUser,
        cliUser = user.type == "cliUser" ? user : undefined;
      let orgUserDevice: Model.OrgUserDevice | undefined;

      if (!inviteOrGrantOrRecoveryKey && !cliUser) {
        orgUserDevice = userGraph[deviceId] as Model.OrgUserDevice;
      }

      if (
        !(inviteOrGrantOrRecoveryKey || inviteOrGrantOrRecoveryKey || cliUser)
      ) {
        return false;
      }

      if (cliUser && deviceId != "cli") {
        return false;
      }

      if (
        inviteOrGrantOrRecoveryKey &&
        inviteOrGrantOrRecoveryKey.type == "recoveryKey"
      ) {
        const orgUser = userGraph[userId] as Model.OrgUser;
        if (!orgUser) {
          return false;
        }

        const orgRole = userGraph[orgUser.orgRoleId] as Rbac.OrgRole;
        if (
          !getOrgPermissions(userGraph, orgRole.id).has(
            "org_generate_recovery_key"
          )
        ) {
          return false;
        }
      }
    }

    const environment = userGraph[environmentId] as
      | Model.Environment
      | undefined;
    if (!environment) {
      return false;
    }

    if (
      !(
        update.env ||
        update.meta ||
        update.inherits ||
        update.inheritanceOverrides
      )
    ) {
      return false;
    }

    const currentUserPermissions = getEnvironmentPermissions(
        userGraph,
        environmentId,
        auth.user.id
      ),
      targetUserPermissions = getEnvironmentPermissions(
        userGraph,
        environmentId,
        userId,
        accessParams
      ),
      currentUserCanWriteEnv =
        action.type == Api.ActionType.ACCEPT_INVITE ||
        action.type == Api.ActionType.ACCEPT_DEVICE_GRANT ||
        action.type == Api.ActionType.REDEEM_RECOVERY_KEY ||
        action.type == Api.ActionType.CREATE_RECOVERY_KEY ||
        action.type == Api.ActionType.CREATE_INVITE ||
        action.type == Api.ActionType.CREATE_DEVICE_GRANT ||
        action.type == Api.ActionType.CREATE_CLI_USER ||
        currentUserPermissions.has("write");

    if (
      (update.env || update.meta || update.inherits) &&
      !currentUserCanWriteEnv
    ) {
      return false;
    }

    if (
      update.env &&
      (!currentUserPermissions.has("read") ||
        !targetUserPermissions.has("read"))
    ) {
      return false;
    } else if (
      update.meta &&
      (!currentUserPermissions.has("read_meta") ||
        !targetUserPermissions.has("read_meta"))
    ) {
      return false;
    } else if (
      update.inherits &&
      (!currentUserPermissions.has("read_inherits") ||
        !targetUserPermissions.has("read_inherits"))
    ) {
      return false;
    }

    if (
      (("changesets" in update && update.changesets) ||
        ("changesetsById" in update && update.changesetsById)) &&
      (!currentUserPermissions.has("read_history") ||
        !targetUserPermissions.has("read_history"))
    ) {
      return false;
    }

    if (update.inheritanceOverrides && update.inheritanceOverrides !== true) {
      if (
        !currentUserPermissions.has("read") ||
        !targetUserPermissions.has("read")
      ) {
        return false;
      }

      const inheritsEnvironmentIds = Array.isArray(update.inheritanceOverrides)
        ? update.inheritanceOverrides
        : Object.keys(update.inheritanceOverrides);

      for (let inheritsEnvironmentId of inheritsEnvironmentIds) {
        const currentUserOverridePermissions = getEnvironmentPermissions(
          userGraph,
          inheritsEnvironmentId,
          auth.user.id
        );

        if (
          action.type == Api.ActionType.CONNECT_BLOCK &&
          !currentUserOverridePermissions.has("read")
        ) {
          return false;
        } else if (
          action.type != Api.ActionType.ACCEPT_INVITE &&
          action.type != Api.ActionType.ACCEPT_DEVICE_GRANT &&
          action.type != Api.ActionType.REDEEM_RECOVERY_KEY &&
          action.type != Api.ActionType.CREATE_RECOVERY_KEY &&
          action.type != Api.ActionType.CREATE_INVITE &&
          action.type != Api.ActionType.CREATE_DEVICE_GRANT &&
          action.type != Api.ActionType.CREATE_CLI_USER &&
          !currentUserOverridePermissions.has("write")
        ) {
          return false;
        }
      }
    }

    return true;
  },
  authorizeLocalsEncryptedKeyUpdate = (
    userGraph: Client.Graph.UserGraph,
    auth: Auth.UserAuthContext,
    action: Api.Action.RequestAction,
    update: Api.Net.LocalsUpdate | Omit<Blob.UserEnvSet, "meta" | "inherits">,
    envParentId: string,
    localsUserId: string,
    userId?: string,
    deviceId?: string,
    accessParams?: Model.AccessParams
  ): boolean => {
    if (!(userId || accessParams)) {
      return false;
    }

    const envParent = userGraph[envParentId] as
      | Model.App
      | Model.Block
      | undefined;
    if (!envParent) {
      return false;
    }

    let targetUserOrgRoleId: string;
    if (userId) {
      targetUserOrgRoleId = (userGraph[userId] as Model.CliUser | Model.OrgUser)
        .orgRoleId;
    } else {
      targetUserOrgRoleId = accessParams!.orgRoleId;
    }
    const targetUserOrgPermissions = getOrgPermissions(
        userGraph,
        targetUserOrgRoleId
      ),
      currentUserCanWriteOrgBlock =
        envParent.type == "block" &&
        auth.orgPermissions.has("blocks_write_envs_all"),
      targetUserCanReadOrgBlock =
        envParent.type == "block" &&
        targetUserOrgPermissions.has("blocks_read_all");

    if (userId && deviceId) {
      const inviteOrGrantOrRecoveryKey = userGraph[deviceId] as
          | Model.Invite
          | Model.DeviceGrant
          | Model.RecoveryKey
          | undefined,
        user = userGraph[userId] as Model.OrgUser | Model.CliUser,
        cliUser = user.type == "cliUser" ? user : undefined;
      let orgUserDevice: Model.OrgUserDevice | undefined;

      if (!inviteOrGrantOrRecoveryKey && !cliUser) {
        orgUserDevice = userGraph[deviceId] as Model.OrgUserDevice;
      }

      if (!(inviteOrGrantOrRecoveryKey || orgUserDevice || cliUser)) {
        return false;
      }

      if (cliUser && deviceId != "cli") {
        return false;
      }

      if (
        inviteOrGrantOrRecoveryKey &&
        inviteOrGrantOrRecoveryKey.type == "recoveryKey"
      ) {
        const orgUser = userGraph[userId] as Model.OrgUser;
        if (!orgUser) {
          return false;
        }

        const orgRole = userGraph[orgUser.orgRoleId] as Rbac.OrgRole;
        if (
          !getOrgPermissions(userGraph, orgRole.id).has(
            "org_generate_recovery_key"
          )
        ) {
          return false;
        }
      }
    }

    const currentUserPermissions = getEnvParentPermissions(
        userGraph,
        envParentId,
        auth.user.id
      ),
      userPermissions = getEnvParentPermissions(
        userGraph,
        envParentId,
        userId,
        accessParams
      );
    // users can always read and write their own locals as long as they
    // have any access to the block
    if (
      !(userId == localsUserId && userPermissions.has("app_read_own_locals")) &&
      !(
        auth.user.id == localsUserId &&
        currentUserPermissions.has("app_read_own_locals")
      ) &&
      !(
        (currentUserPermissions.has("app_write_user_locals") ||
          currentUserCanWriteOrgBlock) &&
        (userPermissions.has("app_read_user_locals") ||
          targetUserCanReadOrgBlock)
      )
    ) {
      return false;
    }

    if (
      ("changesets" in update && update.changesets) ||
      ("changesetsById" in update && update.changesetsById)
    ) {
      if (
        !(
          userId == localsUserId && userPermissions.has("app_read_own_locals")
        ) &&
        !(
          auth.user.id == localsUserId &&
          currentUserPermissions.has("app_read_own_locals")
        ) &&
        !(
          userPermissions.has("app_read_user_locals_history") ||
          targetUserCanReadOrgBlock
        )
      ) {
        return false;
      }
    }

    return true;
  },
  authorizeKeyableParentUpdate = (
    userGraph: Client.Graph.UserGraph,
    auth: Auth.UserAuthContext,
    action: Api.Action.GraphAction,
    keyableParent: Model.KeyableParent,
    update: Api.Net.GeneratedEnvkeyEncryptedKeyParams | Blob.GeneratedEnvkeySet,
    blockId?: string
  ): boolean => {
    const currentUserPermissions = getEnvironmentPermissions(
      userGraph,
      keyableParent.environmentId,
      auth.user.id
    );

    if (update.env) {
      if (!currentUserPermissions.has("write")) {
        return false;
      }
    }

    if (update.subEnv) {
      if (!currentUserPermissions.has("write_branches")) {
        return false;
      }
    }

    if (update.inheritanceOverrides && update.inheritanceOverrides !== true) {
      const environmentIds = Array.isArray(update.inheritanceOverrides)
        ? update.inheritanceOverrides
        : Object.keys(update.inheritanceOverrides);

      for (let environmentId of environmentIds) {
        const currentUserOverridePermissions = getEnvironmentPermissions(
          userGraph,
          environmentId,
          auth.user.id
        );

        if (
          (action.type == Api.ActionType.GENERATE_KEY ||
            action.type == Api.ActionType.CONNECT_BLOCK) &&
          !currentUserOverridePermissions.has("read")
        ) {
          return false;
        } else if (!currentUserOverridePermissions.has("write")) {
          return false;
        }
      }
    }

    if (update.localOverrides) {
      if (keyableParent.type != "localKey") {
        return false;
      }

      if (keyableParent.userId != auth.user.id) {
        let appPermissions: Set<Rbac.AppPermission>;

        if (blockId) {
          appPermissions = getConnectedAppPermissionsIntersectionForBlock(
            userGraph,
            blockId,
            auth.user.id
          );
        } else {
          const appRole = getAppRoleForUserOrInvitee(
            userGraph,
            keyableParent.appId,
            auth.user.id
          );
          if (!appRole) {
            return false;
          }
          appPermissions = getAppPermissions(userGraph, appRole.id);
        }

        if (!appPermissions.has("app_write_user_locals")) {
          return false;
        }
      }
    }

    return true;
  };

export const verifySignedLicense: Api.VerifyLicenseFn = (
  orgId,
  signedLicense,
  now,
  enforceExpiration = false
) => {
  if (!verifyLicenseFn) {
    throw new Api.ApiError("verifyLicenseFn not registered", 500);
  }
  return verifyLicenseFn(orgId, signedLicense, now, enforceExpiration);
};

let verifyLicenseFn: Api.VerifyLicenseFn | undefined;

export const registerVerifyLicenseFn = (fn: Api.VerifyLicenseFn) => {
  verifyLicenseFn = fn;
};

export const getVerifyLicenseFn = () => {
  if (!verifyLicenseFn) {
    throw new Api.ApiError("verifyLicenseFn not registered", 500);
  }
  return verifyLicenseFn;
};

import { apiAction } from "../handler";
import * as R from "ramda";
import { getOrg, getOrgUser } from "../models/orgs";
import { Api, Auth } from "@core/types";
import { verifyExternalAuthSession, verifyEmailToken } from "../auth";
import { secureRandomAlphanumeric } from "@core/lib/crypto/utils";
import { getDb, mergeObjectTransactionItems } from "../db";
import { env } from "../env";
import { getNonSamlExternalAuthSessionSkey } from "../models/external_auth";
import { pick } from "@core/lib/utils/pick";
import { getOrgGraph, getApiUserGraph } from "../graph";
import { getAuthTokenKey } from "../models/auth_tokens";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import * as semver from "semver";
import { log } from "@core/lib/utils/logger";

apiAction<
  Api.Action.RequestActions["CreateSession"],
  Api.Net.ApiResultTypes["CreateSession"]
>({
  type: Api.ActionType.CREATE_SESSION,
  graphAction: false,
  authenticated: false,
  handler: async ({ payload }, now, requestParams, transactionConn) => {
    let externalAuthSession: Api.Db.ExternalAuthSession | undefined,
      externalAuthProviderId: string | undefined;

    if (payload.provider != "email") {
      const verifiedExternalAuthSession = await verifyExternalAuthSession(
        payload.externalAuthSessionId,
        transactionConn
      );

      if (!verifiedExternalAuthSession) {
        throw new Api.ApiError("External auth session is not verified", 400);
      }
      externalAuthSession = verifiedExternalAuthSession;

      if (
        externalAuthSession.authType == "sign_in" &&
        (externalAuthSession.authMethod == "oauth_hosted" ||
          externalAuthSession.authMethod == "saml")
      ) {
        externalAuthProviderId = externalAuthSession.externalAuthProviderId;
      }
    }

    const [user, org, orgUserDevice] = await Promise.all([
      getOrgUser(payload.orgId, payload.userId, transactionConn),
      getOrg(payload.orgId, transactionConn),
      getDb<Api.Db.OrgUserDevice>(payload.deviceId, { transactionConn }),
    ]);

    if (!user || !org) {
      throw new Api.ApiError("invalid credentials", 401);
    }
    if (
      user.deletedAt ||
      user.deactivatedAt ||
      !(user.isCreator || user.inviteAcceptedAt) ||
      !orgUserDevice ||
      !orgUserDevice.approvedAt ||
      !orgUserDevice.pubkey ||
      orgUserDevice.deletedAt ||
      orgUserDevice.deactivatedAt
    ) {
      throw new Api.ApiError("user not allowed to create session", 401);
    }

    const signedData = R.props(
      ["userId", "orgId", "deviceId", "provider"],
      payload
    );
    if (
      !nacl.sign.detached.verify(
        naclUtil.decodeUTF8(JSON.stringify(signedData)),
        naclUtil.decodeBase64(payload.signature),
        naclUtil.decodeBase64(orgUserDevice.pubkey.keys.signingKey)
      )
    ) {
      throw new Api.ApiError("invalid signature", 401);
    }
    let verifyTokenRes: false | Api.Db.ObjectTransactionItems | undefined;

    if (payload.provider == "email") {
      if (!payload.emailVerificationToken) {
        throw new Api.ApiError("bad request", 400);
      }
      verifyTokenRes = await verifyEmailToken(
        user.email,
        payload.emailVerificationToken,
        "sign_in",
        now,
        transactionConn
      );
      if (!verifyTokenRes) {
        throw new Api.ApiError("invalid credentials", 401);
      }
    }

    const token = secureRandomAlphanumeric(22),
      deviceId = payload.deviceId,
      authToken: Api.Db.AuthToken = {
        type: "authToken",
        ...getAuthTokenKey(payload.orgId, user.id, deviceId, token),
        orgId: payload.orgId,
        userId: user.id,
        deviceId,
        token,
        provider: user.provider,
        externalAuthProviderId,
        uid: user.uid,
        createdAt: now,
        updatedAt: now,
        expiresAt: Date.now() + org.settings.auth.tokenExpirationMs,
      };

    let transactionItems: Api.Db.ObjectTransactionItems = {
      puts: [authToken],
    };

    if (verifyTokenRes) {
      transactionItems = mergeObjectTransactionItems([
        transactionItems,
        verifyTokenRes,
      ]);
    }

    if (externalAuthSession) {
      transactionItems.softDeleteKeys = [
        R.pick(["pkey", "skey"], externalAuthSession),
      ];
      transactionItems.puts!.push({
        ...externalAuthSession,
        orgId: org.id,
        userId: user.id,
        updatedAt: now,
        skey: getNonSamlExternalAuthSessionSkey({
          orgId: org.id,
          userId: user.id,
          provider:
            externalAuthSession.provider as Auth.ExternalAuthProviderType,
          authType: externalAuthSession.authType,
        }),
      } as Api.Db.ExternalAuthSession);
    }

    const orgId = org.id,
      userId = user.id;

    const graph = await getOrgGraph(org.id, {
      transactionConnOrPool: transactionConn,
    }).then((orgGraph) =>
      getApiUserGraph(orgGraph, org.id, userId, deviceId, now)
    );

    return {
      type: "handlerResult",
      response: {
        type: "tokenSession",
        token: authToken.token,
        provider: user.provider,
        uid: user.uid,
        userId: userId,
        orgId: org.id,
        deviceId: authToken.deviceId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        graph,
        graphUpdatedAt: org.graphUpdatedAt,
        timestamp: now,
        signedTrustedRoot: orgUserDevice.signedTrustedRoot,
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

apiAction<
  Api.Action.RequestActions["GetSession"],
  Api.Net.ApiResultTypes["GetSession"],
  Auth.TokenAuthContext
>({
  type: Api.ActionType.GET_SESSION,
  graphAction: false,
  authenticated: true,
  handler: async (
    { payload, meta },
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    if (
      (((meta.client.clientName == "core" || meta.client.clientName == "cli") &&
        semver.gte(meta.client.clientVersion, "2.0.24")) ||
        (meta.client.clientName == "app" &&
          semver.gte(meta.client.clientVersion, "2.0.46"))) &&
      payload.graphUpdatedAt &&
      payload.graphUpdatedAt == auth.org.graphUpdatedAt
    ) {
      return {
        type: "handlerResult",
        response: {
          type: "notModified",
          status: 304,
        },
        logTargetIds: [],
      };
    }

    const graphPromise = getOrgGraph(auth.org.id, {
        transactionConnOrPool: transactionConn,
      }).then((orgGraph) =>
        getApiUserGraph(
          orgGraph,
          auth.org.id,
          auth.user.id,
          auth.orgUserDevice.id,
          now
        )
      ),
      graph = await graphPromise;

    return {
      type: "handlerResult",
      response: {
        type: "tokenSession",
        token: auth.authToken.token,
        provider: auth.authToken.provider,
        ...pick(["uid", "email", "firstName", "lastName"], auth.user),
        userId: auth.user.id,
        orgId: auth.org.id,
        deviceId: auth.orgUserDevice.id,
        graph,
        graphUpdatedAt: auth.org.graphUpdatedAt,
        timestamp: now,
        signedTrustedRoot: auth.orgUserDevice.signedTrustedRoot,
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
    };
  },
});

apiAction<
  Api.Action.RequestActions["ClearToken"],
  Api.Net.ApiResultTypes["ClearToken"],
  Auth.TokenAuthContext
>({
  type: Api.ActionType.CLEAR_TOKEN,
  graphAction: false,
  authenticated: true,
  handler: async (action, auth) => ({
    type: "handlerResult",
    response: { type: "success" },
    transactionItems: {
      softDeleteKeys: [pick(["pkey", "skey"], auth.authToken)],
    },
    logTargetIds: [],
    clearUserSockets: [
      {
        orgId: auth.org.id,
        userId: auth.user.id,
        deviceId: auth.orgUserDevice.id,
      },
    ],
  }),
});

apiAction<
  Api.Action.RequestActions["ClearUserTokens"],
  Api.Net.ApiResultTypes["ClearUserTokens"]
>({
  type: Api.ActionType.CLEAR_USER_TOKENS,
  graphAction: false,
  authenticated: true,
  broadcastOrgSocket: ({ payload }) => ({ userIds: [payload.userId] }),
  authorizer: async (action, auth) =>
    auth.orgPermissions.has("org_clear_tokens"),
  handler: async (action, auth) => ({
    type: "handlerResult",
    response: { type: "success" },
    transactionItems: {
      softDeleteScopes: [
        {
          pkey: [auth.org.id, "tokens"].join("|"),
          scope: action.payload.userId,
        },
      ],
    },
    logTargetIds: [action.payload.userId],
    clearUserSockets: [{ orgId: auth.org.id, userId: action.payload.userId }],
  }),
});

apiAction<
  Api.Action.RequestActions["ClearOrgTokens"],
  Api.Net.ApiResultTypes["ClearOrgTokens"]
>({
  type: Api.ActionType.CLEAR_ORG_TOKENS,
  graphAction: false,
  authenticated: true,
  broadcastOrgSocket: true,
  authorizer: async (action, auth) =>
    auth.orgPermissions.has("org_clear_tokens"),
  handler: async (action, auth) => ({
    type: "handlerResult",
    response: { type: "success" },
    transactionItems: {
      softDeleteScopes: [
        {
          pkey: [auth.org.id, "tokens"].join("|"),
        },
      ],
    },
    logTargetIds: [],
    clearUserSockets: [{ orgId: auth.org.id }],
  }),
});

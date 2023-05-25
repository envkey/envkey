import { getFetchActionBackgroundLogTargetIdsFn } from "./../models/logs";
import { getFetchActionLogTargetIdsFn } from "../models/logs";
import { sendEmail } from "../email";
import { sha256 } from "@core/lib/crypto/utils";
import { getAuthTokenKey } from "../models/auth_tokens";
import { apiAction } from "../handler";
import { Api, Auth } from "@core/types";
import {
  getActiveRecoveryKeysByUserId,
  getOrgUserDevicesByUserId,
  graphTypes,
  deleteGraphObjects,
} from "@core/lib/graph";
import { v4 as uuid } from "uuid";
import * as graphKey from "../graph_key";
import { pick } from "@core/lib/utils/pick";
import { secureRandomAlphanumeric } from "@core/lib/crypto/utils";
import { getPubkeyHash } from "@core/lib/client";
import * as semver from "semver";
import produce from "immer";

apiAction<
  Api.Action.RequestActions["CreateRecoveryKey"],
  Api.Net.ApiResultTypes["CreateRecoveryKey"],
  Auth.TokenAuthContext
>({
  type: Api.ActionType.CREATE_RECOVERY_KEY,
  graphAction: true,
  authenticated: true,

  graphAuthorizer: async ({ payload }, orgGraph, userGraph, auth) =>
    auth.orgPermissions.has("org_generate_recovery_key"),
  graphHandler: async (
    { type, payload },
    orgGraph,
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    const activeRecoveryKey =
      getActiveRecoveryKeysByUserId(orgGraph)[auth.user.id];
    let updatedGraph = orgGraph;
    if (activeRecoveryKey) {
      updatedGraph = deleteGraphObjects(orgGraph, [activeRecoveryKey.id], now);
    }

    const recoveryKeyId = uuid(),
      recoveryKey: Api.Db.RecoveryKey = {
        type: "recoveryKey",
        id: recoveryKeyId,
        ...graphKey.recoveryKey(auth.org.id, auth.user.id, recoveryKeyId),
        ...pick(
          ["identityHash", "encryptedPrivkey", "pubkey"],
          payload.recoveryKey
        ),
        signedTrustedRoot: payload.signedTrustedRoot,
        userId: auth.user.id,
        creatorDeviceId: auth.orgUserDevice.id,
        signedById: auth.orgUserDevice.id,
        pubkeyId: getPubkeyHash(payload.recoveryKey.pubkey),
        pubkeyUpdatedAt: now,
        deviceId: uuid(),
        createdAt: now,
        updatedAt: now,
      },
      recoveryKeyPointer: Api.Db.RecoveryKeyPointer = {
        type: "recoveryKeyPointer",
        pkey: ["recoveryKey", payload.recoveryKey.identityHash].join("|"),
        skey: "recoveryKeyPointer",
        orgId: auth.org.id,
        recoveryKeyId,
        createdAt: now,
        updatedAt: now,
      };

    return {
      type: "graphHandlerResult",
      graph: { ...updatedGraph, [recoveryKeyId]: recoveryKey },
      transactionItems: {
        puts: [recoveryKeyPointer],
        hardDeleteEncryptedKeyParams: activeRecoveryKey
          ? [
              {
                orgId: auth.org.id,
                userId: auth.user.id,
                deviceId: activeRecoveryKey.id,
              },
            ]
          : undefined,
      },
      handlerContext: {
        type,
        createdId: recoveryKeyId,
      },
      logTargetIds: [],
    };
  },
});

apiAction<
  Api.Action.RequestActions["LoadRecoveryKey"],
  Api.Net.ApiResultTypes["LoadRecoveryKey"],
  Auth.RecoveryKeyAuthContext
>({
  type: Api.ActionType.LOAD_RECOVERY_KEY,
  graphAction: true,
  authenticated: true,
  skipGraphUpdatedAtCheck: true,
  graphResponse: "loadedRecoveryKey",
  graphAuthorizer: async ({ payload }, orgGraph, userGraph, auth) => {
    if (!auth.orgPermissions.has("org_generate_recovery_key")) {
      return false;
    }
    const activeRecoveryKey =
      getActiveRecoveryKeysByUserId(orgGraph)[auth.user.id];
    if (!activeRecoveryKey || activeRecoveryKey.type != "recoveryKey") {
      return false;
    }

    return true;
  },
  graphHandler: async (
    action,
    orgGraph,
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    const { type, payload } = action;

    const activeRecoveryKey = getActiveRecoveryKeysByUserId(orgGraph)[
        auth.user.id
      ] as Api.Db.RecoveryKey,
      handlerContext: Api.HandlerContext = {
        type,
        recoveryKey: activeRecoveryKey,
      };

    if (!payload.emailToken) {
      const emailToken = secureRandomAlphanumeric(22);

      if (process.env.NODE_ENV == "development") {
        const clipboardy = require("clipboardy");
        const notifier = require("node-notifier");
        clipboardy.writeSync(emailToken);
        notifier.notify("Email token copied to clipboard.");
      }

      const emailAction = () =>
        sendEmail({
          to: auth.user.email,
          subject: `${auth.user.firstName}, here's your EnvKey Account Recovery Email Confirmation Token`,
          bodyMarkdown: `Hi ${auth.user.firstName},

An attempt has been made to recover your ${auth.org.name} EnvKey account. If it **wasn't** you, it could mean someone else has obtained your Account Recovery Key, so you should generate a new one as soon as possible.

If it **was** you, here's your Email Confirmation Token:

**${emailToken}**

Please copy it and return to the EnvKey UI to complete the Account Recovery process.
`,
        });

      return {
        type: "response",
        response: {
          type: "requiresEmailAuthError",
          email: auth.user.email,
          error: true,
          errorStatus: 422,
          errorReason: "Email auth required",
        },
        postUpdateActions: [emailAction],
        transactionItems: {
          puts: [
            {
              ...activeRecoveryKey,
              emailToken,
              updatedAt: now,
            } as Api.Db.RecoveryKey,
          ],
        },
        handlerContext,
        logTargetIds: [],
      };
    } else if (
      !activeRecoveryKey.emailToken ||
      sha256(payload.emailToken) !== sha256(activeRecoveryKey.emailToken)
    ) {
      throw new Api.ApiError("Not found", 404);
    }

    const keysOnly = Boolean(
      action.meta.client &&
        semver.gte(action.meta.client.clientVersion, "2.2.0")
    );

    return {
      type: "graphHandlerResult",
      graph: orgGraph,
      envs: { all: true, keysOnly },
      inheritanceOverrides: { all: true, keysOnly },
      changesets: { all: true, keysOnly },
      signedTrustedRoot: activeRecoveryKey.signedTrustedRoot,
      handlerContext,
      logTargetIds: getFetchActionLogTargetIdsFn(orgGraph),
      backgroundLogTargetIds: getFetchActionBackgroundLogTargetIdsFn(orgGraph),
    };
  },
});

apiAction<
  Api.Action.RequestActions["RedeemRecoveryKey"],
  Api.Net.ApiResultTypes["RedeemRecoveryKey"],
  Auth.TokenAuthContext
>({
  type: Api.ActionType.REDEEM_RECOVERY_KEY,
  graphAction: true,
  authenticated: true,
  graphResponse: "session",
  graphAuthorizer: async ({ payload }, orgGraph, userGraph, auth) => {
    if (!auth.orgPermissions.has("org_generate_recovery_key")) {
      return false;
    }

    const activeRecoveryKey = getActiveRecoveryKeysByUserId(orgGraph)[
      auth.user.id
    ] as Api.Db.RecoveryKey;

    if (!activeRecoveryKey || activeRecoveryKey.type != "recoveryKey") {
      return false;
    }

    return true;
  },
  graphHandler: async (
    { type, payload },
    orgGraph,
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    const activeRecoveryKey = getActiveRecoveryKeysByUserId(orgGraph)[
      auth.user.id
    ] as Api.Db.RecoveryKey;

    if (
      !payload.emailToken ||
      !activeRecoveryKey.emailToken ||
      sha256(payload.emailToken) !== sha256(activeRecoveryKey.emailToken)
    ) {
      throw new Api.ApiError("Not found", 404);
    }

    const orgUser = orgGraph[auth.user.id] as Api.Db.OrgUser,
      orgUserDevices = (getOrgUserDevicesByUserId(orgGraph)[auth.user.id] ??
        []) as Api.Db.OrgUserDevice[],
      newOrgUserDevice: Api.Db.OrgUserDevice = {
        type: "orgUserDevice",
        id: activeRecoveryKey.deviceId,
        ...graphKey.orgUserDevice(
          auth.org.id,
          orgUser.id,
          activeRecoveryKey.deviceId
        ),
        userId: auth.user.id,
        name: payload.device.name,
        pubkey: payload.device.pubkey,
        pubkeyId: getPubkeyHash(payload.device.pubkey),
        pubkeyUpdatedAt: now,
        signedTrustedRoot: payload.device.signedTrustedRoot,
        trustedRootUpdatedAt: now,
        approvedByType: "recoveryKey",
        recoveryKeyId: activeRecoveryKey.id,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      token = secureRandomAlphanumeric(22),
      authToken: Api.Db.AuthToken = {
        type: "authToken",
        ...getAuthTokenKey(
          auth.org.id,
          auth.user.id,
          activeRecoveryKey.deviceId,
          token
        ),
        token,
        orgId: auth.org.id,
        deviceId: activeRecoveryKey.deviceId,
        userId: auth.user.id,
        provider: orgUser.provider,
        uid: orgUser.uid,
        externalAuthProviderId: orgUser.externalAuthProviderId,
        expiresAt: Date.now() + auth.org.settings.auth.tokenExpirationMs,
        createdAt: now,
        updatedAt: now,
      };

    let updatedGraph = {
      ...orgGraph,
      [activeRecoveryKey.id]: {
        ...activeRecoveryKey,
        redeemedAt: now,
        updatedAt: now,
      },
      [newOrgUserDevice.id]: newOrgUserDevice,
      [orgUser.id]: {
        ...orgUser,
        deviceIds: [activeRecoveryKey.deviceId],
        updatedAt: now,
      },
    };
    for (let orgUserDevice of orgUserDevices) {
      updatedGraph = {
        ...updatedGraph,
        [orgUserDevice.id]: {
          ...orgUserDevice,
          deactivatedAt: now,
          updatedAt: now,
        },
      };
    }

    updatedGraph = produce(updatedGraph, (draft) => {
      const replacementDrafts = graphTypes(draft)
        .rootPubkeyReplacements as Api.Db.RootPubkeyReplacement[];

      for (let replacementDraft of replacementDrafts) {
        if (replacementDraft.processedAtById[activeRecoveryKey.id] === false) {
          replacementDraft.processedAtById[activeRecoveryKey.id] = now;
          replacementDraft.updatedAt = now;
        }
      }
    });

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      transactionItems: {
        puts: [authToken],
        softDeleteScopes: [
          {
            pkey: [auth.org.id, "tokens"].join("|"),
            scope: auth.user.id,
          },
        ],
        hardDeleteEncryptedKeyParams: orgUserDevices.map(
          ({ id: deviceId }) => ({
            orgId: auth.org.id,
            userId: auth.user.id,
            deviceId,
          })
        ),
      },
      handlerContext: {
        type,
        authToken,
        orgUserDevice: newOrgUserDevice,
        recoveryKey: activeRecoveryKey,
      },
      logTargetIds: [],
      clearUserSockets: orgUserDevices.map(({ id }) => ({
        orgId: auth.org.id,
        userId: auth.user.id,
        deviceId: id,
      })),
    };
  },
});

import { getFetchActionBackgroundLogTargetIdsFn } from "./../models/logs";
import { getFetchActionLogTargetIdsFn } from "../models/logs";
import { getAuthTokenKey } from "../models/auth_tokens";
import { sendBulkEmail } from "../email";
import { pick } from "@core/lib/utils/pick";
import { apiAction } from "../handler";
import { Api, Auth } from "@core/types";
import { v4 as uuid } from "uuid";
import * as graphKey from "../graph_key";
import {
  getActiveDeviceGrants,
  getExpiredDeviceGrantsByGranteeId,
  getActiveOrgUserDevicesByUserId,
  deleteGraphObjects,
  authz,
  graphTypes,
} from "@core/lib/graph";
import * as R from "ramda";
import { secureRandomAlphanumeric } from "@core/lib/crypto/utils";
import { decodeUTF8 } from "tweetnacl-util";
import { encode as encodeBase58 } from "bs58";
import { getPubkeyHash } from "@core/lib/client";
import produce from "immer";
import { deleteDevice } from "../graph";
import { log } from "@core/lib/utils/logger";

apiAction<
  Api.Action.RequestActions["CreateDeviceGrant"],
  Api.Net.ApiResultTypes["CreateDeviceGrant"]
>({
  type: Api.ActionType.CREATE_DEVICE_GRANT,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async (
    { payload: { granteeId } },
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

    return authz.canCreateDeviceGrant(userGraph, auth.user.id, granteeId);
  },
  graphHandler: async (action, orgGraph, auth, now, requestParams) => {
    let updatedGraph = orgGraph;

    const granteeId = action.payload.granteeId;

    const existingExpiredDeviceGrants = getExpiredDeviceGrantsByGranteeId(
        orgGraph,
        now
      )[granteeId],
      targetOrgUser = orgGraph[granteeId] as Api.Db.OrgUser;

    if (existingExpiredDeviceGrants) {
      updatedGraph = deleteGraphObjects(
        updatedGraph,
        existingExpiredDeviceGrants.map(R.prop("id")),
        now
      );
    }

    const emailToken = [
      "dg",
      secureRandomAlphanumeric(22),
      encodeBase58(decodeUTF8(requestParams.host)),
    ].join("_");

    if (process.env.NODE_ENV == "development") {
      const clipboardy = require("clipboardy");
      const notifier = require("node-notifier");
      clipboardy.writeSync(emailToken);
      notifier.notify("Created invite. Token copied to clipboard.");
    }

    const deviceGrantId = uuid(),
      newDeviceGrant: Api.Db.DeviceGrant = {
        type: "deviceGrant",
        id: deviceGrantId,
        ...graphKey.deviceGrant(auth.org.id, targetOrgUser.id, deviceGrantId),
        ...pick(["provider", "uid", "externalAuthProviderId"], targetOrgUser),
        ...pick(
          ["pubkey", "encryptedPrivkey", "granteeId", "identityHash"],
          action.payload
        ),
        deviceId: uuid(),
        orgId: auth.org.id,
        grantedByUserId: auth.user.id,
        grantedByDeviceId:
          auth.type == "tokenAuthContext" ? auth.orgUserDevice.id : undefined,
        signedById:
          auth.type == "tokenAuthContext"
            ? auth.orgUserDevice.id
            : auth.user.id,
        pubkeyId: getPubkeyHash(action.payload.pubkey),
        pubkeyUpdatedAt: now,
        expiresAt: now + auth.org.settings.auth.deviceGrantExpirationMs,
        signedTrustedRoot: action.payload.signedTrustedRoot,
        createdAt: now,
        updatedAt: now,
      },
      deviceGrantPointer: Api.Db.DeviceGrantPointer = {
        type: "deviceGrantPointer",
        pkey: ["deviceGrant", action.payload.identityHash].join("|"),
        skey: emailToken,
        deviceGrantId,
        orgId: auth.org.id,
        createdAt: now,
        updatedAt: now,
      };

    updatedGraph = {
      ...updatedGraph,
      [deviceGrantId]: newDeviceGrant,
    };

    const firstName =
        auth.type == "cliUserAuthContext"
          ? auth.user.name
          : auth.user.firstName,
      fullName =
        auth.type == "cliUserAuthContext"
          ? auth.user.name
          : [auth.user.firstName, auth.user.lastName].join(" "),
      emailAction = () =>
        sendBulkEmail({
          to: targetOrgUser.email,
          subject: `${targetOrgUser.firstName}, you've been approved to access ${auth.org.name}'s EnvKey config on a new device`,
          bodyMarkdown: `Hi ${targetOrgUser.firstName},

${fullName} has approved you to access ${
            auth.org.name + (auth.org.name.endsWith("s") ? "'" : "'s")
          } EnvKey config on a new device.

To accept this grant, first ensure you have EnvKey installed on your device. If you don't, go [here](https://www.envkey.com) and download the EnvKey UI for your platform.

After installing and starting the app, click the 'Accept Invitation' button on the first screen you see, then input the **Invite Token** below:

**${emailToken}**

You'll also need an **Encryption Token** that ${firstName} will send to you directly.

This grant will remain valid for 24 hours.
`,
        });

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      handlerContext: {
        type: action.type,
        granteeId: newDeviceGrant.granteeId,
        createdId: deviceGrantId,
      },
      transactionItems: {
        puts: [deviceGrantPointer],
        hardDeleteEncryptedKeyParams: existingExpiredDeviceGrants
          ? existingExpiredDeviceGrants.map((dg) => ({
              orgId: auth.org.id,
              userId: granteeId,
              deviceId: dg.id,
            }))
          : undefined,
      },
      postUpdateActions: [emailAction],
      logTargetIds:
        auth.user.id == newDeviceGrant.granteeId
          ? []
          : [newDeviceGrant.granteeId],
    };
  },
});

apiAction<
  Api.Action.RequestActions["LoadDeviceGrant"],
  Api.Net.ApiResultTypes["LoadDeviceGrant"],
  Auth.DeviceGrantAuthContext
>({
  type: Api.ActionType.LOAD_DEVICE_GRANT,
  graphAction: true,
  skipGraphUpdatedAtCheck: true,
  authenticated: true,
  graphResponse: "loadedDeviceGrant",
  graphAuthorizer: async (
    {
      meta: {
        auth: { identityHash },
      },
    },
    orgGraph,
    userGraph,
    auth,
    now
  ) => {
    const activeDeviceGrants = getActiveDeviceGrants(
        orgGraph,
        now
      ) as Api.Db.DeviceGrant[],
      deviceGrant = R.find(
        R.propEq("identityHash", identityHash),
        activeDeviceGrants
      );

    if (
      !deviceGrant ||
      deviceGrant.type != "deviceGrant" ||
      deviceGrant.deletedAt ||
      deviceGrant.acceptedAt
    ) {
      return false;
    }

    if (now >= deviceGrant.expiresAt) {
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
    const deviceGrant = auth.deviceGrant;
    if (
      deviceGrant.provider != "email" &&
      !deviceGrant.externalAuthSessionVerifiedAt
    ) {
      return {
        type: "response",
        response: {
          type: "requiresExternalAuthError",
          ...pick(
            ["id", "provider", "externalAuthProviderId", "uid"],
            deviceGrant
          ),
          orgId: auth.org.id,
          error: true,
          errorStatus: 422,
          errorReason: "External auth required",
        },
        logTargetIds: [],
      };
    }

    return {
      type: "graphHandlerResult",
      graph: orgGraph,
      envs: { all: true },
      inheritanceOverrides: { all: true },
      changesets: { all: true },
      signedTrustedRoot: deviceGrant.signedTrustedRoot,
      logTargetIds: getFetchActionLogTargetIdsFn(orgGraph),
      backgroundLogTargetIds: getFetchActionBackgroundLogTargetIdsFn(orgGraph),
    };
  },
});

apiAction<
  Api.Action.RequestActions["RevokeDeviceGrant"],
  Api.Net.ApiResultTypes["RevokeDeviceGrant"]
>({
  type: Api.ActionType.REVOKE_DEVICE_GRANT,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async (
    { payload: { id } },
    orgGraph,
    userGraph,
    auth,
    now
  ) => authz.canRevokeDeviceGrant(userGraph, auth.user.id, id, now),
  graphHandler: async (action, orgGraph, auth, now) => {
    const deviceGrant = orgGraph[action.payload.id] as Api.Db.DeviceGrant;

    return {
      type: "graphHandlerResult",
      graph: deleteGraphObjects(orgGraph, [deviceGrant.id], now),
      handlerContext: {
        type: action.type,
        deviceGrant,
      },
      transactionItems: {
        hardDeleteEncryptedKeyParams: [
          {
            orgId: auth.org.id,
            userId: deviceGrant.granteeId,
            deviceId: deviceGrant.id,
          },
        ],
      },
      logTargetIds:
        auth.user.id == deviceGrant.granteeId ? [] : [deviceGrant.granteeId],
    };
  },
});

apiAction<
  Api.Action.RequestActions["AcceptDeviceGrant"],
  Api.Net.ApiResultTypes["AcceptDeviceGrant"],
  Auth.DeviceGrantAuthContext
>({
  type: Api.ActionType.ACCEPT_DEVICE_GRANT,
  graphAction: true,
  authenticated: true,
  graphResponse: "session",
  graphAuthorizer: async (
    {
      payload,
      meta: {
        auth: { identityHash },
      },
    },
    orgGraph,
    userGraph,
    auth,
    now
  ) => {
    const deviceGrant = R.find(
      R.propEq("identityHash", identityHash),
      getActiveDeviceGrants(orgGraph, now) as Api.Db.DeviceGrant[]
    );

    if (
      !deviceGrant ||
      deviceGrant.type != "deviceGrant" ||
      deviceGrant.deletedAt ||
      deviceGrant.acceptedAt
    ) {
      return false;
    }

    if (now >= deviceGrant.expiresAt) {
      return false;
    }

    // ensure device name is unique for this user
    const existingDeviceNames = new Set(
      (
        getActiveOrgUserDevicesByUserId(orgGraph)[deviceGrant.granteeId] ?? []
      ).map(({ name }) => name.trim().toLowerCase())
    );

    if (existingDeviceNames.has(payload.device.name.trim().toLowerCase())) {
      return false;
    }

    return true;
  },
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    const deviceGrant = auth.deviceGrant,
      deviceId = deviceGrant.deviceId,
      orgUserDevice: Api.Db.OrgUserDevice = {
        type: "orgUserDevice",
        id: deviceId,
        ...graphKey.orgUserDevice(auth.org.id, deviceGrant.granteeId, deviceId),
        userId: deviceGrant.granteeId,
        name: payload.device.name,
        pubkey: payload.device.pubkey,
        pubkeyId: getPubkeyHash(payload.device.pubkey),
        pubkeyUpdatedAt: now,
        approvedByType: "deviceGrant",
        deviceGrantId: deviceGrant.id,
        signedTrustedRoot: payload.device.signedTrustedRoot,
        trustedRootUpdatedAt: now,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      token = secureRandomAlphanumeric(22),
      authToken: Api.Db.AuthToken = {
        type: "authToken",
        ...getAuthTokenKey(auth.org.id, auth.user.id, deviceId, token),
        token,
        orgId: auth.org.id,
        deviceId,
        userId: auth.user.id,
        provider: deviceGrant.provider,
        uid: deviceGrant.uid,
        externalAuthProviderId: deviceGrant.externalAuthProviderId,
        expiresAt: Date.now() + auth.org.settings.auth.tokenExpirationMs,
        createdAt: now,
        updatedAt: now,
      },
      transactionItems: Api.Db.ObjectTransactionItems = {
        puts: [authToken],
        hardDeleteEncryptedKeyParams: [
          {
            orgId: auth.org.id,
            userId: auth.user.id,
            deviceId: deviceGrant.id,
          },
        ],
      };

    let updatedGraph = produce(orgGraph, (draft) => {
      draft[deviceGrant.id] = {
        ...deviceGrant,
        deviceId,
        acceptedAt: now,
        updatedAt: now,
      };
      draft[deviceId] = orgUserDevice;
      draft[auth.user.id] = {
        ...auth.user,
        deviceIds: [...(auth.user.deviceIds || []), deviceId],
        inviteAcceptedAt: now,
        updatedAt: now,
      };

      const replacementDrafts = graphTypes(draft)
        .rootPubkeyReplacements as Api.Db.RootPubkeyReplacement[];

      for (let replacementDraft of replacementDrafts) {
        if (replacementDraft.processedAtById[deviceGrant.id] === false) {
          replacementDraft.processedAtById[deviceGrant.id] = now;
          replacementDraft.updatedAt = now;
        }
      }
    });

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      transactionItems,
      handlerContext: {
        type: Api.ActionType.ACCEPT_DEVICE_GRANT,
        authToken,
        orgUserDevice,
        deviceGrant,
      },
      logTargetIds:
        auth.user.id == deviceGrant.granteeId ? [] : [deviceGrant.granteeId],
    };
  },
});

apiAction<
  Api.Action.RequestActions["RevokeDevice"],
  Api.Net.ApiResultTypes["RevokeDevice"]
>({
  type: Api.ActionType.REVOKE_DEVICE,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async (
    { payload: { id } },
    orgGraph,
    userGraph,
    auth,
    now
  ) => authz.canRevokeDevice(userGraph, auth.user.id, id),
  graphHandler: async ({ type, payload }, orgGraph, auth, now) => {
    const orgUserDevice = orgGraph[payload.id] as Api.Db.OrgUserDevice;

    return {
      type: "graphHandlerResult",
      graph: deleteDevice(orgGraph, payload.id, auth, now),
      transactionItems: {
        softDeleteScopes: [
          {
            pkey: [auth.org.id, "tokens"].join("|"),
            scope: [orgUserDevice.userId, orgUserDevice.id].join("|"),
          },
        ],
        hardDeleteEncryptedKeyParams: [
          {
            orgId: auth.org.id,
            userId: auth.user.id,
            deviceId: orgUserDevice.id,
          },
        ],
      },
      handlerContext: {
        type,
        device: orgUserDevice,
      },
      logTargetIds: [orgUserDevice.id, orgUserDevice.userId],
      clearUserSockets: [
        {
          orgId: auth.org.id,
          userId: (orgGraph[payload.id] as Api.Db.OrgUserDevice).userId,
          deviceId: payload.id,
        },
      ],
    };
  },
});

apiAction<
  Api.Action.RequestActions["ForgetDevice"],
  Api.Net.ApiResultTypes["ForgetDevice"],
  Auth.TokenAuthContext
>({
  type: Api.ActionType.FORGET_DEVICE,
  graphAction: true,
  authenticated: true,
  skipGraphUpdatedAtCheck: true,
  graphHandler: async (action, orgGraph, auth, now) => {
    return {
      type: "graphHandlerResult",
      graph: deleteDevice(orgGraph, auth.orgUserDevice.id, auth, now),
      transactionItems: {
        softDeleteScopes: [
          {
            pkey: [auth.org.id, "tokens"].join("|"),
            scope: [auth.user.id, auth.orgUserDevice.id].join("|"),
          },
        ],
        hardDeleteEncryptedKeyParams: [
          {
            orgId: auth.org.id,
            userId: auth.user.id,
            deviceId: auth.orgUserDevice.id,
          },
        ],
      },
      logTargetIds: [],
      clearUserSockets: [
        {
          orgId: auth.org.id,
          userId: auth.user.id,
          deviceId: auth.orgUserDevice.id,
        },
      ],
    };
  },
});

import { log } from "@core/lib/utils/logger";
import { getFetchActionBackgroundLogTargetIdsFn } from "./../models/logs";
import { getAuthTokenKey } from "../models/auth_tokens";
import { apiAction } from "../handler";
import { Api, Auth } from "@core/types";
import { secureRandomAlphanumeric } from "@core/lib/crypto/utils";
import { getDb, mergeObjectTransactionItems } from "../db";
import * as graphKey from "../graph_key";
import * as R from "ramda";
import { v4 as uuid } from "uuid";
import { sendBulkEmail } from "../email";
import {
  getActiveInvites,
  graphTypes,
  authz,
  getActiveOrInvitedOrgUsers,
  getLocalKeysByUserId,
} from "@core/lib/graph";
import { getPubkeyHash } from "@core/lib/client";
import { pick } from "@core/lib/utils/pick";
import produce from "immer";
import { decodeUTF8 } from "tweetnacl-util";
import { encode as encodeBase58 } from "bs58";
import { getFetchActionLogTargetIdsFn } from "../models/logs";
import { scimCandidateDbKey } from "../models/provisioning";
import { getDeleteUsersWithTransactionItems } from "../blob";
import { env } from "../env";
import { LIFECYCLE_EMAILS_ENABLED } from "../email";
import {
  getCanAutoUpgradeLicenseFn,
  getResolveProductAndQuantityFn,
} from "../billing";
import * as semver from "semver";

apiAction<
  Api.Action.RequestActions["CreateInvite"],
  Api.Net.ApiResultTypes["CreateInvite"]
>({
  type: Api.ActionType.CREATE_INVITE,
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
    const numActiveDeviceLike = auth.org.deviceLikeCount;
    const numActiveUsers = auth.org.activeUserOrInviteCount!;

    if (
      auth.license.maxDevices != -1 &&
      numActiveDeviceLike >= auth.license.maxDevices
    ) {
      return false;
    }

    const canAutoUpgradeLicenseFn = getCanAutoUpgradeLicenseFn();
    if (
      auth.license.maxUsers != -1 &&
      numActiveUsers >= auth.license.maxUsers! &&
      (!canAutoUpgradeLicenseFn || !canAutoUpgradeLicenseFn(orgGraph))
    ) {
      return false;
    }

    const {
      appUserGrants,
      userGroupIds,
      user: { orgRoleId, externalAuthProviderId },
    } = payload;

    const userParams = payload.user,
      email = userParams.email.toLowerCase().trim(),
      orgUsersWithEmail = getActiveOrInvitedOrgUsers(orgGraph).filter(
        (orgUser) => orgUser.email.toLowerCase().trim() == email
      );

    // Inviting a user who already has an outstanding invite will delete
    // the outstanding invitation and create a new one
    if (orgUsersWithEmail.length > 0) {
      for (let orgUser of orgUsersWithEmail) {
        if (orgUser.inviteAcceptedAt || orgUser.isCreator) {
          throw new Api.ApiError(
            `User with email ${email} already exists`,
            403
          );
        }
        if (!authz.canRemoveFromOrg(orgGraph, auth.user.id, orgUser.id)) {
          return false;
        }
      }
    }

    return (
      authz.canInvite(userGraph, auth.user.id, {
        appUserGrants,
        userGroupIds,
        orgRoleId,
      }) &&
      (!externalAuthProviderId || Boolean(orgGraph[externalAuthProviderId]))
    );
  },
  graphHandler: async (
    { payload },
    orgGraph,
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    let transactionItems: Api.Db.ObjectTransactionItems = { puts: [] };
    let scimCandidate: Api.Db.ScimUserCandidate | undefined;
    if (payload.scim?.candidateId) {
      scimCandidate = await getDb<Api.Db.ScimUserCandidate>(
        scimCandidateDbKey({
          orgId: auth.org.id,
          providerId: payload.scim.providerId,
          userCandidateId: payload.scim.candidateId,
        }),
        { transactionConn }
      );
      if (!scimCandidate) {
        throw new Api.ApiError(
          `Cannot invite from scim candidate - scim candidate not found ${payload.scim.candidateId} ${payload.scim.providerId}`,
          422
        );
      }
      if (scimCandidate.deletedAt) {
        throw new Api.ApiError(
          `Cannot invite user from deleted SCIM candidate ${scimCandidate.id}`,
          422
        );
      }
      if (!scimCandidate.active) {
        throw new Api.ApiError(
          `Cannot invite user from inactive SCIM candidate ${scimCandidate.id}`,
          422
        );
      }
    }

    const userParams = payload.user,
      email = userParams.email.toLowerCase().trim(),
      activeOrgUsersWithEmail = getActiveOrInvitedOrgUsers(orgGraph).filter(
        (orgUser) => orgUser.email.toLowerCase().trim() == email
      );

    const userId = uuid(),
      user: Api.Db.OrgUser = {
        email,
        firstName: userParams.firstName.trim(),
        lastName: userParams.lastName.trim(),
        provider: userParams.provider,
        externalAuthProviderId: userParams.externalAuthProviderId,
        uid: userParams.uid,
        orgRoleId: userParams.orgRoleId,
        type: "orgUser",
        id: userId,
        ...graphKey.orgUser(auth.org.id, userId),
        isCreator: false,
        deviceIds: [],
        invitedById: auth.user.id,
        orgRoleUpdatedAt: now,
        // link scim candidate to user
        scim: payload.scim || undefined,
        importId: userParams.importId,
        createdAt: now,
        updatedAt: now,
      };
    if (scimCandidate) {
      // link user to scim candidate
      transactionItems.puts!.push({
        ...scimCandidate,
        orgUserId: userId,
      } as Api.Db.ScimUserCandidate);
    }

    const userIdByEmail: Api.Db.OrgUserIdByEmail = {
        type: "userIdByEmail",
        email: user.email,
        userId: user.id,
        orgId: auth.org.id,
        pkey: ["email", user.email].join("|"),
        skey: [auth.org.id, user.id].join("|"),
        createdAt: now,
        updatedAt: now,
      },
      providerUid = [user.provider, user.externalAuthProviderId, user.uid]
        .filter(Boolean)
        .join("|"),
      userIdByProviderUid: Api.Db.OrgUserIdByProviderUid = {
        type: "userIdByProviderUid",
        providerUid,
        userId: user.id,
        orgId: auth.org.id,
        pkey: ["provider", providerUid].join("|"),
        skey: auth.org.id,
        createdAt: now,
        updatedAt: now,
      };

    transactionItems.puts!.push(user, userIdByEmail, userIdByProviderUid);

    const isV1UpgradeInvite = Boolean(
      auth.org.importedFromV1 &&
        auth.org.startedOrgImportAt &&
        !auth.org.finishedOrgImportAt &&
        payload.v1Token
    );

    let emailToken = "";
    if (!isV1UpgradeInvite) {
      emailToken = [
        "i",
        secureRandomAlphanumeric(22),
        encodeBase58(decodeUTF8(requestParams.host)),
      ].join("_");

      if (process.env.NODE_ENV == "development") {
        const clipboardy = require("clipboardy");
        const notifier = require("node-notifier");
        clipboardy.writeSync(emailToken);
        notifier.notify("Created invite. Token copied to clipboard.");
      }
    }

    const inviteId = uuid(),
      invite: Api.Db.Invite = {
        type: "invite",
        id: inviteId,
        ...graphKey.invite(auth.org.id, auth.user.id, inviteId),
        ...pick(["provider", "uid", "externalAuthProviderId"], userParams),
        ...pick(["identityHash", "pubkey", "encryptedPrivkey"], payload),
        v1Invite: Boolean(payload.v1Token),
        invitedByUserId: auth.user.id,
        invitedByDeviceId:
          auth.type == "tokenAuthContext" ? auth.orgUserDevice.id : undefined,
        signedById:
          auth.type == "tokenAuthContext"
            ? auth.orgUserDevice.id
            : auth.user.id,
        pubkeyId: getPubkeyHash(payload.pubkey),
        pubkeyUpdatedAt: now,
        inviteeId: user.id,
        deviceId: uuid(),
        signedTrustedRoot: payload.signedTrustedRoot,
        expiresAt: isV1UpgradeInvite
          ? now + 1000 * 60 * 60 * 24 * 90 // for v1 upgrade invites only, use long expiration (90 days)
          : now + auth.org.settings.auth.inviteExpirationMs,
        createdAt: now,
        updatedAt: now,
      },
      invitePointer: Api.Db.InvitePointer = {
        type: "invitePointer",
        pkey: ["invite", payload.identityHash].join("|"),
        skey: isV1UpgradeInvite ? payload.v1Token! : emailToken,
        inviteId,
        orgId: auth.org.id,
        createdAt: now,
        updatedAt: now,
      };

    transactionItems.puts!.push(invitePointer);

    let updatedGraph = produce(orgGraph, (draft) => {
      draft[invite.id] = invite;
      draft[user.id] = user;

      (draft[auth.org.id] as Api.Db.Org).deviceLikeCount += 1;
      (draft[auth.org.id] as Api.Db.Org).activeUserOrInviteCount! += 1;
      (draft[auth.org.id] as Api.Db.Org).updatedAt = now;

      if (payload.appUserGrants) {
        for (let appUserGrantParams of payload.appUserGrants) {
          const appUserGrantId = uuid(),
            appUserGrant: Api.Db.AppUserGrant = {
              type: "appUserGrant",
              id: appUserGrantId,
              ...graphKey.appUserGrant(
                auth.org.id,
                appUserGrantParams.appId,
                user.id,
                appUserGrantId
              ),
              userId: user.id,
              ...pick(["appId", "appRoleId"], appUserGrantParams),
              createdAt: now,
              updatedAt: now,
            };

          draft[appUserGrantId] = appUserGrant;
        }
      }

      if (payload.userGroupIds) {
        for (let userGroupId of payload.userGroupIds) {
          const membershipId = uuid();
          const membership: Api.Db.GroupMembership = {
            type: "groupMembership",
            id: membershipId,
            ...graphKey.groupMembership(auth.org.id, user.id, membershipId),
            objectId: user.id,
            groupId: userGroupId,
            createdAt: now,
            updatedAt: now,
          };

          draft[membershipId] = membership;
        }
      }
    });

    let deleteActiveTransactionItems: Api.Db.ObjectTransactionItems;
    ({ updatedGraph, transactionItems: deleteActiveTransactionItems } =
      getDeleteUsersWithTransactionItems(
        auth,
        orgGraph,
        updatedGraph,
        activeOrgUsersWithEmail.map(R.prop("id")),
        now
      ));

    const resolveProductAndQuantityFn = getResolveProductAndQuantityFn();
    if (resolveProductAndQuantityFn) {
      const productAndQuantityRes = await resolveProductAndQuantityFn(
        transactionConn,
        auth,
        updatedGraph,
        "add-user",
        now
      );
      updatedGraph = productAndQuantityRes[0];
      transactionItems = mergeObjectTransactionItems([
        transactionItems,
        productAndQuantityRes[1],
      ]);
    }

    transactionItems = mergeObjectTransactionItems([
      transactionItems,
      deleteActiveTransactionItems,
    ]);

    const postUpdateActions = isV1UpgradeInvite
      ? []
      : [
          () => {
            const firstName =
                auth.type == "cliUserAuthContext"
                  ? auth.user.name
                  : auth.user.firstName,
              fullName =
                auth.type == "cliUserAuthContext"
                  ? auth.user.name
                  : [auth.user.firstName, auth.user.lastName].join(" ");

            return sendBulkEmail({
              to: user.email,
              subject: `${user.firstName}, you've been invited to access ${auth.org.name}'s EnvKey config`,
              bodyMarkdown: `Hi ${user.firstName},

${fullName} has invited you to access ${
                auth.org.name + (auth.org.name.endsWith("s") ? "'" : "'s")
              } EnvKey config.

EnvKey makes sharing api keys, environment variables, and application secrets easy and secure.

To accept, first go [here](https://www.envkey.com) and download the EnvKey UI for your platform.

After installing and starting the app, click the 'Accept Invitation' button on the first screen you see, then input the **Invite Token** below:

**${emailToken}**

You'll also need an **Encryption Token** that ${firstName} will send to you directly.

This invitation will remain valid for 24 hours.
`,
            });
          },
        ];

    return {
      type: "graphHandlerResult",
      transactionItems,
      graph: updatedGraph,
      postUpdateActions,
      handlerContext: {
        type: Api.ActionType.CREATE_INVITE,
        inviteId: invite.id,
        inviteeId: user.id,
      },
      logTargetIds: [user.id],
    };
  },
});

apiAction<
  Api.Action.RequestActions["LoadInvite"],
  Api.Net.ApiResultTypes["LoadInvite"],
  Auth.InviteAuthContext
>({
  type: Api.ActionType.LOAD_INVITE,
  graphAction: true,
  skipGraphUpdatedAtCheck: true,
  authenticated: true,
  graphResponse: "loadedInvite",
  graphAuthorizer: async (
    {
      payload,
      meta: {
        auth: { identityHash, emailToken: token },
      },
    },
    orgGraph,
    userGraph,
    auth,
    now
  ) => {
    const invite = R.find(
      R.propEq("identityHash", identityHash),
      getActiveInvites(orgGraph, now) as Api.Db.Invite[]
    );

    if (
      !invite ||
      invite.type != "invite" ||
      invite.deletedAt ||
      invite.acceptedAt
    ) {
      return false;
    }

    if (now >= invite.expiresAt) {
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
    const invite = auth.invite;

    if (invite.provider != "email" && !invite.externalAuthSessionVerifiedAt) {
      // saml or oauth
      return {
        type: "response",
        response: {
          type: "requiresExternalAuthError",
          ...pick(["id", "provider", "externalAuthProviderId", "uid"], invite),
          orgId: auth.org.id,
          error: true,
          errorStatus: 422,
          errorReason: "External auth required",
        },
        logTargetIds: [],
      };
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
      signedTrustedRoot: invite.signedTrustedRoot,
      logTargetIds: getFetchActionLogTargetIdsFn(orgGraph),
      backgroundLogTargetIds: getFetchActionBackgroundLogTargetIdsFn(orgGraph),
    };
  },
});

apiAction<
  Api.Action.RequestActions["RevokeInvite"],
  Api.Net.ApiResultTypes["RevokeInvite"]
>({
  type: Api.ActionType.REVOKE_INVITE,
  graphAction: true,
  authenticated: true,
  shouldClearOrphanedLocals: true,

  graphAuthorizer: async (
    { payload: { id } },
    orgGraph,
    userGraph,
    auth,
    now
  ) => authz.canRevokeInvite(userGraph, auth.user.id, id, now),
  graphHandler: async (
    action,
    orgGraph,
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    const invite = orgGraph[action.payload.id] as Api.Db.Invite;

    let { transactionItems, updatedGraph } = getDeleteUsersWithTransactionItems(
      auth,
      orgGraph,
      orgGraph,
      [invite.inviteeId],
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
      transactionItems,
      handlerContext: {
        type: action.type,
        invite,
      },
      logTargetIds: [invite.inviteeId],
    };
  },
});

apiAction<
  Api.Action.RequestActions["AcceptInvite"],
  Api.Net.ApiResultTypes["AcceptInvite"],
  Auth.InviteAuthContext
>({
  type: Api.ActionType.ACCEPT_INVITE,
  authenticated: true,
  graphAction: true,
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
    const invite = R.find(
      R.propEq("identityHash", identityHash),
      getActiveInvites(orgGraph, now) as Api.Db.Invite[]
    );
    if (
      !invite ||
      invite.type != "invite" ||
      invite.deletedAt ||
      invite.acceptedAt ||
      (invite.provider != "email" && !invite.externalAuthSessionVerifiedAt)
    ) {
      return false;
    }

    if (now >= invite.expiresAt) {
      return false;
    }

    return true;
  },
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    const invite = auth.invite,
      deviceId = invite.deviceId,
      orgUserDevice: Api.Db.OrgUserDevice = {
        type: "orgUserDevice",
        id: deviceId,
        ...graphKey.orgUserDevice(auth.org.id, invite.inviteeId, deviceId),
        userId: invite.inviteeId,
        name: payload.device.name,
        pubkey: payload.device.pubkey,
        pubkeyId: getPubkeyHash(payload.device.pubkey),
        pubkeyUpdatedAt: now,
        approvedByType: "invite",
        inviteId: invite.id,
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
        provider: invite.provider,
        uid: invite.uid,
        externalAuthProviderId: invite.externalAuthProviderId,
        expiresAt: Date.now() + auth.org.settings.auth.tokenExpirationMs,
        createdAt: now,
        updatedAt: now,
      },
      transactionItems: Api.Db.ObjectTransactionItems = {
        puts: [authToken],
        hardDeleteEncryptedKeyParams: [
          { orgId: auth.org.id, userId: auth.user.id, deviceId: invite.id },
        ],
      };

    let updatedGraph = produce(orgGraph, (draft) => {
      draft[invite.id] = {
        ...invite,
        acceptedAt: now,
        updatedAt: now,
      };

      draft[deviceId] = orgUserDevice;

      draft[auth.user.id] = {
        ...auth.user,
        deviceIds: [deviceId],
        inviteAcceptedAt: now,
        updatedAt: now,

        ...(env.IS_CLOUD &&
        (auth.org as any).lifecycleEmailsEnabled &&
        !auth.org.startedOrgImportAt
          ? {
              tertiaryIndex: LIFECYCLE_EMAILS_ENABLED,
            }
          : {}),
      };

      if (invite.v1Invite) {
        for (let localKey of getLocalKeysByUserId(orgGraph)[auth.user.id] ??
          []) {
          if (localKey.isV1UpgradeKey) {
            (draft[localKey.id] as Api.Db.LocalKey).deviceId = deviceId;
          }
        }
      }

      const replacementDrafts = graphTypes(draft)
        .rootPubkeyReplacements as Api.Db.RootPubkeyReplacement[];

      for (let replacementDraft of replacementDrafts) {
        if (replacementDraft.processedAtById[invite.id] === false) {
          replacementDraft.processedAtById[invite.id] = now;
          replacementDraft.updatedAt = now;
        }
      }
    });

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      transactionItems,
      handlerContext: {
        type: Api.ActionType.ACCEPT_INVITE,
        authToken,
        orgUserDevice,
        invite,
      },
      logTargetIds: [invite.inviteeId],
    };
  },
});

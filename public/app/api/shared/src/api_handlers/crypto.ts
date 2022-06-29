import { updateTrustedRoot } from "../models/crypto";
import { getPubkeyHash } from "@core/lib/client";
import * as R from "ramda";
import { apiAction } from "../handler";
import { Api, Model, Graph } from "@core/types";
import {
  authz,
  deleteGraphObjects,
  graphTypes,
  getUserIsImmediatelyDeletable,
  getDeviceIsImmediatelyDeletable,
  getActiveOrExpiredInvitesByInviteeId,
  getActiveOrExpiredDeviceGrantsByGranteeId,
  getActiveDeviceGrants,
  getActiveInvites,
  getActiveRecoveryKeys,
} from "@core/lib/graph";
import produce from "immer";
import { v4 as uuid } from "uuid";
import * as graphKey from "../graph_key";
import { setEnvsUpdatedFields } from "../graph";
import { log } from "@core/lib/utils/logger";

apiAction<
  Api.Action.RequestActions["UpdateTrustedRootPubkey"],
  Api.Net.ApiResultTypes["UpdateTrustedRootPubkey"]
>({
  type: Api.ActionType.UPDATE_TRUSTED_ROOT_PUBKEY,
  authenticated: true,
  graphAction: false,
  handler: async ({ payload }, auth, now, requestParams, transactionConn) => {
    const authObject =
      auth.type == "tokenAuthContext" ? auth.orgUserDevice : auth.user;

    return updateTrustedRoot(
      auth.org.id,
      authObject,
      payload.replacementIds,
      payload.signedTrustedRoot,
      now,
      transactionConn
    );
  },
});

apiAction<
  Api.Action.RequestActions["RevokeTrustedPubkeys"],
  Api.Net.ApiResultTypes["RevokeTrustedPubkeys"]
>({
  type: Api.ActionType.REVOKE_TRUSTED_PUBKEYS,
  authenticated: true,
  graphAction: true,
  shouldClearOrphanedLocals: true,
  graphAuthorizer: async ({ payload }, orgGraph, userGraph, auth) => {
    let replacingRoot = false;

    if (R.isEmpty(payload.byRequestId)) {
      return false;
    }

    for (let requestId in payload.byRequestId) {
      if (!userGraph[requestId]) {
        return false;
      }
      const targetId = payload.byRequestId[requestId];
      const target = userGraph[targetId] as
        | Model.OrgUserDevice
        | Model.CliUser
        | undefined;
      if (!target) {
        return false;
      }
      if ("isRoot" in target && target.isRoot) {
        replacingRoot = true;
      }

      if (!authz.canRevokeTrustedUserPubkey(orgGraph, auth.user.id, targetId)) {
        return false;
      }
    }

    if (
      replacingRoot &&
      (!payload.replacingRootTrustChain || !payload.signedTrustedRoot)
    ) {
      return false;
    }

    return true;
  },
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    const currentAuthId =
      auth.type == "tokenAuthContext" ? auth.orgUserDevice.id : auth.user.id;

    // we need to replace re-signed pubkeys, generate root pubkey revocations if revoking root, and delete the target
    let updatedGraph = produce(orgGraph, (draft) => {
      for (let signedKeyableId in payload.signedPubkeys) {
        const signedKeyable = draft[signedKeyableId];
        const reSignedPubkey = payload.signedPubkeys[signedKeyableId];
        if ("pubkey" in signedKeyable && "signedById" in signedKeyable) {
          signedKeyable.pubkey = reSignedPubkey;
          signedKeyable.pubkeyId = getPubkeyHash(reSignedPubkey);
          signedKeyable.pubkeyUpdatedAt = now;
          signedKeyable.signedById = currentAuthId;
          signedKeyable.updatedAt = now;
        }
      }
    });

    const toDeleteIds = new Set<string>();
    let replacingRootRequestId: string | undefined;
    let replacingRootId: string | undefined;

    for (let requestId in payload.byRequestId) {
      const targetId = payload.byRequestId[requestId];

      if (!getDeviceIsImmediatelyDeletable(updatedGraph, targetId)) {
        throw new Error(
          "All of device's envs / signed pubkeys weren't successfully cleared out"
        );
      }

      toDeleteIds.add(targetId);

      const target = updatedGraph[targetId] as
        | Model.OrgUserDevice
        | Model.CliUser;
      const userId = target.type == "cliUser" ? target.id : target.userId;

      // if user was deactivated, ensure user can now be deleted, then delete
      const user = updatedGraph[userId] as Model.OrgUser | Model.CliUser;
      if (user.deactivatedAt) {
        if (!getUserIsImmediatelyDeletable(updatedGraph, userId)) {
          throw new Error(
            "All of user's envs / signed pubkeys weren't successfully cleared out"
          );
        }

        toDeleteIds.add(userId);
        const invites =
            getActiveOrExpiredInvitesByInviteeId(orgGraph)[userId] ?? [],
          deviceGrants =
            getActiveOrExpiredDeviceGrantsByGranteeId(orgGraph)[userId] ?? [];
        for (let objs of [invites, deviceGrants]) {
          for (let { id } of objs) {
            toDeleteIds.add(id);
          }
        }
      }

      if ("isRoot" in target && target.isRoot) {
        replacingRootRequestId = requestId;
        replacingRootId = target.id;
      }
    }

    // Disabling until root pubkey replacement issue on 6-27-2022 can be fully debugged
    // updatedGraph = produce(updatedGraph, (draft) => {
    //   if (replacingRootId && replacingRootRequestId) {
    //     const [currentAuthId, currentPubkey] =
    //       auth.type == "tokenAuthContext"
    //         ? [auth.orgUserDevice.id, auth.orgUserDevice.pubkey]
    //         : [auth.user.id, auth.user.pubkey];

    //     // set revoking device as the new root
    //     const currentAuthDraft = draft[currentAuthId] as
    //       | Api.Db.OrgUserDevice
    //       | Api.Db.CliUser;

    //     currentAuthDraft.isRoot = true;
    //     currentAuthDraft.signedTrustedRoot = payload.signedTrustedRoot!;
    //     currentAuthDraft.trustedRootUpdatedAt = now;
    //     currentAuthDraft.updatedAt = now;

    //     const { orgUserDevices, cliUsers, generatedEnvkeys } =
    //       graphTypes(updatedGraph);

    //     const toProcess = (
    //       [
    //         ...orgUserDevices,
    //         ...cliUsers,
    //         ...generatedEnvkeys,
    //       ] as Graph.GraphObject[]
    //     )
    //       .filter(
    //         R.allPass([
    //           R.complement(R.propEq("id", currentAuthId)),
    //           ({ deletedAt }) => !deletedAt,
    //           ({ deactivatedAt }) => !deactivatedAt,
    //         ])
    //       )
    //       .concat([
    //         ...getActiveInvites(updatedGraph, now),
    //         ...getActiveDeviceGrants(updatedGraph, now),
    //         ...getActiveRecoveryKeys(updatedGraph),
    //       ]);

    //     if (toProcess.length > 0) {
    //       const rootPubkeyReplacementId = uuid();
    //       const rootPubkeyReplacement: Api.Db.RootPubkeyReplacement = {
    //         type: "rootPubkeyReplacement",
    //         id: rootPubkeyReplacementId,
    //         ...graphKey.rootPubkeyReplacement(
    //           auth.org.id,
    //           rootPubkeyReplacementId
    //         ),
    //         requestId: replacingRootRequestId,
    //         creatorId: currentAuthId,
    //         replacingPubkeyId: getPubkeyHash(currentPubkey),
    //         replacingPubkey: currentPubkey,
    //         signedReplacingTrustChain: payload.replacingRootTrustChain!,
    //         excludeFromDeletedGraph: true,
    //         createdAt: now,
    //         updatedAt: now,
    //         processedAtById: R.mergeAll(
    //           toProcess.map(({ id }) => ({ [id]: false as false | number }))
    //         ),
    //       };
    //       draft[rootPubkeyReplacementId] = rootPubkeyReplacement;
    //     }
    //   }
    // });

    // queue requests for deletion
    for (let requestId in payload.byRequestId) {
      toDeleteIds.add(requestId);
    }

    return {
      type: "graphHandlerResult",
      graph: deleteGraphObjects(updatedGraph, Array.from(toDeleteIds), now),
      logTargetIds: [],
    };
  },
});

apiAction<
  Api.Action.RequestActions["ReencryptEnvs"],
  Api.Net.ApiResultTypes["ReencryptEnvs"]
>({
  type: Api.ActionType.REENCRYPT_ENVS,
  authenticated: true,
  graphAction: true,
  // no graphAuthorizer needed here since blob updates are authorized at the handler level
  graphHandler: async ({ payload: { blobs } }, orgGraph, auth, now) => {
    let { updatedGraph } = setEnvsUpdatedFields(auth, orgGraph, blobs, now);

    updatedGraph = produce(updatedGraph, (draft) => {
      for (let envParentId in blobs) {
        const { environments, locals } = blobs[envParentId];

        if (environments) {
          for (let environmentId of Object.keys(environments)) {
            if (environments[environmentId].env) {
              const environmentDraft = draft[
                environmentId
              ] as Model.Environment;
              if (environmentDraft.reencryptionRequiredAt) {
                delete environmentDraft.reencryptionRequiredAt;
                environmentDraft.updatedAt = now;
              }
            }
          }
        }
        if (locals) {
          const envParentDraft = draft[envParentId] as Model.EnvParent;
          for (let localsUserId of Object.keys(locals)) {
            if (envParentDraft.localsReencryptionRequiredAt[localsUserId]) {
              delete envParentDraft.localsReencryptionRequiredAt[localsUserId];
              envParentDraft.updatedAt = now;
            }
          }
        }
      }
    });

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      logTargetIds: [],
    };
  },
});

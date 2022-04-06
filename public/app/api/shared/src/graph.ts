import { getActiveOrgGraphObjects, getDeletedOrgGraphObjects } from "./db";
import * as graphKey from "./graph_key";
import { Graph, Rbac, Model, Api, Auth } from "@core/types";
import { env } from "./env";
import { verifySignedLicense } from "./auth";
import { getOrgBillingId } from "./billing";
import * as R from "ramda";
import { pick } from "@core/lib/utils/pick";
import produce, { Draft } from "immer";
import {
  graphTypes,
  getUserGraph,
  getOrgAccessSet,
  getOrgUserDevicesByUserId,
  getAppUserGrantsByUserId,
  getLocalKeysByUserId,
  getLocalKeysByDeviceId,
  getActiveRecoveryKeysByUserId,
  getGroupMembershipsByObjectId,
  getActiveOrExpiredDeviceGrantsByGrantedByUserId,
  getActiveOrExpiredInvitesByInviteeId,
  getActiveOrExpiredDeviceGrantsByGranteeId,
  getUserIsImmediatelyDeletable,
  getDeviceIsImmediatelyDeletable,
  deleteGraphObjects,
  getEnvParentPermissions,
  getOrgPermissions,
  getOrg,
  getActiveInvitesByInviteeId,
  getActiveDeviceGrantsByGranteeId,
} from "@core/lib/graph";
import { v4 as uuid } from "uuid";
import { objectDifference } from "@core/lib/utils/object";
import { PoolConnection } from "mysql2/promise";
import { log } from "@core/lib/utils/logger";
import { indexBy } from "@core/lib/utils/array";
import { asyncify } from "@core/lib/async";

export const getOrgGraph = async (
    orgId: string,
    readOpts: Api.Db.DbReadOpts,
    nonBaseScopes?: string[]
  ): Promise<Api.Graph.OrgGraph> => {
    // query for active graph items, add to graph
    const graphObjects = await getActiveOrgGraphObjects(
      orgId,
      readOpts,
      nonBaseScopes
    );

    return indexBy(R.prop("id"), graphObjects);
  },
  getDeletedOrgGraph = async (
    orgId: string,
    startsAt: number,
    endsAt: number,
    transactionConn: PoolConnection | undefined
  ): Promise<Api.Graph.OrgGraph> => {
    const graphObjects = await getDeletedOrgGraphObjects(
      orgId,
      startsAt,
      endsAt,
      transactionConn
    );
    return indexBy(R.prop("id"), graphObjects);
  },
  getApiUserGraph = (
    orgGraph: Api.Graph.OrgGraph,
    orgId: string,
    userId: string,
    deviceId: string | undefined,
    now: number,
    includeDeleted = false
  ) => {
    const org = orgGraph[orgId] as Api.Db.Org;
    let userGraph = getUserGraph(orgGraph, userId, deviceId, includeDeleted);
    const billingId = getOrgBillingId(org.id);
    const license = verifySignedLicense(orgId, org.signedLicense, now, false);

    if (env.IS_CLOUD) {
      return {
        ...userGraph,
        [org.id]: {
          ...org,
          billingId,
          ssoEnabled: true,
          teamsEnabled: true,
        },
        [license.id]: license,
      };
    }

    if (env.IS_ENTERPRISE) {
      return {
        ...userGraph,
        [org.id]: {
          ...org,
          billingId,
          selfHostedVersions: {
            api: env.API_VERSION_NUMBER!,
            infra: env.INFRA_VERSION_NUMBER!,
          },
          ssoEnabled: true,
          teamsEnabled: true,
        },
        [license.id]: license,
      };
    }

    // community
    return {
      ...userGraph,
      [org.id]: {
        ...org,
        billingId,
      },
      [license.id]: license,
    };
  },
  getAccessUpdated = async (
    previousGraph: Graph.Graph,
    nextGraph: Graph.Graph,
    scope: Rbac.OrgAccessScope
  ): Promise<Rbac.OrgAccessUpdated> => {
    const getOrgAccessSetAsync = asyncify("getOrgAccessSet", getOrgAccessSet);
    const getObjectDifferenceAsync = asyncify(
      "objectDifference",
      objectDifference
    );

    const [nextSet, prevSet] = await Promise.all([
      getOrgAccessSetAsync(nextGraph, scope),
      getOrgAccessSetAsync(previousGraph, scope),
    ]);

    const [granted, removed] = await Promise.all([
      getObjectDifferenceAsync(nextSet, prevSet),
      getObjectDifferenceAsync(prevSet, nextSet),
    ]);

    return { granted, removed };
  },
  setEnvsUpdatedFields = (
    auth: Auth.UserAuthContext,
    orgGraph: Api.Graph.OrgGraph,
    blobs: Api.Net.EnvParams["blobs"],
    now: number
  ) => {
    const encryptedById =
      auth.type == "tokenAuthContext" ? auth.orgUserDevice.id : auth.user.id;
    const updatingEnvironmentIds = new Set<string>();
    const updatingEnvParentIds = new Set<string>();

    const updatedGraph = produce(orgGraph, (draft) => {
      for (let envParentId in blobs) {
        const envParent = draft[envParentId] as Model.App | Model.Block;

        updatingEnvParentIds.add(envParentId);

        const { environments, locals } = blobs[envParentId];

        for (let environmentId in environments) {
          updatingEnvironmentIds.add(environmentId);

          const environment = draft[environmentId] as Model.Environment;

          environment.envUpdatedAt = now;
          environment.encryptedById = encryptedById;
          environment.updatedAt = now;
          envParent.envsUpdatedAt = now;
          envParent.envsOrLocalsUpdatedAt = now;
          envParent.updatedAt = now;
        }

        for (let localsUserId in locals) {
          envParent.localsUpdatedAtByUserId[localsUserId] = now;
          envParent.localsUpdatedAt = now;
          envParent.envsOrLocalsUpdatedAt = now;
          envParent.localsEncryptedBy[localsUserId] = encryptedById;
          envParent.updatedAt = now;
        }
      }
    });

    return {
      updatedGraph,
      updatingEnvironmentIds,
      updatingEnvParentIds,
    };
  },
  getGraphTransactionItems = (
    previousGraph: Api.Graph.OrgGraph,
    nextGraph: Api.Graph.OrgGraph,
    now: number
  ) => {
    const transactionItems: Api.Db.ObjectTransactionItems = {},
      toPut: { [id: string]: Api.Graph.GraphObject } = {},
      toDelete: Api.Graph.GraphObject[] = [];

    // compare each item in graph, checking equality / newly created / deleted
    for (let id in nextGraph) {
      const previous = previousGraph[id],
        next = nextGraph[id];

      if (next.deletedAt) {
        toDelete.push({
          ...next,
          updatedAt: now,
        });
      } else if (!previous || next.updatedAt == now) {
        toPut[next.id] = next;
      }
      // uncomment below to debug missing `updatedAt` timestamps
      // else if (
      //   env.NODE_ENV == "development" &&
      //   stableStringify(previous) != stableStringify(next)
      // ) {
      //   const msg =
      //     "Development-only error: graph object was updated but is missing updatedAt timestamp";
      //   log(msg, { previous, next, now });
      //   throw new Error(msg);
      // }
    }

    for (let obj of toDelete) {
      if (obj.id in toPut) {
        delete toPut[obj.id];
      }

      if (!transactionItems.softDeleteKeys) {
        transactionItems.softDeleteKeys = [];
      }
      transactionItems.softDeleteKeys.push(pick(["pkey", "skey"], obj));
    }

    for (let id in toPut) {
      const obj = toPut[id];
      if (!transactionItems.puts) {
        transactionItems.puts = [];
      }
      transactionItems.puts.push(obj);
    }

    return transactionItems;
  },
  deleteUser = (
    orgGraph: Api.Graph.OrgGraph,
    userId: string,
    auth: Auth.DefaultAuthContext | Auth.ProvisioningBearerAuthContext,
    now: number
  ): Api.Graph.OrgGraph => {
    const target = orgGraph[userId] as Api.Db.OrgUser | Api.Db.CliUser,
      byType = graphTypes(orgGraph),
      orgUserDevices = getOrgUserDevicesByUserId(orgGraph)[userId] ?? [],
      appUserGrants = getAppUserGrantsByUserId(orgGraph)[userId] ?? [],
      localKeys = getLocalKeysByUserId(orgGraph)[userId] ?? [],
      localKeyIds = localKeys.map(R.prop("id")),
      localKeyIdsSet = new Set(localKeyIds),
      generatedEnvkeys = byType.generatedEnvkeys.filter(({ keyableParentId }) =>
        localKeyIdsSet.has(keyableParentId)
      ),
      groupMemberships = getGroupMembershipsByObjectId(orgGraph)[userId] ?? [],
      appGroupUsers = byType.appGroupUsers.filter(R.propEq("userId", userId)),
      recoveryKey = getActiveRecoveryKeysByUserId(orgGraph)[userId],
      pendingOrExpiredGranterDeviceGrants =
        getActiveOrExpiredDeviceGrantsByGrantedByUserId(orgGraph)[userId] ?? [];

    let deleteIds: string[] = (
      [
        appUserGrants,
        generatedEnvkeys,
        groupMemberships,
        appGroupUsers,
        recoveryKey ? [recoveryKey] : [],
        pendingOrExpiredGranterDeviceGrants,
      ] as Api.Graph.GraphObject[][]
    ).flatMap((objects) => objects.map(R.prop("id")));

    let updatedGraph = produce(orgGraph, (draft) => {
      // clear out localsUpdatedAtByUserId / localsEncryptedBy entries
      const { apps, blocks } = byType;
      for (let envParents of [apps, blocks]) {
        for (let envParent of envParents) {
          const envParentDraft = draft[envParent.id] as Draft<Api.Db.EnvParent>;
          if (
            envParentDraft.localsUpdatedAtByUserId[userId] ||
            envParentDraft.localsEncryptedBy[userId]
          ) {
            delete envParentDraft.localsUpdatedAtByUserId[userId];
            delete envParentDraft.localsEncryptedBy[userId];
            envParentDraft.updatedAt = now;
          }
        }
      }

      // clear out any pending rootPubkeyReplacements for user + user's local keys
      const rootPubkeyReplacements =
        byType.rootPubkeyReplacements as Api.Db.RootPubkeyReplacement[];
      for (let replacement of rootPubkeyReplacements) {
        const replacementDraft = draft[
          replacement.id
        ] as Draft<Api.Db.RootPubkeyReplacement>;
        for (let objs of [orgUserDevices, generatedEnvkeys]) {
          for (let { id } of objs) {
            if (replacementDraft.processedAtById[id]) {
              delete replacementDraft.processedAtById[id];
              replacementDraft.updatedAt = now;
            }
          }
        }
        const replacementProcessedAll = R.all(
          Boolean,
          Object.values(replacementDraft.processedAtById)
        );
        if (replacementProcessedAll) {
          deleteIds.push(replacementDraft.id);
        }
      }
    });

    const canImmediatelyDelete = getUserIsImmediatelyDeletable(
      orgGraph,
      userId
    );

    let deletedDeviceLike = 0;
    let deletedUserOrInvite = 0;

    if (canImmediatelyDelete) {
      deleteIds.push(userId);

      if (target.type == "cliUser") {
        deletedDeviceLike++;
      } else {
        deletedUserOrInvite++;

        for (let { id } of orgUserDevices) {
          deleteIds.push(id);
          deletedDeviceLike++;
        }
      }

      const invites =
          getActiveOrExpiredInvitesByInviteeId(orgGraph)[userId] ?? [],
        deviceGrants =
          getActiveOrExpiredDeviceGrantsByGranteeId(orgGraph)[userId] ?? [];

      for (let objs of [invites, deviceGrants]) {
        for (let { id } of objs) {
          deleteIds.push(id);
          deletedDeviceLike++;
        }
      }

      deletedUserOrInvite += invites.length;
    } else {
      updatedGraph = produce(updatedGraph, (draft) => {
        (draft[target.id] as Api.Db.OrgUser | Api.Db.CliUser).deactivatedAt =
          now;
        (draft[target.id] as Api.Db.OrgUser | Api.Db.CliUser).updatedAt = now;

        if (target.type == "cliUser") {
          deletedDeviceLike++;

          const pubkeyRevocationRequest = getPubkeyRevocationRequest(
            auth,
            target,
            now
          );

          draft[pubkeyRevocationRequest.id] = pubkeyRevocationRequest;
        } else {
          for (let orgUserDevice of orgUserDevices) {
            deletedDeviceLike++;

            (draft[orgUserDevice.id] as Api.Db.OrgUserDevice).deactivatedAt =
              now;
            (draft[orgUserDevice.id] as Api.Db.OrgUserDevice).updatedAt = now;

            const pubkeyRevocationRequest = getPubkeyRevocationRequest(
              auth,
              orgUserDevice,
              now
            );

            draft[pubkeyRevocationRequest.id] = pubkeyRevocationRequest;
          }
        }
      });
    }

    deleteIds = deleteIds.concat(localKeyIds);
    updatedGraph = deleteGraphObjects(updatedGraph, deleteIds, now);

    if (deletedDeviceLike > 0 || deletedUserOrInvite > 0) {
      const org = getOrg(updatedGraph) as Api.Db.Org;
      updatedGraph = {
        ...updatedGraph,
        [org.id]: {
          ...org,
          deviceLikeCount: org.deviceLikeCount - deletedDeviceLike,
          activeUserOrInviteCount:
            org.activeUserOrInviteCount! - deletedUserOrInvite,
          updatedAt: now,
        },
      };
    }

    return updatedGraph;
  },
  deleteDevice = (
    orgGraph: Api.Graph.OrgGraph,
    deviceId: string,
    auth: Auth.DefaultAuthContext,
    now: number
  ): Api.Graph.OrgGraph => {
    const orgUserDevice = orgGraph[deviceId] as Api.Db.OrgUserDevice;

    const localKeys = getLocalKeysByDeviceId(orgGraph)[deviceId] ?? [],
      localKeyIds = localKeys.map(R.prop("id")),
      localKeyIdsSet = new Set(localKeyIds),
      generatedEnvkeys = graphTypes(orgGraph).generatedEnvkeys.filter(
        ({ keyableParentId }) => localKeyIdsSet.has(keyableParentId)
      );

    let deleteIds = [...localKeyIds, ...generatedEnvkeys.map(R.prop("id"))];

    let updatedGraph = produce(orgGraph, (draft) => {
      const draftsByType = graphTypes(draft);

      // clear out any pending rootPubkeyReplacements for this device
      const rootPubkeyReplacementDrafts =
        draftsByType.rootPubkeyReplacements as Api.Db.RootPubkeyReplacement[];
      for (let replacementDraft of rootPubkeyReplacementDrafts) {
        if (replacementDraft.processedAtById[deviceId]) {
          delete replacementDraft.processedAtById[deviceId];
          replacementDraft.updatedAt = now;
          const replacementProcessedAll = R.all(
            Boolean,
            Object.values(replacementDraft.processedAtById)
          );
          if (replacementProcessedAll) {
            deleteIds.push(replacementDraft.id);
          }
        }
      }
    });

    const canImmediatelyDelete = getDeviceIsImmediatelyDeletable(
      orgGraph,
      deviceId
    );

    if (canImmediatelyDelete) {
      deleteIds.push(deviceId);
    } else {
      updatedGraph = produce(updatedGraph, (draft) => {
        (draft[orgUserDevice.id] as Api.Db.OrgUserDevice).deactivatedAt = now;
        (draft[orgUserDevice.id] as Api.Db.OrgUserDevice).updatedAt = now;

        const pubkeyRevocationRequest = getPubkeyRevocationRequest(
          auth,
          orgUserDevice,
          now
        );
        draft[pubkeyRevocationRequest.id] = pubkeyRevocationRequest;
      });
    }

    if (deleteIds.length > 0) {
      updatedGraph = deleteGraphObjects(updatedGraph, deleteIds, now);
    }

    return updatedGraph;
  },
  clearOrphanedLocals = (
    orgGraph: Api.Graph.OrgGraph,
    now: number
  ): [Api.Graph.OrgGraph, Api.Db.ObjectTransactionItems] => {
    // delete blobs and clear localsUpdatedAt for any users that previously had access and no longer do
    const hardDeleteEncryptedBlobParams: Api.Db.ObjectTransactionItems["hardDeleteEncryptedBlobParams"] =
      [];

    const { apps, blocks, org } = graphTypes(orgGraph);

    const updatedOrgGraph = produce(orgGraph, (draft) => {
      for (let envParent of (apps as Model.EnvParent[]).concat(blocks)) {
        if (envParent.deletedAt) {
          continue;
        }

        for (let localsUserId in envParent.localsUpdatedAtByUserId) {
          const localsUser = orgGraph[localsUserId] as
            | Model.OrgUser
            | Model.CliUser
            | undefined;

          let shouldClear = false;

          if (localsUser && !localsUser.deletedAt) {
            const orgPermissions = getOrgPermissions(
              orgGraph,
              localsUser.orgRoleId
            );

            const envParentPermissions = getEnvParentPermissions(
              orgGraph,
              envParent.id,
              localsUserId
            );

            if (
              !orgPermissions.has("blocks_read_all") &&
              !envParentPermissions.has("app_read_own_locals")
            ) {
              shouldClear = true;
            }
          } else {
            shouldClear = true;
          }

          if (shouldClear) {
            const envParentDraft = draft[
              envParent.id
            ] as Draft<Api.Db.EnvParent>;
            delete envParentDraft.localsUpdatedAtByUserId[localsUserId];
            delete envParentDraft.localsEncryptedBy[localsUserId];
            envParentDraft.updatedAt = now;

            hardDeleteEncryptedBlobParams.push({
              orgId: org.id,
              envParentId: envParent.id,
              blobType: "env",
              environmentId: envParent.id + "|" + localsUserId,
            });
          }
        }
      }
    });

    return [updatedOrgGraph, { hardDeleteEncryptedBlobParams }];
  };

const getPubkeyRevocationRequest = (
  auth: Auth.DefaultAuthContext | Auth.ProvisioningBearerAuthContext,
  revocationTarget: Model.OrgUserDevice | Model.CliUser,
  now: number
) => {
  const pubkeyRevocationRequestId = uuid(),
    pubkeyRevocationRequest: Api.Db.PubkeyRevocationRequest = {
      type: "pubkeyRevocationRequest",
      id: pubkeyRevocationRequestId,
      ...graphKey.pubkeyRevocationRequest(
        auth.org.id,
        pubkeyRevocationRequestId
      ),
      targetId: revocationTarget.id,
      // OrgUser.id or ProvisioningProvider.id. Informational prop only (?)
      creatorId:
        "provisioningProvider" in auth
          ? auth.provisioningProvider.id
          : auth.user.id,
      excludeFromDeletedGraph: true,
      createdAt: now,
      updatedAt: now,
    };
  return pubkeyRevocationRequest;
};

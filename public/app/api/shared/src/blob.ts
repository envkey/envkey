import { pick } from "@core/lib/utils/pick";
import { Api, Model, Blob, Auth, Crypto } from "@core/types";
import produce from "immer";
import {
  userEncryptedKeyPkey,
  encryptedBlobPkey,
  getSkey,
  getScope,
  getUserEncryptedKeyOrBlobComposite,
} from "@core/lib/blob";
import {
  authz,
  getEnvironmentsByEnvParentId,
  getConnectedBlockEnvironmentsForApp,
  getBlockSortVal,
  getConnectedBlocksForApp,
  graphTypes,
  getActiveGraph,
  getOrgPermissions,
  getEnvParentPermissions,
  getActiveOrExpiredInvitesByInvitedByUserId,
} from "@core/lib/graph";
import * as R from "ramda";
import { query, mergeObjectTransactionItems } from "./db";
import { objectPaths } from "@core/lib/utils/object";
import { indexBy, groupBy } from "@core/lib/utils/array";
import { v4 as uuid } from "uuid";
import { log } from "@core/lib/utils/logger";
import { deleteUser } from "./graph";

export const getUserEncryptedKeys = async (
  params:
    | Blob.UserEncryptedKeyPkeyWithScopeParams
    | Blob.UserEncryptedKeyPkeyWithScopeParams[],
  queryParams: Omit<
    Api.Db.QueryParams,
    "pkey" | "scope" | "pkeyScope" | "pkeysWithScopes"
  >
) => {
  let toQuery: Api.Db.QueryParams;

  if (Array.isArray(params)) {
    const pkeysWithScopes = params.map((p) => ({
      pkey: userEncryptedKeyPkey(p),
      scope: getScope(p),
    }));
    toQuery = {
      pkeysWithScopes,
      ...queryParams,
    };
  } else {
    const pkey = userEncryptedKeyPkey(params);
    const scope = getScope(params);
    toQuery = {
      pkey,
      scope,
      ...queryParams,
    };
  }

  return query<Api.Db.UserEncryptedKey>(toQuery);
};
export const getEnvEncryptedKeys = (
  params:
    | Blob.UserEncryptedKeyPkeyWithScopeParams
    | Blob.UserEncryptedKeyPkeyWithScopeParams[],
  queryParams: Pick<Api.Db.QueryParams, "transactionConn">
) =>
  getUserEncryptedKeys(
    Array.isArray(params)
      ? params.map((p) => ({ ...p, blobType: "env" }))
      : {
          ...params,
          blobType: "env",
        },
    queryParams
  ).then((encryptedKeys) => {
    return indexBy(
      getUserEncryptedKeyOrBlobComposite,
      encryptedKeys.map(R.omit(["pkey", "skey"]))
    );
  }) as Promise<Blob.UserEncryptedKeysByEnvironmentIdOrComposite>;

type ChangesetEncryptedKeysScopeParams = Omit<
  Blob.UserEncryptedKeyPkeyWithScopeParams,
  "blobType"
> &
  Api.Net.FetchChangesetOptions;
export const getChangesetEncryptedKeys = (
  params:
    | ChangesetEncryptedKeysScopeParams
    | ChangesetEncryptedKeysScopeParams[],
  queryParams: Pick<Api.Db.QueryParams, "transactionConn">
) => {
  const paramsWithBlobType = Array.isArray(params)
    ? params.map(
        (p) =>
          ({
            ...p,
            blobType: "changeset",
          } as Blob.UserEncryptedKeyPkeyWithScopeParams)
      )
    : ({
        ...params,
        blobType: "changeset",
      } as Blob.UserEncryptedKeyPkeyWithScopeParams);

  return getUserEncryptedKeys(paramsWithBlobType, {
    ...queryParams,
    createdAfter: undefined,
    sortBy: "createdAt",
  }).then((encryptedKeys) =>
    indexBy(
      ({ environmentId }) => environmentId!,
      encryptedKeys.map(R.omit(["pkey", "skey"]))
    )
  ) as Promise<Blob.UserEncryptedChangesetKeysByEnvironmentId>;
};
export const getUserEncryptedKey = (
  params: Blob.UserEncryptedKeyParams
): Api.Db.DbKey => {
  let secondaryIndex: string | undefined;

  if ("envType" in params) {
    if (params.envType == "inheritanceOverrides") {
      secondaryIndex =
        "inheritanceOverrides|" +
        params.envParentId +
        "|" +
        params.inheritsEnvironmentId;
    } else if (params.envType == "localOverrides") {
      secondaryIndex =
        "localOverrides|" + params.environmentId.split("|").reverse().join("|");
    }
  } else if (
    params.blobType == "changeset" &&
    params.environmentId.split("|").length == 2
  ) {
    secondaryIndex =
      "localOverrides|" + params.environmentId.split("|").reverse().join("|");
  }

  return {
    pkey: userEncryptedKeyPkey(params),
    skey: getSkey(params)!,
    secondaryIndex,
  };
};
export const getEncryptedBlobs = async (
  params:
    | Blob.EncryptedBlobPkeyWithScopeParams
    | Blob.EncryptedBlobPkeyWithScopeParams[],
  queryParams: Omit<
    Api.Db.QueryParams,
    "pkey" | "scope" | "pkeyScope" | "pkeysWithScopes"
  >
) => {
  let toQuery: Api.Db.QueryParams;

  if (Array.isArray(params)) {
    const pkeysWithScopes = params.map((p) => ({
      pkey: encryptedBlobPkey(p),
      scope: getScope(p),
    }));
    toQuery = {
      pkeysWithScopes,
      ...queryParams,
    };
  } else {
    const pkey = encryptedBlobPkey(params);
    const scope = getScope(params);
    toQuery = {
      pkey,
      scope,
      ...queryParams,
    };
  }

  return query<Api.Db.EncryptedBlob>(toQuery);
};
export const getEnvEncryptedBlobs = (
  params:
    | Blob.EncryptedBlobPkeyWithScopeParams
    | Blob.EncryptedBlobPkeyWithScopeParams[],
  queryParams: Pick<Api.Db.QueryParams, "transactionConn">
) =>
  getEncryptedBlobs(
    Array.isArray(params)
      ? params.map(
          (p) =>
            ({ ...p, blobType: "env" } as Blob.EncryptedBlobPkeyParams &
              Blob.ScopeParams)
        )
      : ({
          ...params,
          blobType: "env",
        } as Blob.EncryptedBlobPkeyParams & Blob.ScopeParams),
    queryParams
  ).then((blobs) => {
    return indexBy(
      getUserEncryptedKeyOrBlobComposite,
      blobs.map(R.omit(["pkey", "skey"]))
    );
  }) as Promise<Blob.UserEncryptedBlobsByComposite>;

type ChangesetBlobsScopeParams = Omit<
  Blob.EncryptedBlobPkeyWithScopeParams,
  "blobType"
> &
  Api.Net.FetchChangesetOptions;
export const getChangesetEncryptedBlobs = (
  params: ChangesetBlobsScopeParams | ChangesetBlobsScopeParams[],
  queryParams: Pick<Api.Db.QueryParams, "transactionConn">
) => {
  const paramsWithBlobType = Array.isArray(params)
    ? params.map(
        (p) =>
          ({
            ...p,
            blobType: "changeset",
          } as Blob.EncryptedBlobPkeyWithScopeParams)
      )
    : ({
        ...params,
        blobType: "changeset",
      } as Blob.EncryptedBlobPkeyWithScopeParams);

  return getEncryptedBlobs(paramsWithBlobType, {
    ...queryParams,
    createdAfter:
      ("createdAfter" in paramsWithBlobType &&
        paramsWithBlobType.createdAfter) ||
      undefined,
    sortBy: "createdAt",
  }).then((blobs) => {
    return groupBy(
      ({ environmentId }) => environmentId!,
      blobs.map(R.omit(["pkey", "skey"]))
    );
  }) as Promise<Blob.UserEncryptedBlobsByEnvironmentId>;
};
export const getEncryptedBlobKey = (
  params: Blob.EncryptedBlobParams
): Api.Db.DbKey => {
  let secondaryIndex: string | undefined;

  if ("envType" in params) {
    if (params.envType == "inheritanceOverrides") {
      secondaryIndex =
        "inheritanceOverrides|" +
        params.envParentId +
        "|" +
        params.inheritsEnvironmentId;
    } else if (params.envType == "localOverrides") {
      secondaryIndex =
        "localOverrides|" + params.environmentId.split("|").reverse().join("|");
    }
  } else if (
    params.blobType == "changeset" &&
    params.environmentId.split("|").length == 2
  ) {
    secondaryIndex =
      "localOverrides|" + params.environmentId.split("|").reverse().join("|");
  }

  return {
    pkey: encryptedBlobPkey(params),
    skey: getSkey(params)!,
    secondaryIndex,
  };
};
export const getDeleteGeneratedEnvkeyEncryptedKeys = (
  originalGraph: Api.Graph.OrgGraph,
  keyableParentId: string,
  generatedEnvkeyId: string,
  generatedEnvkeyToDelete: Blob.GeneratedEnvkeySet,
  blockId?: string
): Api.Db.DbKey[] => {
  let keys: Api.Db.DbKey[] = [];

  const generatedEnvkey = originalGraph[
    generatedEnvkeyId
  ] as Api.Db.GeneratedEnvkey;

  const keyableParent = originalGraph[
    generatedEnvkeyId
  ] as Api.Db.KeyableParent;

  for (let blobType of [
    "env",
    "localOverrides",
    "subEnv",
  ] as (keyof Model.GeneratedEnvkeyFields)[]) {
    if (generatedEnvkeyToDelete[blobType]) {
      keys.push(
        getGeneratedEnvkeyEncryptedKey(
          generatedEnvkey.envkeyIdPart,
          blobType,
          generatedEnvkey.appId,
          blockId,
          undefined,
          blobType == "localOverrides" && keyableParent.type == "localKey"
            ? keyableParent.userId
            : undefined
        )
      );
    }
  }

  if (generatedEnvkeyToDelete.inheritanceOverrides) {
    const environmentIds = generatedEnvkeyToDelete.inheritanceOverrides;

    keys = keys.concat(
      environmentIds.map((environmentId) =>
        getGeneratedEnvkeyEncryptedKey(
          generatedEnvkey.envkeyIdPart,
          "inheritanceOverrides",
          generatedEnvkey.appId,
          blockId,
          environmentId
        )
      )
    );
  }

  return keys;
};
export const getDeleteEncryptedKeysTransactionItems = async (
  auth: Auth.AuthContext,
  originalGraph: Api.Graph.OrgGraph,
  toDelete: Blob.KeySet
): Promise<
  Pick<
    Api.Db.ObjectTransactionItems,
    "hardDeleteKeys" | "hardDeleteEncryptedKeyParams"
  >
> => {
  let hardDeleteKeys: Api.Db.ObjectTransactionItems["hardDeleteKeys"] = [],
    hardDeleteEncryptedKeyParams: Api.Db.ObjectTransactionItems["hardDeleteEncryptedKeyParams"] =
      [];

  if (toDelete.users) {
    for (let userId in toDelete.users) {
      for (let deviceId in toDelete.users[userId]) {
        const deviceToDelete = toDelete.users[userId][deviceId];
        for (let envParentId in deviceToDelete) {
          const { environments, locals } = deviceToDelete[envParentId];

          if (environments) {
            for (let environmentId in environments) {
              const environmentToDelete = environments[environmentId];
              if (environmentToDelete.env) {
                hardDeleteKeys.push(
                  getUserEncryptedKey({
                    orgId: auth.org.id,
                    userId,
                    deviceId,
                    envParentId,
                    environmentId,
                    blobType: "env",
                    envType: "env",
                    envPart: "env",
                  })
                );
              }
              if (environmentToDelete.meta) {
                hardDeleteKeys.push(
                  getUserEncryptedKey({
                    orgId: auth.org.id,
                    userId,
                    deviceId,
                    envParentId,
                    environmentId,
                    blobType: "env",
                    envType: "env",
                    envPart: "meta",
                  })
                );
              }

              if (environmentToDelete.inherits) {
                hardDeleteKeys.push(
                  getUserEncryptedKey({
                    orgId: auth.org.id,
                    userId,
                    deviceId,
                    envParentId,
                    environmentId,
                    blobType: "env",
                    envType: "env",
                    envPart: "inherits",
                  })
                );
              }

              if (environmentToDelete.changesets) {
                hardDeleteEncryptedKeyParams.push({
                  orgId: auth.org.id,
                  userId,
                  deviceId,
                  envParentId,
                  environmentId,
                  blobType: "changeset",
                });
              }

              if (
                environmentToDelete.env ||
                environmentToDelete.inheritanceOverrides
              ) {
                let siblingBaseEnvironmentIds: string[] = [];

                if (environmentToDelete.env) {
                  siblingBaseEnvironmentIds = (
                    getEnvironmentsByEnvParentId(originalGraph)[envParentId] ||
                    []
                  )
                    .filter(({ id, isSub }) => id != environmentId && !isSub)
                    .map(R.prop("id"));
                } else if (environmentToDelete.inheritanceOverrides) {
                  siblingBaseEnvironmentIds =
                    environmentToDelete.inheritanceOverrides;
                }

                for (let siblingEnvironmentId of siblingBaseEnvironmentIds) {
                  hardDeleteKeys.push(
                    getUserEncryptedKey({
                      orgId: auth.org.id,
                      userId,
                      deviceId,
                      envParentId,
                      environmentId,
                      blobType: "env",
                      envType: "inheritanceOverrides",
                      inheritsEnvironmentId: siblingEnvironmentId,
                      envPart: "env",
                    })
                  );
                }
              }
            }
          }

          if (locals) {
            for (let localsUserId in locals) {
              const localsToDelete = locals[localsUserId];
              if (localsToDelete.env) {
                hardDeleteKeys.push(
                  getUserEncryptedKey({
                    orgId: auth.org.id,
                    userId,
                    deviceId,
                    envParentId,
                    environmentId: envParentId + "|" + localsUserId,
                    blobType: "env",
                    envType: "localOverrides",
                    envPart: "env",
                  })
                );
              }
              if (localsToDelete.meta) {
                hardDeleteKeys.push(
                  getUserEncryptedKey({
                    orgId: auth.org.id,
                    userId,
                    deviceId,
                    envParentId,
                    environmentId: envParentId + "|" + localsUserId,
                    blobType: "env",
                    envType: "localOverrides",
                    envPart: "meta",
                  })
                );
              }
              if (localsToDelete.changesets) {
                hardDeleteEncryptedKeyParams.push({
                  orgId: auth.org.id,
                  userId,
                  deviceId,
                  envParentId,
                  environmentId: envParentId + "|" + localsUserId,
                  blobType: "changeset",
                });
              }
            }
          }
        }
      }
    }
  }

  if (toDelete.keyableParents) {
    for (let keyableParentId in toDelete.keyableParents) {
      for (let generatedEnvkeyId in toDelete.keyableParents[keyableParentId]) {
        const generatedEnvkeyToDelete =
          toDelete.keyableParents[keyableParentId][generatedEnvkeyId];
        hardDeleteKeys = hardDeleteKeys.concat(
          getDeleteGeneratedEnvkeyEncryptedKeys(
            originalGraph,
            keyableParentId,
            generatedEnvkeyId,
            generatedEnvkeyToDelete
          )
        );
      }
    }
  }

  if (toDelete.blockKeyableParents) {
    for (let blockId in toDelete.blockKeyableParents) {
      for (let keyableParentId in toDelete.blockKeyableParents[blockId]) {
        for (let generatedEnvkeyId in toDelete.blockKeyableParents[blockId][
          keyableParentId
        ]) {
          const generatedEnvkeyToDelete =
            toDelete.blockKeyableParents[blockId][keyableParentId][
              generatedEnvkeyId
            ];
          hardDeleteKeys = hardDeleteKeys.concat(
            getDeleteGeneratedEnvkeyEncryptedKeys(
              originalGraph,
              keyableParentId,
              generatedEnvkeyId,
              generatedEnvkeyToDelete,
              blockId
            )
          );
        }
      }
    }
  }

  return {
    hardDeleteKeys,
    hardDeleteEncryptedKeyParams,
  };
};
export const getGeneratedEnvkeyEncryptedKey = (
  envkeyIdPart: string,
  blobType: keyof Model.GeneratedEnvkeyFields,
  appId: string,
  blockId?: string,
  inheritanceOverridesEnvironmentId?: string,
  localsUserId?: string
): Api.Db.DbKey => {
  let skey: string = blobType;
  let secondaryIndex: string | undefined;
  let tertiaryIndex: string | undefined;
  if (blockId) {
    skey = blockId + "|" + skey;
  }
  if (inheritanceOverridesEnvironmentId) {
    skey = skey + "|" + inheritanceOverridesEnvironmentId;

    secondaryIndex =
      "inheritanceOverrides|" + appId + "|" + inheritanceOverridesEnvironmentId;

    if (blockId) {
      tertiaryIndex =
        "inheritanceOverrides|" +
        blockId +
        "|" +
        inheritanceOverridesEnvironmentId;
    }
  } else if (blobType == "localOverrides" && localsUserId) {
    secondaryIndex = "localOverrides|" + localsUserId + "|" + appId;

    if (blockId) {
      tertiaryIndex = "localOverrides|" + localsUserId + "|" + blockId;
    }
  }
  return {
    pkey: "envkey|" + envkeyIdPart,
    skey,
    secondaryIndex,
    tertiaryIndex,
  };
};
export const getGeneratedEnvkeyEncryptedKeyFieldTransactionItems = (
  auth: Auth.UserAuthContext,
  encryptedByTrustChain: Crypto.SignedData,
  envkeyIdPart: string,
  keyableParentId: string,
  generatedEnvkeyId: string,
  update: Api.Net.GeneratedEnvkeyEncryptedKeyParams,
  now: number,
  envType: keyof Model.GeneratedEnvkeyFields,
  envParentId: string,
  environmentId: string,
  userId: string | undefined,
  inheritsEnvironmentId: string | undefined,
  blockId?: string,
  orderIndex?: number
): Api.Db.ObjectTransactionItems => {
  const key = getGeneratedEnvkeyEncryptedKey(
      envkeyIdPart,
      envType,
      envParentId,
      blockId,
      envType == "inheritanceOverrides" ? inheritsEnvironmentId : undefined
    ),
    blobUpdate =
      envType == "inheritanceOverrides"
        ? update.inheritanceOverrides![inheritsEnvironmentId!]
        : update[envType]!;

  let encryptedByPubkey: Crypto.Pubkey;
  if (auth.type == "tokenAuthContext") {
    encryptedByPubkey = auth.orgUserDevice.pubkey!;
  } else if (auth.type == "cliUserAuthContext") {
    encryptedByPubkey = auth.user.pubkey;
  } else {
    return {};
  }

  const generatedEnvkeyEncryptedKey: Api.Db.GeneratedEnvkeyEncryptedKey = {
    ...pick(["data"], blobUpdate),
    ...key,
    type: "generatedEnvkeyEncryptedKey",
    encryptedById:
      auth.type == "tokenAuthContext" ? auth.orgUserDevice.id : auth.user.id,
    encryptedByPubkey,
    envParentId,
    environmentId,
    inheritsEnvironmentId,
    keyableParentId,
    generatedEnvkeyId,
    userId,
    blockId,
    envType,
    orderIndex,
    encryptedByTrustChain,
    createdAt: now,
    updatedAt: now,
  };

  return {
    puts: [generatedEnvkeyEncryptedKey],
  };
};
export const getGeneratedEnvkeyEncryptedKeyTransactionItems = (
  auth: Auth.UserAuthContext,
  originalGraph: Api.Graph.OrgGraph,
  updatedGraph: Api.Graph.OrgGraph,
  encryptedByTrustChain: Crypto.SignedData,
  keyableParentId: string,
  generatedEnvkeyId: string,
  update: Api.Net.GeneratedEnvkeyEncryptedKeyParams,
  now: number,
  blockId?: string
): Api.Db.ObjectTransactionItems => {
  let transactionItems: Api.Db.ObjectTransactionItems = {};

  const keyableParent = originalGraph[keyableParentId] as Api.Db.KeyableParent,
    keyableParentEnvironment = originalGraph[
      keyableParent.environmentId
    ] as Model.Environment,
    generatedEnvkey = updatedGraph[generatedEnvkeyId] as Api.Db.GeneratedEnvkey;

  for (let envType of generatedEnvkeyEnvTypes) {
    if (!update[envType]) {
      continue;
    }

    let environmentId: string | undefined;
    if (envType == "localOverrides" && keyableParent.type == "localKey") {
      environmentId =
        (blockId ?? keyableParent.appId) + "|" + keyableParent.userId;
    } else {
      if (blockId) {
        const [blockEnvironment] = getConnectedBlockEnvironmentsForApp(
          originalGraph,
          keyableParent.appId,
          blockId,
          keyableParent.environmentId
        );

        if (blockEnvironment) {
          environmentId =
            blockEnvironment.isSub && envType == "env"
              ? blockEnvironment.parentEnvironmentId
              : blockEnvironment.id;
        }
      } else {
        environmentId =
          keyableParentEnvironment.isSub && envType == "env"
            ? keyableParentEnvironment.parentEnvironmentId
            : keyableParentEnvironment.id;
      }
    }

    if (!environmentId) {
      continue;
    }

    if (envType == "inheritanceOverrides" && update.inheritanceOverrides) {
      for (let inheritsEnvironmentId in update.inheritanceOverrides) {
        const { envParentId } = updatedGraph[
          inheritsEnvironmentId
        ] as Model.Environment;

        transactionItems = mergeObjectTransactionItems([
          transactionItems,
          getGeneratedEnvkeyEncryptedKeyFieldTransactionItems(
            auth,
            encryptedByTrustChain,
            generatedEnvkey.envkeyIdPart,
            keyableParentId,
            generatedEnvkeyId,
            update,
            now,
            envType,
            envParentId,
            environmentId,
            keyableParent.type == "localKey" ? keyableParent.userId : undefined,
            inheritsEnvironmentId,
            blockId,
            blockId
              ? getBlockSortVal(updatedGraph, keyableParent.appId, blockId)
              : undefined
          ),
        ]);
      }
    } else {
      transactionItems = mergeObjectTransactionItems([
        transactionItems,
        getGeneratedEnvkeyEncryptedKeyFieldTransactionItems(
          auth,
          encryptedByTrustChain,
          generatedEnvkey.envkeyIdPart,
          keyableParentId,
          generatedEnvkeyId,
          update,
          now,
          envType,
          keyableParentEnvironment.envParentId,
          environmentId,
          keyableParent.type == "localKey" ? keyableParent.userId : undefined,
          undefined,
          blockId,
          blockId
            ? getBlockSortVal(updatedGraph, keyableParent.appId, blockId)
            : undefined
        ),
      ]);
    }
  }

  return transactionItems;
};
export const getEnvParamsTransactionItems = (
  auth: Auth.UserAuthContext,
  originalGraph: Api.Graph.OrgGraph,
  updatedGraph: Api.Graph.OrgGraph,
  action: Api.Action.RequestAction,
  now: number,
  handlerContext?: Api.HandlerContext
) => {
  const envParams = action.payload as Api.Net.EnvParams,
    { keys, blobs, encryptedByTrustChain } = envParams,
    keyableParentEncryptedKeys = keys.keyableParents,
    blockKeyableParentEncryptedKeys = keys.blockKeyableParents;

  let transactionItems: Api.Db.ObjectTransactionItems = {},
    userEncryptedKeys: Api.Net.EnvParams["keys"]["users"] | undefined,
    encryptedById: string | undefined;

  if (auth.type == "tokenAuthContext") {
    encryptedById = auth.orgUserDevice.id;
  } else if (auth.type == "cliUserAuthContext") {
    encryptedById = auth.user.id;
  }

  if (keys.users) {
    userEncryptedKeys = keys.users;
  } else if (handlerContext) {
    if (
      handlerContext.type === Api.ActionType.CREATE_INVITE &&
      keys.newDevice
    ) {
      userEncryptedKeys = {
        [handlerContext.inviteeId]: {
          [handlerContext.inviteId]: keys.newDevice,
        },
      };
    } else if (
      action.type == Api.ActionType.CREATE_DEVICE_GRANT &&
      handlerContext.type === action.type &&
      keys.newDevice
    ) {
      userEncryptedKeys = {
        [action.payload.granteeId]: {
          [handlerContext.createdId]: keys.newDevice,
        },
      };
    } else if (
      action.type == Api.ActionType.CREATE_CLI_USER &&
      handlerContext.type === action.type &&
      keys.newDevice &&
      keys.newDevice
    ) {
      userEncryptedKeys = {
        [handlerContext.createdId]: {
          cli: keys.newDevice,
        },
      };
    } else if (
      (action.type == Api.ActionType.ACCEPT_INVITE ||
        action.type == Api.ActionType.ACCEPT_DEVICE_GRANT ||
        action.type == Api.ActionType.REDEEM_RECOVERY_KEY) &&
      handlerContext.type === action.type
    ) {
      encryptedById = handlerContext.orgUserDevice.id;
      if (keys.newDevice) {
        userEncryptedKeys = {
          [auth.user.id]: {
            [handlerContext.orgUserDevice.id]: keys.newDevice,
          },
        };
      }
    } else if (
      action.type == Api.ActionType.CREATE_RECOVERY_KEY &&
      handlerContext.type === action.type &&
      keys.newDevice
    ) {
      userEncryptedKeys = {
        [auth.user.id]: {
          [handlerContext.createdId]: keys.newDevice,
        },
      };
    }
  }

  if (!encryptedById) {
    throw new Error("encryptedById must be set");
  }

  const newChangesetIdByEnvironmentId: Record<string, string> = {};

  if (userEncryptedKeys) {
    if (!transactionItems.puts) {
      transactionItems.puts = [];
    }
    for (let userId in userEncryptedKeys) {
      for (let deviceId in userEncryptedKeys[userId]) {
        const deviceEncryptedKeys = userEncryptedKeys[userId][deviceId];
        for (let envParentId in deviceEncryptedKeys) {
          const { environments, locals } = deviceEncryptedKeys[envParentId];

          for (let environmentId in environments) {
            const update = environments[environmentId];

            if (update.env) {
              const userEnvEncryptedKey: Api.Db.UserEncryptedKey = {
                type: "userEncryptedKey",
                ...getUserEncryptedKey({
                  orgId: auth.org.id,
                  userId,
                  deviceId,
                  envParentId,
                  environmentId,
                  blobType: "env",
                  envType: "env",
                  envPart: "env",
                }),
                data: update.env,
                encryptedById,
                envParentId,
                environmentId,
                blobType: "env",
                envType: "env",
                envPart: "env",
                updatedAt: now,
                createdAt: now,
              };

              transactionItems.puts.push(userEnvEncryptedKey);
            }

            if (update.meta) {
              const userMetaEncryptedKey: Api.Db.UserEncryptedKey = {
                type: "userEncryptedKey",
                ...getUserEncryptedKey({
                  orgId: auth.org.id,
                  userId,
                  deviceId,
                  envParentId,
                  environmentId,
                  blobType: "env",
                  envType: "env",
                  envPart: "meta",
                }),
                data: update.meta,
                encryptedById,
                envParentId,
                environmentId,
                blobType: "env",
                envType: "env",
                envPart: "meta",
                updatedAt: now,
                createdAt: now,
              };

              transactionItems.puts.push(userMetaEncryptedKey);
            }

            if (update.inherits) {
              const userInheritsEncryptedKey: Api.Db.UserEncryptedKey = {
                type: "userEncryptedKey",
                ...getUserEncryptedKey({
                  orgId: auth.org.id,
                  userId,
                  deviceId,
                  envParentId,
                  environmentId,
                  blobType: "env",
                  envType: "env",
                  envPart: "inherits",
                }),
                data: update.inherits,
                encryptedById,
                envParentId,
                environmentId,
                blobType: "env",
                envType: "env",
                envPart: "inherits",
                updatedAt: now,
                createdAt: now,
              };

              transactionItems.puts.push(userInheritsEncryptedKey);
            }

            if ("changesets" in update && update.changesets) {
              const changesetEncryptedKey: Api.Db.UserEncryptedKey = {
                type: "userEncryptedKey",
                ...getUserEncryptedKey({
                  orgId: auth.org.id,
                  userId,
                  deviceId,
                  envParentId,
                  environmentId,
                  blobType: "changeset",
                }),
                data: update.changesets!,
                encryptedById,
                envParentId,
                environmentId,
                blobType: "changeset",
                updatedAt: now,
                createdAt: now,
              };
              transactionItems.puts.push(changesetEncryptedKey);
            }

            if (update.inheritanceOverrides) {
              for (let inheritsEnvironmentId in update.inheritanceOverrides) {
                const userInheritanceOverridesEncryptedKey: Api.Db.UserEncryptedKey =
                  {
                    type: "userEncryptedKey",
                    ...getUserEncryptedKey({
                      orgId: auth.org.id,
                      userId,
                      deviceId,
                      envParentId,
                      environmentId,
                      inheritsEnvironmentId,
                      blobType: "env",
                      envType: "inheritanceOverrides",
                      envPart: "env",
                    }),
                    data: update.inheritanceOverrides[inheritsEnvironmentId],
                    encryptedById,
                    envParentId,
                    environmentId,
                    inheritsEnvironmentId,
                    blobType: "env",
                    envType: "inheritanceOverrides",
                    envPart: "env",
                    updatedAt: now,
                    createdAt: now,
                  };

                if (!transactionItems.puts) {
                  transactionItems.puts = [];
                }
                transactionItems.puts.push(
                  userInheritanceOverridesEncryptedKey
                );
              }
            }
          }

          for (let localsUserId in locals) {
            const update = locals[localsUserId];
            if (!transactionItems.puts) {
              transactionItems.puts = [];
            }
            const environmentId = envParentId + "|" + localsUserId;

            if (update.env) {
              const userEnvEncryptedKey: Api.Db.UserEncryptedKey = {
                type: "userEncryptedKey",
                ...getUserEncryptedKey({
                  orgId: auth.org.id,
                  userId,
                  deviceId,
                  envParentId,
                  environmentId,
                  blobType: "env",
                  envType: "localOverrides",
                  envPart: "env",
                }),
                data: update.env,
                encryptedById,
                envParentId,
                environmentId,
                blobType: "env",
                envType: "localOverrides",
                envPart: "env",
                updatedAt: now,
                createdAt: now,
              };

              transactionItems.puts.push(userEnvEncryptedKey);
            }

            if (update.meta) {
              const userMetaEncryptedKey: Api.Db.UserEncryptedKey = {
                type: "userEncryptedKey",
                ...getUserEncryptedKey({
                  orgId: auth.org.id,
                  userId,
                  deviceId,
                  envParentId,
                  environmentId,
                  blobType: "env",
                  envType: "localOverrides",
                  envPart: "meta",
                }),
                data: update.meta,
                encryptedById,
                envParentId,
                environmentId,
                blobType: "env",
                envType: "localOverrides",
                envPart: "meta",
                updatedAt: now,
                createdAt: now,
              };

              transactionItems.puts.push(userMetaEncryptedKey);
            }

            if ("changesets" in update && update.changesets) {
              const changesetsEncryptedKey: Api.Db.UserEncryptedKey = {
                type: "userEncryptedKey",
                ...getUserEncryptedKey({
                  orgId: auth.org.id,
                  userId,
                  deviceId,
                  envParentId,
                  environmentId,
                  blobType: "changeset",
                }),
                data: update.changesets!,
                encryptedById,
                envParentId,
                environmentId,
                blobType: "changeset",
                updatedAt: now,
                createdAt: now,
              };

              transactionItems.puts.push(changesetsEncryptedKey);
            }
          }
        }
      }
    }
  }

  if (keyableParentEncryptedKeys) {
    for (let keyableParentId in keyableParentEncryptedKeys) {
      const generatedEnvkeyIdOrPlaceholder = Object.keys(
        keyableParentEncryptedKeys[keyableParentId]
      )[0];
      if (!generatedEnvkeyIdOrPlaceholder) continue;

      const update =
          keyableParentEncryptedKeys[keyableParentId][
            generatedEnvkeyIdOrPlaceholder
          ],
        generatedEnvkeyId: string =
          generatedEnvkeyIdOrPlaceholder == "generatedEnvkey" &&
          handlerContext &&
          handlerContext.type == Api.ActionType.GENERATE_KEY
            ? handlerContext.createdId
            : generatedEnvkeyIdOrPlaceholder;

      transactionItems = mergeObjectTransactionItems([
        transactionItems,
        getGeneratedEnvkeyEncryptedKeyTransactionItems(
          auth,
          originalGraph,
          updatedGraph,
          encryptedByTrustChain!,
          keyableParentId,
          generatedEnvkeyId,
          update,
          now
        ),
      ]);
    }
  }

  if (blockKeyableParentEncryptedKeys) {
    for (let blockId in blockKeyableParentEncryptedKeys) {
      for (let keyableParentId in blockKeyableParentEncryptedKeys[blockId]) {
        const generatedEnvkeyIdOrPlaceholder = Object.keys(
          blockKeyableParentEncryptedKeys[blockId][keyableParentId]
        )[0];
        if (!generatedEnvkeyIdOrPlaceholder) continue;

        const update =
            blockKeyableParentEncryptedKeys[blockId][keyableParentId][
              generatedEnvkeyIdOrPlaceholder
            ],
          generatedEnvkeyId: string =
            generatedEnvkeyIdOrPlaceholder == "generatedEnvkey" &&
            handlerContext &&
            handlerContext.type == Api.ActionType.GENERATE_KEY
              ? handlerContext.createdId
              : generatedEnvkeyIdOrPlaceholder;

        transactionItems = mergeObjectTransactionItems([
          transactionItems,
          getGeneratedEnvkeyEncryptedKeyTransactionItems(
            auth,
            originalGraph,
            updatedGraph,
            encryptedByTrustChain!,
            keyableParentId,
            generatedEnvkeyId,
            update,
            now,
            blockId
          ),
        ]);
      }
    }
  }

  if (blobs) {
    if (!transactionItems.puts) {
      transactionItems.puts = [];
    }

    for (let envParentId in blobs) {
      const envParent = updatedGraph[envParentId] as Model.EnvParent;
      const { environments, locals } = blobs[envParentId];

      for (let environmentId in environments) {
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
            (env &&
              meta &&
              inherits &&
              (changesets ||
                changesetsById ||
                (action.type == Api.ActionType.UPDATE_ENVS &&
                  action.payload.upgradeCrypto))) ||
            inheritanceOverrides
          )
        ) {
          log("Missing required blobs", {
            env,
            meta,
            inherits,
            inheritanceOverrides,
            changesets,
            changesetsById,
          });

          throw new Error("Missing required blobs");
        }

        const environment = updatedGraph[environmentId] as Model.Environment;

        if (env && meta && inherits) {
          const envBlob: Api.Db.EncryptedBlob = {
            type: "encryptedBlob",
            ...getEncryptedBlobKey({
              orgId: auth.org.id,
              blobType: "env",
              envParentId,
              environmentId,
              envType: environment.isSub ? "subEnv" : "env",
              envPart: "env",
            }),
            blobType: "env",
            encryptedById,
            data: env,
            envParentId,
            blockId: envParent.type == "block" ? envParentId : undefined,
            environmentId,
            envType: environment.isSub ? "subEnv" : "env",
            envPart: "env",
            createdAt: now,
            updatedAt: now,
          };

          const metaBlob: Api.Db.EncryptedBlob = {
            type: "encryptedBlob",
            ...getEncryptedBlobKey({
              orgId: auth.org.id,
              blobType: "env",
              envParentId,
              environmentId,
              envType: environment.isSub ? "subEnv" : "env",
              envPart: "meta",
            }),
            blobType: "env",
            encryptedById,
            data: meta,
            envParentId,
            blockId: envParent.type == "block" ? envParentId : undefined,
            environmentId,
            envType: environment.isSub ? "subEnv" : "env",
            envPart: "meta",
            createdAt: now,
            updatedAt: now,
          };

          const inheritsBlob: Api.Db.EncryptedBlob = {
            type: "encryptedBlob",
            ...getEncryptedBlobKey({
              orgId: auth.org.id,
              blobType: "env",
              envParentId,
              environmentId,
              envType: environment.isSub ? "subEnv" : "env",
              envPart: "inherits",
            }),
            blobType: "env",
            encryptedById,
            data: inherits,
            envParentId,
            blockId: envParent.type == "block" ? envParentId : undefined,
            environmentId,
            envType: environment.isSub ? "subEnv" : "env",
            envPart: "inherits",
            createdAt: now,
            updatedAt: now,
          };

          transactionItems.puts.push(envBlob, metaBlob, inheritsBlob);
        }

        if (inheritanceOverrides) {
          for (let inheritsEnvironmentId in inheritanceOverrides) {
            const inheritanceOverridesBlob: Api.Db.EncryptedBlob = {
              type: "encryptedBlob",
              ...getEncryptedBlobKey({
                orgId: auth.org.id,
                blobType: "env",
                envParentId,
                environmentId,
                envType: "inheritanceOverrides",
                inheritsEnvironmentId,
                envPart: "env",
              }),
              blobType: "env",
              encryptedById,
              data: inheritanceOverrides[inheritsEnvironmentId],
              envParentId,
              blockId: envParent.type == "block" ? envParentId : undefined,
              environmentId,
              envType: "inheritanceOverrides",
              envPart: "env",
              inheritsEnvironmentId,
              createdAt: now,
              updatedAt: now,
            };
            transactionItems.puts.push(inheritanceOverridesBlob);
          }
        }

        if (changesets) {
          const changesetId =
            newChangesetIdByEnvironmentId[environmentId] ?? uuid();
          if (!newChangesetIdByEnvironmentId[environmentId]) {
            newChangesetIdByEnvironmentId[environmentId] = changesetId;
          }
          const changesetsBlob: Api.Db.EncryptedBlob = {
            type: "encryptedBlob",
            ...getEncryptedBlobKey({
              orgId: auth.org.id,
              blobType: "changeset",
              envParentId,
              environmentId,
              id: changesetId,
            }),
            blobType: "changeset",
            encryptedById,
            changesetId,
            data: changesets,
            envParentId,
            environmentId,
            createdAt: now,
            updatedAt: now,
          };
          transactionItems.puts.push(changesetsBlob);
        } else if (changesetsById) {
          for (let changesetId in changesetsById) {
            const changesetsBlob: Api.Db.EncryptedBlob = {
              type: "encryptedBlob",
              ...getEncryptedBlobKey({
                orgId: auth.org.id,
                blobType: "changeset",
                envParentId,
                environmentId,
                id: changesetId,
              }),
              blobType: "changeset",
              encryptedById,
              changesetId,
              data: changesetsById[changesetId].data,
              envParentId,
              environmentId,
              createdById: changesetsById[changesetId].createdById,
              createdAt: changesetsById[changesetId].createdAt ?? now,
              updatedAt: now,
            };
            transactionItems.puts.push(changesetsBlob);
          }
        }
      }

      for (let localsUserId in locals) {
        const { env, meta, changesets, changesetsById } = locals[localsUserId];

        if (!(env && meta && (changesets || changesetsById))) {
          log(
            "Missing required blobs " + localsUserId + " - ",
            locals[localsUserId]
          );

          throw new Error("Missing required blobs");
        }

        const environmentId = envParentId + "|" + localsUserId;

        const envBlob: Api.Db.EncryptedBlob = {
          type: "encryptedBlob",
          ...getEncryptedBlobKey({
            orgId: auth.org.id,
            blobType: "env",
            envParentId,
            environmentId,
            envType: "localOverrides",
            envPart: "env",
          }),
          blobType: "env",
          encryptedById,
          data: env,
          envParentId,
          blockId: envParent.type == "block" ? envParentId : undefined,
          environmentId,
          envType: "localOverrides",
          envPart: "env",
          createdAt: now,
          updatedAt: now,
        };

        const metaBlob: Api.Db.EncryptedBlob = {
          type: "encryptedBlob",
          ...getEncryptedBlobKey({
            orgId: auth.org.id,
            blobType: "env",
            envParentId,
            environmentId,
            envType: "localOverrides",
            envPart: "meta",
          }),
          blobType: "env",
          encryptedById,
          data: meta,
          envParentId,
          blockId: envParent.type == "block" ? envParentId : undefined,
          environmentId,
          envType: "localOverrides",
          envPart: "meta",
          createdAt: now,
          updatedAt: now,
        };

        transactionItems.puts.push(envBlob, metaBlob);

        if (changesets) {
          const changesetId =
            newChangesetIdByEnvironmentId[environmentId] ?? uuid();
          if (!newChangesetIdByEnvironmentId[environmentId]) {
            newChangesetIdByEnvironmentId[environmentId] = changesetId;
          }
          const changesetsBlob: Api.Db.EncryptedBlob = {
            type: "encryptedBlob",
            ...getEncryptedBlobKey({
              orgId: auth.org.id,
              blobType: "changeset",
              envParentId,
              environmentId,
              id: changesetId,
            }),
            blobType: "changeset",
            encryptedById,
            changesetId,
            data: changesets,
            envParentId,
            environmentId,
            createdAt: now,
            updatedAt: now,
          };
          transactionItems.puts.push(changesetsBlob);
        } else if (changesetsById) {
          for (let changesetId in changesetsById) {
            const changesetsBlob: Api.Db.EncryptedBlob = {
              type: "encryptedBlob",
              ...getEncryptedBlobKey({
                orgId: auth.org.id,
                blobType: "changeset",
                envParentId,
                environmentId,
                id: changesetId,
              }),
              blobType: "changeset",
              encryptedById,
              changesetId,
              data: changesetsById[changesetId].data,
              envParentId,
              environmentId,
              createdById: changesetsById[changesetId].createdById,
              createdAt: changesetsById[changesetId].createdAt ?? now,
              updatedAt: now,
            };
            transactionItems.puts.push(changesetsBlob);
          }
        }
      }
    }
  }

  return transactionItems;
};
export const requireEncryptedKeys = (
  keys: Api.Net.EnvParams["keys"],
  required: Blob.KeySet,
  handlerContext: Api.HandlerContext | undefined,
  originalGraph: Api.Graph.OrgGraph
): void => {
  const requiredPaths = objectPaths(required);
  for (let path of requiredPaths) {
    let toRequirePath: string[];
    if (keys.newDevice && path[0] == "users") {
      toRequirePath = ["newDevice", ...path.slice(3)];
    } else if (
      (keys.keyableParents || keys.blockKeyableParents) &&
      handlerContext &&
      handlerContext.type == Api.ActionType.GENERATE_KEY &&
      (path[0] == "keyableParents" || path[0] == "blockKeyableParents")
    ) {
      toRequirePath = path.map((k) =>
        k == handlerContext.createdId ? "generatedEnvkey" : k
      );
    } else {
      toRequirePath = path;
    }

    if (!R.path(toRequirePath, keys)) {
      log("required encrypted key missing:", { toRequirePath, keys });
      log(
        "path graph objects",
        toRequirePath
          .map((k) => {
            let obj: any = originalGraph[k];

            if (obj && "environmentRoleId" in obj) {
              obj = {
                ...obj,
                environmentRole: originalGraph[obj.environmentRoleId],
              };
            }

            return obj;
          })
          .filter(Boolean)
      );

      throw new Api.ApiError("Required encrypted keys missing", 400);
    }
  }
};
export const queueForReencryption = (
  previousGraph: Api.Graph.OrgGraph,
  updatedGraph: Api.Graph.OrgGraph,
  removeUserIds: Set<string>,
  envParents: Model.EnvParent[],
  environments: Model.Environment[],
  now: number
): Api.Graph.OrgGraph => {
  return produce(updatedGraph, (draft) => {
    for (let environment of environments) {
      for (let removeUserId of removeUserIds) {
        if (
          authz.canReadEnvInherits(
            previousGraph,
            removeUserId,
            environment.id
          ) ||
          authz.canReadEnvMeta(previousGraph, removeUserId, environment.id) ||
          authz.canReadEnv(previousGraph, removeUserId, environment.id) ||
          authz.canReadVersions(previousGraph, removeUserId, environment.id)
        ) {
          const environmentDraft = draft[environment.id] as Api.Db.Environment;

          environmentDraft.reencryptionRequiredAt = now;
          environmentDraft.updatedAt = now;
          break;
        }
      }
    }

    for (let envParent of envParents) {
      for (let localsUserId in envParent.localsUpdatedAtByUserId) {
        if (removeUserIds.has(localsUserId)) {
          continue;
        } else {
          for (let blobUserId of removeUserIds) {
            if (
              authz.canReadLocals(
                previousGraph,
                blobUserId,
                envParent.id,
                localsUserId
              ) ||
              authz.canReadLocalsVersions(
                previousGraph,
                blobUserId,
                envParent.id,
                localsUserId
              )
            ) {
              const envParentDraft = draft[envParent.id] as Api.Db.EnvParent;
              envParentDraft.localsReencryptionRequiredAt[localsUserId] = now;
              envParentDraft.updatedAt = now;
              break;
            }
          }
        }
      }
    }
  });
};
export const getDeleteUsersWithTransactionItems = (
  auth: Auth.DefaultAuthContext | Auth.ProvisioningBearerAuthContext,
  orgGraph: Api.Graph.OrgGraph,
  updatedGraphParam: Api.Graph.OrgGraph,
  userIds: string[],
  now: number
) => {
  let updatedGraph = updatedGraphParam;

  const blobUserIdSet = new Set(userIds);

  for (let userId of userIds) {
    const pendingOrExpiredInviterInvites =
        getActiveOrExpiredInvitesByInvitedByUserId(orgGraph)[userId] ?? [],
      pendingOrgUserIds = pendingOrExpiredInviterInvites
        .map(R.prop("inviteeId"))
        .filter((inviteeId) => {
          const invitee = orgGraph[inviteeId] as Api.Db.OrgUser;
          return !invitee.inviteAcceptedAt;
        });

    for (let pendingOrgUserId of pendingOrgUserIds) {
      blobUserIdSet.add(pendingOrgUserId);
    }
  }

  const blobUserIds = Array.from(blobUserIdSet);
  const blobUserLocallOverrideScopes = blobUserIds.map(
    (id) => "localOverrides|" + id
  );

  for (let blobUserId of blobUserIds) {
    updatedGraph = deleteUser(updatedGraphParam, blobUserId, auth, now);
  }

  const { environments, apps, blocks } = graphTypes(orgGraph);

  // updatedGraph = queueForReencryption(
  //   orgGraph,
  //   updatedGraph,
  //   blobUserIdSet,
  //   [...apps, ...blocks],
  //   environments,
  //   now
  // );

  const transactionItems: Api.Db.ObjectTransactionItems = {
    softDeleteScopes: userIds.map((userId) => ({
      pkey: [auth.org.id, "tokens"].join("|"),
      scope: userId,
    })),

    hardDeleteScopes: blobUserIds.map((id) => ({
      pkey: ["encryptedKeys", auth.org.id, id].join("|"),
      pkeyPrefix: true,
    })),

    hardDeleteSecondaryIndexScopes: blobUserLocallOverrideScopes,
    hardDeleteTertiaryIndexScopes: blobUserLocallOverrideScopes,
  };

  return { updatedGraph, transactionItems };
};
export const queueBlobsForReencryptionFromToDeleteEncryptedKeys = (
  auth: Auth.AuthContext,
  toDeleteEncryptedKeys: Blob.KeySet,
  orgGraph: Api.Graph.OrgGraph,
  now: number
): Api.Graph.OrgGraph | undefined => {
  if (
    !(
      auth.type == "tokenAuthContext" ||
      auth.type == "cliUserAuthContext" ||
      auth.type == "provisioningBearerAuthContext"
    )
  ) {
    return;
  }

  const queueForReencryptionPaths = getQueueForReencryptionPaths(
    toDeleteEncryptedKeys,
    orgGraph
  );

  if (queueForReencryptionPaths.size > 0) {
    let updatedOrgGraph = orgGraph;

    for (let path of queueForReencryptionPaths) {
      updatedOrgGraph = R.assocPath(path.split("|"), now, updatedOrgGraph);
    }

    return updatedOrgGraph;
  }
};
export const encryptedKeyParamsToKeySet = (
  keys: Api.Net.EnvParams["keys"]
): Blob.KeySet =>
  objectPaths(keys).reduce<Blob.KeySet>(
    (blobs, path) =>
      R.assocPath(R.without(["data", "nonce"], path), true, blobs),
    { type: "keySet" }
  );
export const encryptedBlobParamsToBlobSet = (
  blobs: Api.Net.EnvParams["blobs"]
): Blob.BlobSet =>
  objectPaths(blobs).reduce<Blob.BlobSet>(
    (blobs, path) =>
      R.assocPath(R.without(["data", "nonce"], path), true, blobs),
    {}
  );
export const getReorderEncryptedKeysTransactionItems = (
  originalGraph: Api.Graph.OrgGraph,
  updatedGraph: Api.Graph.OrgGraph
): Api.Db.ObjectTransactionItems => {
  const activeUpdatedGraph = getActiveGraph(updatedGraph),
    { apps, generatedEnvkeys } = graphTypes(activeUpdatedGraph),
    generatedEnvkeysByAppId = groupBy(R.prop("appId"), generatedEnvkeys),
    orderUpdateScopes: Api.Db.ObjectTransactionItems["orderUpdateScopes"] = [];

  for (let { id: appId } of apps) {
    const connectedBlocks = getConnectedBlocksForApp(activeUpdatedGraph, appId);

    for (let { id: blockId } of connectedBlocks) {
      const originalSortVal =
          blockId in originalGraph
            ? getBlockSortVal(originalGraph, appId, blockId)
            : undefined,
        updatedSortVal = getBlockSortVal(activeUpdatedGraph, appId, blockId);

      if (updatedSortVal && originalSortVal !== updatedSortVal) {
        const appGeneratedEnvkeys = (generatedEnvkeysByAppId[appId] ??
          []) as Api.Db.GeneratedEnvkey[];
        for (let { envkeyIdPart } of appGeneratedEnvkeys) {
          orderUpdateScopes.push([
            {
              pkey: "envkey" + "|" + envkeyIdPart,
              scope: blockId,
            },
            updatedSortVal,
          ]);
        }
      }
    }
  }
  return {
    orderUpdateScopes,
  };
};

const generatedEnvkeyEnvTypes: (keyof Model.GeneratedEnvkeyFields)[] = [
  "env",
  "inheritanceOverrides",
  "localOverrides",
  "subEnv",
];

const getQueueForReencryptionPaths = (
  toDeleteEncryptedKeys: Blob.KeySet,
  updatedOrgGraph: Api.Graph.OrgGraph
) => {
  const queueForReencryptionPaths = new Set<string>();

  const addQueueForReencryptionPath = (
    envParentId: string,
    environmentType: "environments" | "locals",
    environmentOrLocalsUserId: string
  ) => {
    if (environmentType == "environments") {
      queueForReencryptionPaths.add(
        environmentOrLocalsUserId + "|" + "reencryptionRequiredAt"
      );
      queueForReencryptionPaths.add(
        environmentOrLocalsUserId + "|" + "updatedAt"
      );
    } else {
      queueForReencryptionPaths.add(
        envParentId +
          "|" +
          "localsReencryptionRequiredAt" +
          "|" +
          environmentOrLocalsUserId
      );
      queueForReencryptionPaths.add(envParentId + "|" + "updatedAt");
    }
  };

  if (toDeleteEncryptedKeys.users) {
    for (let userId in toDeleteEncryptedKeys.users) {
      for (let deviceId in toDeleteEncryptedKeys.users[userId]) {
        for (let envParentId in toDeleteEncryptedKeys.users[userId][deviceId]) {
          const { environments, locals } =
            toDeleteEncryptedKeys.users[userId][deviceId][envParentId];

          const envParent = updatedOrgGraph[envParentId] as Model.EnvParent;

          if (!envParent || envParent.deletedAt) {
            continue;
          }

          if (environments) {
            for (let environmentId in environments) {
              const environment = updatedOrgGraph[
                environmentId
              ] as Model.Environment;

              if (!environment || environment.deletedAt) {
                continue;
              }

              addQueueForReencryptionPath(
                envParentId,
                "environments",
                environmentId
              );
            }
          }

          if (locals) {
            for (let localsUserId in locals) {
              const localsUser = updatedOrgGraph[localsUserId] as
                | Model.OrgUser
                | Model.CliUser
                | undefined;
              if (
                !localsUser ||
                localsUser.deletedAt ||
                localsUser.deactivatedAt
              ) {
                continue;
              }

              if (
                !authz.canReadLocals(
                  updatedOrgGraph,
                  localsUserId,
                  envParentId,
                  localsUserId
                )
              ) {
                continue;
              }

              addQueueForReencryptionPath(envParentId, "locals", localsUserId);
            }
          }
        }
      }
    }
  }

  if (toDeleteEncryptedKeys.blockKeyableParents) {
    for (let blockId in toDeleteEncryptedKeys.blockKeyableParents) {
      for (let keyableParentId in toDeleteEncryptedKeys.blockKeyableParents[
        blockId
      ]) {
        const keyableParent = updatedOrgGraph[
          keyableParentId
        ] as Model.KeyableParent;

        if (!keyableParent || keyableParent.deletedAt) {
          continue;
        }

        const [blockEnvironment] = getConnectedBlockEnvironmentsForApp(
          updatedOrgGraph,
          keyableParent.appId,
          blockId,
          keyableParent.environmentId
        );

        if (blockEnvironment) {
          addQueueForReencryptionPath(
            blockId,
            "environments",
            blockEnvironment.id
          );
        }

        if (keyableParent.type == "localKey") {
          addQueueForReencryptionPath(blockId, "locals", keyableParent.userId);
        }
      }
    }
  }

  if (toDeleteEncryptedKeys.keyableParents) {
    for (let keyableParentId in toDeleteEncryptedKeys.keyableParents) {
      const keyableParent = updatedOrgGraph[
        keyableParentId
      ] as Model.KeyableParent;

      if (!keyableParent || keyableParent.deletedAt) {
        continue;
      }

      addQueueForReencryptionPath(
        keyableParent.appId,
        "environments",
        keyableParent.environmentId
      );

      if (keyableParent.type == "localKey") {
        addQueueForReencryptionPath(
          keyableParent.appId,
          "locals",
          keyableParent.userId
        );
      }
    }
  }

  return queueForReencryptionPaths;
};

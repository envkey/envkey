import { logStderr } from "./../../../core/src/lib/utils/logger";
import { pick } from "@core/lib/utils/object";
import * as R from "ramda";
import { getPubkeyHash } from "@core/lib/client";
import { Api, Fetch } from "@core/types";
import { getGeneratedEnvkeyEncryptedKeyOrBlobComposite } from "@core/lib/blob";
import { log } from "@core/lib/utils/logger";

export const getFetchResponse = (
    generatedEnvkey: Api.Db.GeneratedEnvkey,
    keys: Api.Db.GeneratedEnvkeyEncryptedKey[],
    blobsByComposite: Record<string, Api.Db.EncryptedBlob>,
    rootPubkeyReplacements: Api.Db.RootPubkeyReplacement[]
  ): {
    response: Api.Net.ApiResultTypes["FetchEnvkey"];
    orphanedKeys: Api.Db.GeneratedEnvkeyEncryptedKey[];
  } => {
    const envEncryptedKey = R.find(
      (key) => !key.blockId && key.envType == "env",
      keys
    ) as Api.Db.GeneratedEnvkeyEncryptedKey;

    const envBlob = envEncryptedKey
      ? blobsByComposite[
          getGeneratedEnvkeyEncryptedKeyOrBlobComposite(envEncryptedKey)
        ]
      : undefined;

    let response: Api.Net.ApiResultTypes["FetchEnvkey"] = {
        type: "fetchResult",
        orgId: generatedEnvkey.pkey,
        env:
          envEncryptedKey && envBlob
            ? {
                encryptedEnv: envBlob.data,
                encryptedKey: envEncryptedKey.data,
                encryptedByPubkey: envEncryptedKey.encryptedByPubkey,
                encryptedByPubkeyId: getPubkeyHash(
                  envEncryptedKey.encryptedByPubkey
                ),
                encryptedByTrustChain: envEncryptedKey.encryptedByTrustChain,
              }
            : undefined,
        encryptedPrivkey: generatedEnvkey.encryptedPrivkey,
        pubkey: generatedEnvkey.pubkey,
        signedTrustedRoot: generatedEnvkey.signedTrustedRoot,
        rootPubkeyReplacements:
          rootPubkeyReplacements.length > 0
            ? rootPubkeyReplacements.map(
                pick([
                  "id",
                  "replacingPubkeyId",
                  "replacingPubkey",
                  "signedReplacingTrustChain",
                ])
              )
            : undefined,
        v1Payload: generatedEnvkey.v1Payload,
      },
      responseBlocksById: { [blockId: string]: Fetch.KeyableBlob } = {};

    const orderIndexByBlockId: { [blockId: string]: number } = {};

    const orphanedKeys: Api.Db.GeneratedEnvkeyEncryptedKey[] = [];

    for (let key of keys) {
      const composite = getGeneratedEnvkeyEncryptedKeyOrBlobComposite(key);
      const blob = blobsByComposite[composite];

      if (!blob) {
        logStderr("Missing blob for key with composite: " + composite, {
          key,
        });
        continue;
      }

      if (key.blockId) {
        orderIndexByBlockId[key.blockId] = key.orderIndex!;
      }

      switch (key.envType) {
        case "env":
          if (key.blockId) {
            responseBlocksById = R.assocPath(
              [key.blockId, "env", "encryptedEnv"],
              blob.data,
              responseBlocksById
            );

            responseBlocksById = R.assocPath(
              [key.blockId, "env", "encryptedKey"],
              key.data,
              responseBlocksById
            );

            responseBlocksById = R.assocPath(
              [key.blockId, "env", "encryptedByPubkey"],
              key.encryptedByPubkey,
              responseBlocksById
            );

            responseBlocksById = R.assocPath(
              [key.blockId, "env", "encryptedByPubkeyId"],
              getPubkeyHash(key.encryptedByPubkey),
              responseBlocksById
            );

            responseBlocksById = R.assocPath(
              [key.blockId, "env", "encryptedByTrustChain"],
              key.encryptedByTrustChain,
              responseBlocksById
            );
          } else {
            continue;
          }
          break;

        case "localOverrides":
          const locals: Fetch.KeyableBlobFields = {
            encryptedEnv: blob.data,
            encryptedKey: key.data,
            encryptedByPubkey: key.encryptedByPubkey,
            encryptedByPubkeyId: getPubkeyHash(key.encryptedByPubkey),
            encryptedByTrustChain: key.encryptedByTrustChain,
          };

          if (key.blockId) {
            responseBlocksById = R.assocPath(
              [key.blockId, "locals"],
              locals,
              responseBlocksById
            );
          } else {
            response.locals = locals;
          }

          break;

        case "subEnv":
          const subEnv: Fetch.KeyableBlobFields = {
            encryptedEnv: blob.data,
            encryptedKey: key.data,
            encryptedByPubkey: key.encryptedByPubkey,
            encryptedByPubkeyId: getPubkeyHash(key.encryptedByPubkey),
            encryptedByTrustChain: key.encryptedByTrustChain,
          };

          if (key.blockId) {
            responseBlocksById = R.assocPath(
              [key.blockId, "subEnv"],
              subEnv,
              responseBlocksById
            );
          } else {
            response.subEnv = subEnv;
          }
          break;

        case "inheritanceOverrides":
          if (!key.inheritsEnvironmentId) {
            throw new Error(
              "Missing inheritsEnvironmentId for inheritanceOverrides key with composite: " +
                composite
            );
          }

          const overrides: Fetch.KeyableBlobFields = {
            encryptedEnv: blob.data,
            encryptedKey: key.data,
            encryptedByPubkey: key.encryptedByPubkey,
            encryptedByPubkeyId: getPubkeyHash(key.encryptedByPubkey),
            encryptedByTrustChain: key.encryptedByTrustChain,
          };

          if (key.blockId) {
            responseBlocksById = R.assocPath(
              [key.blockId, "inheritanceOverrides", key.inheritsEnvironmentId],
              overrides,
              responseBlocksById
            );
          } else {
            response = R.assocPath(
              ["inheritanceOverrides", key.inheritsEnvironmentId],
              overrides,
              response
            );
          }

          break;
      }
    }

    if (!R.isEmpty(responseBlocksById)) {
      response.blocks = R.pipe(
        R.toPairs,
        R.sortBy(([blockId]) => orderIndexByBlockId[blockId]),
        R.map(R.last)
      )(responseBlocksById) as Fetch.KeyableBlob[];
    }

    return { response, orphanedKeys };
  },
  getTargetIds = (
    generatedEnvkey: Api.Db.GeneratedEnvkey,
    keys: Api.Db.GeneratedEnvkeyEncryptedKey[]
  ): { logTargetIds: string[]; backgroundLogTargetIds: string[] } => {
    const targetIds = new Set([
      generatedEnvkey.appId,
      generatedEnvkey.keyableParentId,
      generatedEnvkey.id,
    ]);

    const backgroundLogTargetIds = new Set<string>();

    for (let key of keys) {
      backgroundLogTargetIds.add(key.environmentId);
      if (key.blockId) {
        targetIds.add(key.blockId);
      }

      if (key.userId) {
        if (key.blockId) {
          backgroundLogTargetIds.add(key.blockId + "|" + key.userId);
        } else {
          backgroundLogTargetIds.add(generatedEnvkey.appId + "|" + key.userId);
        }
      }
    }

    return {
      logTargetIds: Array.from(targetIds),
      backgroundLogTargetIds: Array.from(backgroundLogTargetIds),
    };
  },
  getHandlerContext = (
    generatedEnvkey: Api.Db.GeneratedEnvkey,
    keys: Api.Db.GeneratedEnvkeyEncryptedKey[]
  ): Api.HandlerContext => {
    let actorId: string | undefined;
    let deviceId: string | undefined;
    if (generatedEnvkey.keyableParentType == "localKey") {
      actorId = generatedEnvkey.userId!;
      deviceId = generatedEnvkey.deviceId!;
    } else {
      actorId = generatedEnvkey.keyableParentId;
    }

    return {
      type: Api.ActionType.FETCH_ENVKEY,
      orgId: generatedEnvkey.pkey,
      actorId: actorId!,
      deviceId,
      generatedEnvkey,
    };
  };

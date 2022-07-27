import { Draft } from "immer";
import * as R from "ramda";
import { Client, Api, Model, Blob, Crypto } from "@core/types";
import { decrypt, decryptSymmetricWithKey } from "@core/lib/crypto/proxy";
import { parseUserEncryptedKeyOrBlobComposite } from "@core/lib/blob";
import { verifyOrgKeyable } from "../trust";
import { clearVoidedPendingEnvUpdatesProducer } from ".";
import { log } from "@core/lib/utils/logger";

export const decryptEnvs = async (
    state: Client.State,
    encryptedKeys: Blob.UserEncryptedKeysByEnvironmentIdOrComposite,
    encryptedBlobs: Blob.UserEncryptedBlobsByComposite,
    currentUserPrivkey: Crypto.Privkey,
    context: Client.Context
  ) => {
    const start = Date.now();

    const toVerifyKeyableIds = new Set<string>(),
      toDecryptKeys: [string, Parameters<typeof decrypt>[0]][] = [];

    for (let compositeId in encryptedKeys) {
      const encryptedKey = encryptedKeys[compositeId],
        encryptedBy = state.graph[encryptedKey.encryptedById] as
          | Model.CliUser
          | Model.OrgUserDevice
          | undefined;

      if (!encryptedBy || !encryptedBy.pubkey) {
        log("encryptedById not found in graph OR missing pubkey", {
          encryptedKey,
        });

        throw new Error("encryptedById not found in graph OR missing pubkey");
      }

      toVerifyKeyableIds.add(encryptedKey.encryptedById);

      toDecryptKeys.push([
        compositeId,
        {
          encrypted: encryptedKey.data,
          pubkey: encryptedBy.pubkey,
          privkey: currentUserPrivkey,
        },
      ]);
    }

    // verify all keyables
    await Promise.all(
      Array.from(toVerifyKeyableIds).map((keyableId) =>
        verifyOrgKeyable(state, keyableId, context)
      )
    );

    // log("verified: " + (Date.now() - start).toString());

    // decrypt all
    const missingBlobs = R.difference(
      Object.keys(encryptedKeys),
      Object.keys(encryptedBlobs)
    );
    if (missingBlobs.length) {
      log("missing blobs:", missingBlobs);
      throw new Error("Missing blob keys");
    }

    const missingKeys = R.difference(
      Object.keys(encryptedBlobs),
      Object.keys(encryptedKeys)
    );
    if (missingKeys.length) {
      log("missing encrypted keys:", missingKeys);
      throw new Error("Missing encrypted keys");
    }

    const decryptRes = await Promise.all(
      toDecryptKeys.map(([compositeId, params]) =>
        decrypt(params).then((decryptedKey) => {
          const encryptedBlob = encryptedBlobs[compositeId];

          if (!encryptedBlob) {
            log("missing encryptedBlob", { compositeId, decryptedKey });
            throw new Error("Missing encrypted blob");
          }

          return decryptSymmetricWithKey({
            encrypted: encryptedBlob.data,
            encryptionKey: decryptedKey,
          })
            .then((decryptedBlob) => {
              const env = JSON.parse(decryptedBlob);

              return {
                [compositeId]: {
                  key: decryptedKey,
                  env,
                },
              };
            })
            .catch((err) => {
              log("decryption failed", {
                compositeId,
                encryptedBlob,
                err,
              });

              throw err;
            });
        })
      )
    );

    // log("decrypted: " + (Date.now() - start).toString());

    const res = R.mergeAll(decryptRes) as Client.State["envs"];

    // log("merged: " + (Date.now() - start).toString());

    return res;
  },
  decryptChangesets = async (
    state: Client.State,
    encryptedKeys: Blob.UserEncryptedChangesetKeysByEnvironmentId,
    encryptedBlobs: Blob.UserEncryptedBlobsByEnvironmentId,
    currentUserPrivkey: Crypto.Privkey,
    context: Client.Context
  ) => {
    const toVerifyKeyableIds = new Set<string>(),
      toDecryptKeys: [string, Parameters<typeof decrypt>[0]][] = [];

    for (let environmentId in encryptedKeys) {
      const encryptedKey = encryptedKeys[environmentId];

      const encryptedBy = state.graph[encryptedKey.encryptedById] as
        | Model.CliUser
        | Model.OrgUserDevice
        | undefined;

      if (!encryptedBy || !encryptedBy.pubkey) {
        log("encryptedById not found in graph OR missing pubkey", {
          encryptedKey,
        });
        throw new Error("encryptedById not found in graph OR missing pubkey");
      }

      toVerifyKeyableIds.add(encryptedKey.encryptedById);

      toDecryptKeys.push([
        environmentId,
        {
          encrypted: encryptedKey.data,
          pubkey: encryptedBy.pubkey,
          privkey: currentUserPrivkey,
        },
      ]);
    }

    // verify all keyables
    await Promise.all(
      Array.from(toVerifyKeyableIds).map((keyableId) =>
        verifyOrgKeyable(state, keyableId, context)
      )
    );

    // decrypt all
    const decryptRes = await Promise.all(
      toDecryptKeys.map(([environmentId, params]) =>
        decrypt(params).then(async (decryptedKey) => {
          const environmentEncrypedBlobs = encryptedBlobs[environmentId] ?? [];

          const decryptedBlobs = await Promise.all(
            environmentEncrypedBlobs.map((encryptedBlob) =>
              decryptSymmetricWithKey({
                encryptionKey: decryptedKey,
                encrypted: encryptedBlob.data,
              })
                .then((decryptedBlob) => {
                  const decryptedChangesets = JSON.parse(
                    decryptedBlob
                  ) as Client.Env.ChangesetPayload[];
                  return decryptedChangesets.map(
                    (changesetPayload) =>
                      ({
                        ...changesetPayload,
                        createdAt: encryptedBlob.createdAt,
                        encryptedById: encryptedBlob.encryptedById,
                        createdById:
                          encryptedBlob.createdById ??
                          encryptedBlob.encryptedById,
                        id: encryptedBlob.changesetId!,
                      } as Client.Env.Changeset)
                  );
                })
                .catch((err) => {
                  log("changeset decryption failed", {
                    environmentId,
                    encryptedBlob,
                    err,
                  });

                  throw err;
                })
            )
          );

          return {
            [environmentId]: {
              key: decryptedKey,
              changesets: R.flatten(decryptedBlobs),
            },
          };
        })
      )
    );

    return R.mergeAll(decryptRes);
  },
  decryptedEnvsStateProducer = (
    draft: Draft<Client.State>,
    action: {
      payload: Partial<Pick<Client.State, "envs" | "changesets">> & {
        timestamp?: number;
        notModified?: true;
      };
    },
    fetchAction?: Client.Action.ClientActions["FetchEnvs"]
  ) => {
    const {
      payload: { envs, changesets, timestamp, notModified },
    } = action;

    if (notModified) {
      return draft;
    } else if (!timestamp) {
      throw new Error("request timestamp is required");
    }

    if (envs) {
      const updatedEnvParentIds = new Set<string>();
      for (let composite in envs) {
        const { environmentId } =
          parseUserEncryptedKeyOrBlobComposite(composite);
        let envParentId: string;
        const environment = draft.graph[environmentId] as
          | Model.Environment
          | undefined;
        if (environment) {
          envParentId = environment.envParentId;
        } else {
          [envParentId] = environmentId.split("|");
        }

        if (!(timestamp > (draft.envsFetchedAt[envParentId] ?? 0))) {
          continue;
        }

        updatedEnvParentIds.add(envParentId);

        draft.envs[composite] = envs[composite];
      }

      for (let envParentId of updatedEnvParentIds) {
        const envParent = draft.graph[envParentId] as Model.EnvParent;

        if (envParent.envsOrLocalsUpdatedAt) {
          draft.envsFetchedAt[envParentId] = envParent.envsOrLocalsUpdatedAt;
        }
      }

      // this is slow with many pending actions -- removing for now
      // clearVoidedPendingEnvUpdatesProducer(draft);
    }

    if (changesets) {
      const updatedEnvParentIds = new Set<string>();

      for (let environmentId in changesets) {
        let envParentId: string;
        const environment = draft.graph[environmentId] as
          | Model.Environment
          | undefined;
        if (environment) {
          envParentId = environment.envParentId;
        } else {
          [envParentId] = environmentId.split("|");
        }

        if (!(timestamp > (draft.changesetsFetchedAt[envParentId] ?? 0))) {
          continue;
        }

        if (changesets[environmentId]?.changesets.length > 0) {
          updatedEnvParentIds.add(envParentId);
          draft.changesets[environmentId] = changesets[environmentId];
        } else if (changesets[environmentId]?.key) {
          draft.changesets[environmentId] = {
            key: changesets[environmentId].key,
            changesets: draft.changesets[environmentId]?.changesets ?? [],
          };
        }
      }

      // if changesets were specifically requested (meaning we got them all), set changesetsFetchetAt
      // otherwise we only got a small set to notify user of a potential conflict--in that case, clear out changesetsFetchedAt
      for (let envParentId of updatedEnvParentIds) {
        if (
          fetchAction &&
          fetchAction.payload.byEnvParentId[envParentId]?.changesets
        ) {
          draft.changesetsFetchedAt[envParentId] = timestamp;
        } else if (
          fetchAction &&
          !fetchAction.payload.byEnvParentId[envParentId]?.changesets
        ) {
          delete draft.changesetsFetchedAt[envParentId];
        }
      }
    }
  };

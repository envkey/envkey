import { Draft } from "immer";
import * as R from "ramda";
import * as g from "@core/lib/graph";
import { Client, Api, Model, Blob, Crypto } from "@core/types";
import { decrypt, decryptSymmetricWithKey } from "@core/lib/crypto/proxy";
import {
  parseUserEncryptedKeyOrBlobComposite,
  isValidEmptyVal,
} from "@core/lib/blob";
import { verifyOrgKeyable } from "../trust";
import { clearVoidedPendingEnvUpdatesProducer } from ".";
import { log } from "@core/lib/utils/logger";
import { getObjectName } from "@core/lib/graph";
import { dispatch } from "../../handler";
import { wait } from "@core/lib/utils/wait";
import {
  CRYPTO_ASYMMETRIC_BATCH_SIZE,
  CRYPTO_ASYMMETRIC_BATCH_DELAY_MS,
  CRYPTO_ASYMMETRIC_STATUS_INTERVAL,
} from "./constants";

export const decryptEnvs = async (
    state: Client.State,
    encryptedKeys: Blob.UserEncryptedKeysByEnvironmentIdOrComposite,
    encryptedBlobs: Blob.UserEncryptedBlobsByComposite,
    currentUserPrivkey: Crypto.Privkey,
    context: Client.Context,
    keysOnly?: boolean
  ) => {
    // log("decrypt envs", {
    //   keys: encryptedKeys.length,
    //   blobs: encryptedBlobs.length,
    // });

    const toVerifyKeyableIds = new Set<string>(),
      toDecryptKeys: [string, Parameters<typeof decrypt>[0]][] = [];

    for (let compositeId in encryptedKeys) {
      const encryptedKey = encryptedKeys[compositeId];

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
        compositeId,
        {
          encrypted: encryptedKey.data,
          pubkey: encryptedBy.pubkey,
          privkey: currentUserPrivkey,
        },
      ]);
    }

    // log("decryptEnvs - got toVerifyKeyableIds and toDecryptKeys", {
    //   toVerifyKeyableIds: toVerifyKeyableIds.size,
    //   toDecryptKeys: toDecryptKeys.length,
    // });

    // verify all keyables
    await Promise.all(
      Array.from(toVerifyKeyableIds).map((keyableId) =>
        verifyOrgKeyable(state, keyableId, context)
      )
    );

    // log("decryptEnvs - verified keyables");

    // decrypt all

    const encryptedKeyComposites = Object.keys(encryptedKeys);
    const encryptedBlobComposites = Object.keys(encryptedBlobs);

    if (!keysOnly) {
      const missingBlobs = R.difference(
        encryptedKeyComposites,
        encryptedBlobComposites
      );
      if (missingBlobs.length) {
        log("missing blobs:", {
          missingBlobs,
          keys: R.pick(missingBlobs, encryptedKeys),
        });
        throw new Error("Missing blob keys");
      }
    }

    const emptyKeys = keysOnly
      ? []
      : R.difference(encryptedBlobComposites, encryptedKeyComposites);
    // if (missingKeys.length) {
    //   log("missing encrypted keys:", missingKeys);
    //   throw new Error("Missing encrypted keys");
    // }

    // log("decryptEnvs - got missingBlobs and emptyKeys");
    // log("decryptEnvs - starting decryption");

    let decryptRes: Client.State["envs"][] = [];
    let decryptedSinceStatusUpdate = 0;
    for (let batch of R.splitEvery(
      CRYPTO_ASYMMETRIC_BATCH_SIZE,
      toDecryptKeys
    )) {
      const batchRes = await Promise.all(
        batch.map(([compositeId, params]) =>
          decrypt(params).then(async (decryptedKey) => {
            if (keysOnly) {
              decryptedSinceStatusUpdate++;
              if (
                decryptedSinceStatusUpdate >= CRYPTO_ASYMMETRIC_STATUS_INTERVAL
              ) {
                dispatch(
                  {
                    type: Client.ActionType.CRYPTO_STATUS_INCREMENT,
                    payload: decryptedSinceStatusUpdate,
                  },
                  context
                );
                decryptedSinceStatusUpdate = 0;
              }

              return {
                [compositeId]: {
                  key: decryptedKey,
                  env: {},
                },
              };
            }

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

                decryptedSinceStatusUpdate++;
                if (
                  decryptedSinceStatusUpdate >=
                  CRYPTO_ASYMMETRIC_STATUS_INTERVAL
                ) {
                  dispatch(
                    {
                      type: Client.ActionType.CRYPTO_STATUS_INCREMENT,
                      payload: decryptedSinceStatusUpdate,
                    },
                    context
                  );
                  decryptedSinceStatusUpdate = 0;
                }

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

      await wait(CRYPTO_ASYMMETRIC_BATCH_DELAY_MS);

      decryptRes = decryptRes.concat(batchRes);
    }
    if (decryptedSinceStatusUpdate > 0) {
      dispatch(
        {
          type: Client.ActionType.CRYPTO_STATUS_INCREMENT,
          payload: decryptedSinceStatusUpdate,
        },
        context
      );
      decryptedSinceStatusUpdate = 0;
    }

    // log("decryptedEnvs - decrypted all");

    const decrypted = R.mergeAll(decryptRes) as Client.State["envs"];

    // log("decryptedEnvs - merged all");

    for (let batch of R.splitEvery(CRYPTO_ASYMMETRIC_BATCH_SIZE, emptyKeys)) {
      for (let composite of batch) {
        if (!encryptedBlobs[composite]) {
          log("Missing blob for empty key", {
            composite,
            data: encryptedBlobs[composite].data.data,
            object: g.getEnvironmentName(state.graph, composite.split("||")[0]),
          });
          throw new Error("Missing blob for empty key");
        }

        if (!isValidEmptyVal(encryptedBlobs[composite].data.data)) {
          log("Invalid empty value", {
            composite,
            data: encryptedBlobs[composite].data.data,
            object: g.getEnvironmentName(state.graph, composite.split("||")[0]),
          });
          throw new Error("invalid empty value");
        }

        decrypted[composite] = {
          key: "",
          env: JSON.parse(encryptedBlobs[composite].data.data),
        };
      }

      await dispatch(
        {
          type: Client.ActionType.CRYPTO_STATUS_INCREMENT,
          payload: batch.length,
        },
        context
      );
    }

    // log("decrypted envs");

    return decrypted;
  },
  decryptChangesets = async (
    state: Client.State,
    encryptedKeys: Blob.UserEncryptedChangesetKeysByEnvironmentId,
    encryptedBlobs: Blob.UserEncryptedBlobsByEnvironmentId,
    currentUserPrivkey: Crypto.Privkey,
    context: Client.Context,
    keysOnly?: boolean
  ) => {
    // log("decrypt changesets", {
    //   keys: encryptedKeys.length,
    //   blobs: encryptedBlobs.length,
    // });

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

    // log("decryptChangesets - got toVerifyKeyableIds and toDecryptKeys", {
    //   toVerifyKeyableIds: toVerifyKeyableIds.size,
    //   toDecryptKeys: toDecryptKeys.length,
    // });

    // verify all keyables
    await Promise.all(
      Array.from(toVerifyKeyableIds).map((keyableId) =>
        verifyOrgKeyable(state, keyableId, context)
      )
    );

    // log("decryptChangesets - verified keyables");

    // log("decryptChangesets - beginning decryption");

    // decrypt all

    let decryptRes: Client.State["changesets"][] = [];
    let decryptedSinceStatusUpdate = 0;
    for (let batch of R.splitEvery(
      CRYPTO_ASYMMETRIC_BATCH_SIZE,
      toDecryptKeys
    )) {
      const batchRes = await Promise.all(
        batch.map(([environmentId, params]) =>
          decrypt(params).then(async (decryptedKey) => {
            if (keysOnly) {
              decryptedSinceStatusUpdate++;
              if (
                decryptedSinceStatusUpdate >= CRYPTO_ASYMMETRIC_STATUS_INTERVAL
              ) {
                dispatch(
                  {
                    type: Client.ActionType.CRYPTO_STATUS_INCREMENT,
                    payload: decryptedSinceStatusUpdate,
                  },
                  context
                );
                decryptedSinceStatusUpdate = 0;
              }

              return {
                [environmentId]: {
                  key: decryptedKey,
                  changesets: [],
                },
              };
            }

            const environmentEncrypedBlobs =
              encryptedBlobs[environmentId] ?? [];

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

                    decryptedSinceStatusUpdate++;
                    if (
                      decryptedSinceStatusUpdate >=
                      CRYPTO_ASYMMETRIC_STATUS_INTERVAL
                    ) {
                      dispatch(
                        {
                          type: Client.ActionType.CRYPTO_STATUS_INCREMENT,
                          payload: decryptedSinceStatusUpdate,
                        },
                        context
                      );
                      decryptedSinceStatusUpdate = 0;
                    }

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

      await wait(CRYPTO_ASYMMETRIC_BATCH_DELAY_MS);
      decryptRes = decryptRes.concat(batchRes);
    }
    if (decryptedSinceStatusUpdate > 0) {
      dispatch(
        {
          type: Client.ActionType.CRYPTO_STATUS_INCREMENT,
          payload: decryptedSinceStatusUpdate,
        },
        context
      );
      decryptedSinceStatusUpdate = 0;
    }

    // log("decryptChangesets - decrypted all");

    const res = R.mergeAll(decryptRes);

    // log("decryptChangesets - merged all");

    // log("decrypted changesets");

    return res;
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

        // if (!draft.graph[envParentId]) {
        //   log("missing env parent", {
        //     envParentId,
        //     composite,
        //     "envs[composite]": envs[composite],
        //   });
        // }

        draft.envs[composite] = envs[composite];
      }

      for (let envParentId of updatedEnvParentIds) {
        const envParent = draft.graph[envParentId] as Model.EnvParent;

        // if (!envParent) {
        //   continue;
        // }

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

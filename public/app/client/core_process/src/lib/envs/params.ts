import * as R from "ramda";
import { Client, Api, Model, Crypto } from "@core/types";
import { encryptSymmetricWithKey } from "@core/lib/crypto/proxy";
import {
  getAuth,
  getEnvInherits,
  getKeyableEnv,
  ensureEnvsFetched,
  ensureChangesetsFetched,
  getEnvMetaOnly,
  getPendingActionsByEnvironmentId,
  getInheritanceOverrides,
} from "@core/lib/client";
import {
  getEnvironmentPermissions,
  getEnvironmentName,
  getObjectName,
  getOrg,
} from "@core/lib/graph";
import { encryptedKeyParamsForEnvironments } from ".";
import {
  getUserEncryptedKeyOrBlobComposite,
  isValidEmptyVal,
} from "@core/lib/blob";
import set from "lodash.set";
import { log } from "@core/lib/utils/logger";
import { createPatch } from "rfc6902";
import { dispatch } from "../../handler";
import {
  CRYPTO_SYMMETRIC_BATCH_SIZE,
  CRYPTO_SYMMETRIC_BATCH_DELAY_MS,
  CRYPTO_SYMMETRIC_STATUS_INTERVAL,
} from "./constants";
import { wait } from "@core/lib/utils/wait";

export const envParamsForEnvironments = async (params: {
  state: Client.State;
  environmentIds: string[];
  context: Client.Context;
  message?: string;
  pending?: true;
  rotateKeys?: true;
  reencryptChangesets?: true;
  initEnvs?: true;
}) => {
  const {
    state,
    context,
    pending,
    message,
    rotateKeys,
    reencryptChangesets,
    initEnvs,
  } = params;

  const currentAuth = getAuth(state, context.accountIdOrCliKey);
  if (!currentAuth || !currentAuth.privkey) {
    throw new Error("Authentication and decrypted privkey required");
  }
  const org = getOrg(state.graph);

  let environmentIds = params.environmentIds;

  if (rotateKeys) {
    environmentIds = environmentIds.filter((environmentId) => {
      const environment = state.graph[environmentId] as
        | Model.Environment
        | undefined;

      if (environment) {
        return Boolean(environment.envUpdatedAt);
      } else {
        const [envParentId, localsUserId] = environmentId.split("|");
        const envParent = state.graph[envParentId] as Model.EnvParent;
        return Boolean(envParent.localsUpdatedAtByUserId[localsUserId]);
      }
    });
  }

  const toEncrypt: [
    string[],
    {
      data: string;
      encryptionKey?: string;
    }
  ][] = [];

  const addPaths: [string[], any][] = [];

  const {
    environmentKeysByComposite,
    changesetKeysByEnvironmentId,
    keys,
    environmentIdsSet,
    envParentIds,
    baseEnvironmentsByEnvParentId,
    inheritingEnvironmentIdsByEnvironmentId,
  } = await encryptedKeyParamsForEnvironments({
    ...params,
    environmentIds,
    newKeysOnly: !rotateKeys,
  });

  let blobs: Api.Net.EnvParams["blobs"] = {};

  // for each environment, queue encryption ops for each
  // permitted device, invite, device grant, local key, server,
  // and recovery key
  for (let environmentId of environmentIds) {
    let envParentId: string, localsUserId: string | undefined;
    const environment = state.graph[environmentId] as
      | Model.Environment
      | undefined;
    if (environment) {
      envParentId = environment.envParentId;
    } else {
      [envParentId, localsUserId] = environmentId.split("|");
    }
    const envParent = state.graph[envParentId] as Model.EnvParent;

    ensureEnvsFetched(state, envParentId);

    let blobBasePath: string[] = [envParentId];

    if (localsUserId) {
      blobBasePath = [...blobBasePath, "locals", localsUserId];
    } else if (environment) {
      blobBasePath = [...blobBasePath, "environments", environmentId];
    }

    const env = getKeyableEnv(
      state,
      {
        envParentId,
        environmentId,
      },
      pending
    );
    const envIsEmpty = R.isEmpty(env);
    const envComposite = getUserEncryptedKeyOrBlobComposite({ environmentId });
    const envSymmetricKey =
      environmentKeysByComposite[envComposite] ?? state.envs[envComposite]?.key;
    environmentKeysByComposite[envComposite] = envSymmetricKey;

    toEncrypt.push([
      [...blobBasePath, "env"],
      {
        data: JSON.stringify(env),
        encryptionKey: envSymmetricKey,
      },
    ]);

    const meta = getEnvMetaOnly(
      state,
      {
        envParentId,
        environmentId,
      },
      pending
    );

    const metaComposite = getUserEncryptedKeyOrBlobComposite({
      environmentId,
      envPart: "meta",
    });
    const metaSymmetricKey =
      environmentKeysByComposite[metaComposite] ??
      state.envs[metaComposite]?.key;
    environmentKeysByComposite[metaComposite] = metaSymmetricKey;
    toEncrypt.push([
      [...blobBasePath, "meta"],
      {
        data: JSON.stringify(meta),
        encryptionKey: metaSymmetricKey,
      },
    ]);

    if (!localsUserId) {
      const inherits = getEnvInherits(
        state,
        {
          envParentId,
          environmentId,
        },
        pending
      );
      const inheritsComposite = getUserEncryptedKeyOrBlobComposite({
        environmentId,
        envPart: "inherits",
      });
      const inheritsSymmetricKey =
        environmentKeysByComposite[inheritsComposite] ??
        state.envs[inheritsComposite]?.key;
      environmentKeysByComposite[inheritsComposite] = inheritsSymmetricKey;
      toEncrypt.push([
        [...blobBasePath, "inherits"],
        {
          data: JSON.stringify(inherits),
          encryptionKey: inheritsSymmetricKey,
        },
      ]);
    }

    const changesetsSymmetricKey =
      changesetKeysByEnvironmentId[environmentId] ??
      state.changesets[environmentId]?.key;

    if (changesetsSymmetricKey) {
      changesetKeysByEnvironmentId[environmentId] = changesetsSymmetricKey;
    }

    if (reencryptChangesets || (initEnvs && envIsEmpty)) {
      if (!initEnvs) {
        ensureChangesetsFetched(state, envParentId);
      }

      const changesets = initEnvs
        ? []
        : state.changesets[environmentId]?.changesets ?? [];

      if (changesets.length > 0 && !changesetsSymmetricKey) {
        throw new Error("Missing changeset encryption key");
      }

      if (changesetsSymmetricKey) {
        const byId = R.groupBy(R.prop("id"), changesets);

        for (let changesetId in byId) {
          const changesetPayloads = byId[changesetId].map(
            R.pick(["actions", "message"])
          );
          toEncrypt.push([
            [...blobBasePath, "changesetsById", changesetId, "data"],
            {
              data: JSON.stringify(changesetPayloads),
              encryptionKey: changesetsSymmetricKey,
            },
          ]);

          addPaths.push([
            [...blobBasePath, "changesetsById", changesetId, "createdAt"],
            byId[changesetId][0].createdAt,
          ]);
          addPaths.push([
            [...blobBasePath, "changesetsById", changesetId, "createdById"],
            byId[changesetId][0].createdById,
          ]);
        }
      }

      if (changesets.length == 0) {
        addPaths.push([[...blobBasePath, "changesetsById"], {}]);
      }
    } else if (pending || (initEnvs && !envIsEmpty)) {
      if (!changesetsSymmetricKey) {
        throw new Error("Missing changeset encryption key");
      }

      const changeset: Client.Env.ChangesetPayload = initEnvs
        ? {
            actions: [
              {
                type: Client.ActionType.IMPORT_ENVIRONMENT,
                payload: {
                  diffs: createPatch(
                    {
                      inherits: {},
                      variables: {},
                    },
                    { inherits: {}, variables: env }
                  ),
                  reverse: createPatch(
                    { inherits: {}, variables: env },
                    {
                      inherits: {},
                      variables: {},
                    }
                  ),
                },
                meta: {
                  envParentId,
                  environmentId,
                  entryKeys: Object.keys(env),
                },
              },
            ],
          }
        : {
            actions: getPendingActionsByEnvironmentId(state)[environmentId].map(
              (action) => ({
                ...action,
                meta: R.omit(["pendingAt"], action.meta),
              })
            ),
            message,
          };

      toEncrypt.push([
        [...blobBasePath, "changesets"],
        {
          data: JSON.stringify([changeset]),
          encryptionKey: changesetsSymmetricKey,
        },
      ]);
    }
  }

  // now queue encryption ops for inheritance overrides if environments on either side of the relationship are being updated
  for (let envParentId of envParentIds) {
    const baseEnvironments = baseEnvironmentsByEnvParentId[envParentId];

    for (let baseEnvironment of baseEnvironments) {
      const inheritingEnvironmentIds =
        inheritingEnvironmentIdsByEnvironmentId[baseEnvironment.id];

      for (let inheritingEnvironmentId of inheritingEnvironmentIds) {
        const inheritingEnvironment = state.graph[
          inheritingEnvironmentId
        ] as Model.Environment;

        if (
          !(
            environmentIdsSet.has(inheritingEnvironmentId) ||
            environmentIdsSet.has(baseEnvironment.id) ||
            (inheritingEnvironment.isSub &&
              environmentIdsSet.has(inheritingEnvironment.parentEnvironmentId))
          )
        ) {
          continue;
        }

        const currentUserBasePermissions = getEnvironmentPermissions(
          state.graph,
          baseEnvironment.id,
          currentAuth.userId
        );

        if (!currentUserBasePermissions.has("read")) {
          continue;
        }

        const composite = getUserEncryptedKeyOrBlobComposite({
          environmentId: inheritingEnvironmentId,
          inheritsEnvironmentId: baseEnvironment.id,
        });

        const encryptionKey =
          environmentKeysByComposite[composite] ?? state.envs[composite]?.key;

        if (encryptionKey) {
          environmentKeysByComposite[composite] = encryptionKey;

          let overrides =
            getInheritanceOverrides(
              state,
              {
                envParentId,
                environmentId: inheritingEnvironmentId,
                forInheritsEnvironmentId: baseEnvironment.id,
              },
              pending
            )[baseEnvironment.id] ?? {};

          if (inheritingEnvironment.isSub) {
            overrides = {
              ...(getInheritanceOverrides(
                state,
                {
                  envParentId,
                  environmentId: inheritingEnvironment.parentEnvironmentId,
                  forInheritsEnvironmentId: baseEnvironment.id,
                },
                pending
              )[baseEnvironment.id] ?? {}),
              ...overrides,
            };
          }

          const data = JSON.stringify(overrides);

          toEncrypt.push([
            [
              envParentId,
              "environments",
              inheritingEnvironmentId,
              "inheritanceOverrides",
              baseEnvironment.id,
            ],
            {
              data,
              encryptionKey,
            },
          ]);
        }
      }
    }
  }

  await dispatch(
    {
      type: Client.ActionType.SET_CRYPTO_STATUS,
      payload: {
        processed: 0,
        total: toEncrypt.length,
        op: "encrypt",
        dataType: "blobs",
      },
    },
    context
  );

  // log("envParamsForEnvironments - starting encryption");

  let pathResults: [string[], Crypto.EncryptedData][] = [];
  let encryptedSinceStatusUpdate = 0;
  for (let batch of R.splitEvery(CRYPTO_SYMMETRIC_BATCH_SIZE, toEncrypt)) {
    const res = await Promise.all(
      batch.map(([path, params]) => {
        if (params.encryptionKey) {
          return encryptSymmetricWithKey({
            data: params.data,
            encryptionKey: params.encryptionKey,
          }).then((encrypted) => {
            encryptedSinceStatusUpdate++;
            if (
              encryptedSinceStatusUpdate >= CRYPTO_SYMMETRIC_STATUS_INTERVAL
            ) {
              dispatch(
                {
                  type: Client.ActionType.CRYPTO_STATUS_INCREMENT,
                  payload: encryptedSinceStatusUpdate,
                },
                context
              );
              encryptedSinceStatusUpdate = 0;
            }
            return [path, encrypted];
          });
        }

        if (!org.optimizeEmptyEnvs) {
          log("Missing encrypted key for blob", {
            path: path.map((p) =>
              state.graph[p] ? getObjectName(state.graph, p) : p
            ),
            params,
            pending,
            message,
            rotateKeys,
            reencryptChangesets,
            initEnvs,
          });
          throw new Error("Missing encrypted key for blob");
        }

        if (!isValidEmptyVal(params.data)) {
          log("invalid empty value", {
            path: path.map((p) =>
              state.graph[p] ? getObjectName(state.graph, p) : p
            ),
            params,
            pending,
            message,
            rotateKeys,
            reencryptChangesets,
            initEnvs,
          });

          throw new Error("invalid empty value");
        }

        if (encryptedSinceStatusUpdate >= CRYPTO_SYMMETRIC_STATUS_INTERVAL) {
          dispatch(
            {
              type: Client.ActionType.CRYPTO_STATUS_INCREMENT,
              payload: encryptedSinceStatusUpdate,
            },
            context
          );
          encryptedSinceStatusUpdate = 0;
        }

        return [path, { data: params.data, nonce: "" }];
      }) as Promise<[string[], Crypto.EncryptedData]>[]
    );

    await wait(CRYPTO_SYMMETRIC_BATCH_DELAY_MS);

    pathResults = pathResults.concat(res);
  }

  // log("envParamsForEnvironments - encrypted all");

  await dispatch(
    {
      type: Client.ActionType.SET_CRYPTO_STATUS,
      payload: undefined,
    },
    context
  );

  for (let [path, data] of pathResults) {
    set(blobs, path, data);
  }

  for (let [path, data] of addPaths) {
    set(blobs, path, data);
  }

  // log("params", { pathResults });

  return {
    keys,
    blobs,
    environmentKeysByComposite,
    changesetKeysByEnvironmentId,
  };
};

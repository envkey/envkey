import * as R from "ramda";
import { Client, Api, Model, Crypto } from "@core/types";
import { encryptSymmetricWithKey } from "@core/lib/crypto/proxy";
import {
  getEnvInherits,
  getKeyableEnv,
  ensureEnvsFetched,
  ensureChangesetsFetched,
  getEnvMetaOnly,
  getPendingActionsByEnvironmentId,
  getInheritanceOverrides,
} from "@core/lib/client";
import { encryptedKeyParamsForEnvironments } from ".";
import { getUserEncryptedKeyOrBlobComposite } from "@core/lib/blob";
import set from "lodash.set";
import { log } from "@core/lib/utils/logger";

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
  const { state, pending, message, rotateKeys, reencryptChangesets, initEnvs } =
    params;

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

  const toEncrypt: [string[], Parameters<typeof encryptSymmetricWithKey>[0]][] =
    [];

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
    const envComposite = getUserEncryptedKeyOrBlobComposite({ environmentId });
    const envSymmetricKey =
      environmentKeysByComposite[envComposite] ?? state.envs[envComposite].key;
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
      state.envs[metaComposite].key;
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
        state.envs[inheritsComposite].key;
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

    if (reencryptChangesets || initEnvs) {
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
    } else if (pending) {
      if (!changesetsSymmetricKey) {
        throw new Error("Missing changeset encryption key");
      }

      const changeset: Client.Env.ChangesetPayload = {
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
        if (
          !(
            environmentIdsSet.has(inheritingEnvironmentId) ||
            environmentIdsSet.has(baseEnvironment.id)
          )
        ) {
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

          const data = JSON.stringify(
            getInheritanceOverrides(
              state,
              {
                envParentId,
                environmentId: inheritingEnvironmentId,
                forInheritsEnvironmentId: baseEnvironment.id,
              },
              pending
            )[baseEnvironment.id] ?? {}
          );

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

  const cryptoPromises = toEncrypt.map(([path, params]) =>
      encryptSymmetricWithKey(params).then((encrypted) => [path, encrypted])
    ) as Promise<[string[], Crypto.EncryptedData]>[],
    pathResults = await Promise.all(cryptoPromises);

  for (let [path, data] of pathResults) {
    set(blobs, path, data);
  }

  for (let [path, data] of addPaths) {
    set(blobs, path, data);
  }

  return {
    keys,
    blobs,
    environmentKeysByComposite,
    changesetKeysByEnvironmentId,
  };
};

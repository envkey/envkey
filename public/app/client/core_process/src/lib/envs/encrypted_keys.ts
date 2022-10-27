import * as R from "ramda";
import { Client, Api, Model, Crypto } from "@core/types";
import {
  graphTypes,
  getEnvironmentPermissions,
  getEnvParentPermissions,
  getOrgPermissions,
  getConnectedBlockEnvironmentsForApp,
  getDeviceIdsForUser,
  getPubkeysByDeviceIdForUser,
  getSubEnvironmentsByParentEnvironmentId,
  getLocalKeysByEnvironmentId,
  getServersByEnvironmentId,
  getConnectedEnvironments,
  getActiveGeneratedEnvkeysByKeyableParentId,
  getLocalKeysByLocalsComposite,
  getConnectedAppsForBlock,
  getEnvironmentsByEnvParentId,
  getEnvironmentName,
  getObjectName,
  getOrg,
  authz,
} from "@core/lib/graph";
import { getUserEncryptedKeyOrBlobComposite } from "@core/lib/blob";
import { encrypt } from "@core/lib/crypto/proxy";
import { symmetricEncryptionKey } from "@core/lib/crypto/utils";
import { verifyOrgKeyable } from "../trust";
import {
  getAuth,
  ensureEnvsFetched,
  ensureChangesetsFetched,
  getEnvWithMeta,
  getInheritingEnvironmentIds,
  getInheritanceOverrides,
} from "@core/lib/client";
import set from "lodash.set";
import { dispatch } from "../../handler";
import { log } from "@core/lib/utils/logger";
import {
  CRYPTO_ASYMMETRIC_BATCH_SIZE,
  CRYPTO_ASYMMETRIC_BATCH_DELAY_MS,
  CRYPTO_ASYMMETRIC_STATUS_INTERVAL,
} from "./constants";
import { wait } from "@core/lib/utils/wait";

type ToEncrypt = [string[], Parameters<typeof encrypt>[0]][];

export const encryptedKeyParamsForEnvironments = async (params: {
  state: Client.State;
  environmentIds: string[];
  pending?: true;
  newKeysOnly?: boolean; // will only generate keys if they aren't set yet in state for a given path
  reencryptChangesets?: boolean;
  initEnvs?: true;
  context: Client.Context;
}): Promise<{
  environmentKeysByComposite: Record<string, string>;
  changesetKeysByEnvironmentId: Record<string, string>;
  keys: Api.Net.EnvParams["keys"];
  inheritingEnvironmentIdsByEnvironmentId: Record<string, Set<string>>;
  environmentIdsSet: Set<string>;
  envParentIds: string[];
  baseEnvironmentsByEnvParentId: Record<string, Model.Environment[]>;
}> => {
  const {
    state,
    environmentIds,
    pending,
    newKeysOnly,
    reencryptChangesets,
    initEnvs,
    context,
  } = params;

  const now = Date.now(),
    currentAuth = getAuth(state, context.accountIdOrCliKey);
  if (!currentAuth || !currentAuth.privkey) {
    throw new Error("Authentication and decrypted privkey required");
  }
  const privkey = currentAuth.privkey;
  const org = getOrg(state.graph);

  const environmentKeysByComposite: Record<string, string> = {};
  const changesetKeysByEnvironmentId: Record<string, string> = {};

  let keys: Api.Net.EnvParams["keys"] = {};

  const toVerifyKeyableIds = new Set<string>(),
    toEncrypt: ToEncrypt = [],
    allUserIds = [
      ...graphTypes(state.graph).orgUsers.map(R.prop("id")),
      ...graphTypes(state.graph).cliUsers.map(R.prop("id")),
    ];

  // for each environment, generate key and queue encryption ops for each
  // permitted device, invite, device grant, local key, server, and recovery key
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

    const envWithMeta = getEnvWithMeta(
      state,
      { envParentId, environmentId },
      pending
    );
    const isEmpty = R.isEmpty(envWithMeta.variables);
    const parentIsEmpty = environment?.isSub
      ? R.isEmpty(
          getEnvWithMeta(
            state,
            { envParentId, environmentId: environment.parentEnvironmentId },
            pending
          ).variables
        )
      : false;

    let envSymmetricKey: string | undefined;
    let metaSymmetricKey: string | undefined;
    let inheritsSymmetricKey: string | undefined;
    let changesetsSymmetricKey: string | undefined;

    let parentEnvComposite: string | undefined;
    let parentEnvSymmetricKey: string | undefined;

    const [
      [envComposite, existingEnvSymmetricKey],
      [metaComposite, existingMetaSymmetricKey],
      [inheritsComposite, existingInheritsSymmetricKey],
    ] = (["env", "meta", "inherits"] as const).map((envPart) => {
      const composite = getUserEncryptedKeyOrBlobComposite({
        environmentId,
        envPart,
      });
      return [composite, state.envs[composite]?.key];
    });

    if (
      !(newKeysOnly && existingEnvSymmetricKey) &&
      (!org.optimizeEmptyEnvs || !isEmpty || existingEnvSymmetricKey)
    ) {
      envSymmetricKey =
        environmentKeysByComposite[envComposite] ?? // in case it's already been set via a sub-environment
        symmetricEncryptionKey();

      environmentKeysByComposite[envComposite] = envSymmetricKey;
    }

    if (
      !(newKeysOnly && existingMetaSymmetricKey) &&
      (!org.optimizeEmptyEnvs || !isEmpty || existingMetaSymmetricKey)
    ) {
      metaSymmetricKey = symmetricEncryptionKey();
      environmentKeysByComposite[metaComposite] = metaSymmetricKey;
    }

    if (!localsUserId) {
      if (
        !(newKeysOnly && existingInheritsSymmetricKey) &&
        (!org.optimizeEmptyEnvs || !isEmpty || existingInheritsSymmetricKey)
      ) {
        inheritsSymmetricKey = symmetricEncryptionKey();

        environmentKeysByComposite[inheritsComposite] = inheritsSymmetricKey;
      }
    }

    if (environment?.isSub) {
      parentEnvComposite = getUserEncryptedKeyOrBlobComposite({
        environmentId: environment.parentEnvironmentId,
      });
      const existingParentSymmetricKey = state.envs[parentEnvComposite]?.key;

      if (
        !(newKeysOnly && existingParentSymmetricKey) &&
        (!org.optimizeEmptyEnvs || !parentIsEmpty || existingParentSymmetricKey)
      ) {
        parentEnvSymmetricKey =
          environmentKeysByComposite[parentEnvComposite] ?? // in case it's already been set via parent environment
          symmetricEncryptionKey();
        environmentKeysByComposite[parentEnvComposite] = parentEnvSymmetricKey;
      }
    }

    let changesetsToReencrypt: Client.Env.Changeset[] | undefined;
    if ((pending || initEnvs) && !reencryptChangesets) {
      changesetsSymmetricKey =
        state.changesets[environmentId]?.key ?? symmetricEncryptionKey();
    } else if (reencryptChangesets) {
      ensureChangesetsFetched(state, envParentId);

      changesetsToReencrypt = state.changesets[environmentId]?.changesets;
      if (changesetsToReencrypt) {
        changesetsSymmetricKey = symmetricEncryptionKey();
      }
    }

    if (changesetsSymmetricKey) {
      changesetKeysByEnvironmentId[environmentId] = changesetsSymmetricKey;
    }

    for (let userId of allUserIds) {
      const orgRoleId = (state.graph[userId] as Model.CliUser | Model.OrgUser)
          .orgRoleId,
        targetUserOrgPermissions = getOrgPermissions(state.graph, orgRoleId),
        deviceIds = getDeviceIdsForUser(state.graph, userId, now),
        pubkeysByDeviceId = getPubkeysByDeviceIdForUser(
          state.graph,
          userId,
          now
        );

      if (localsUserId) {
        if (!(envSymmetricKey || metaSymmetricKey || changesetsSymmetricKey)) {
          continue;
        }

        const targetUserEnvParentPermissions = getEnvParentPermissions(
          state.graph,
          envParent.id,
          userId
        );

        if (
          authz.canReadLocals(state.graph, userId, envParentId, localsUserId)
        ) {
          for (let deviceId of deviceIds) {
            const pubkey = pubkeysByDeviceId[deviceId];
            if (!pubkey) {
              continue;
            }

            toVerifyKeyableIds.add(deviceId == "cli" ? userId : deviceId);

            if (envSymmetricKey) {
              toEncrypt.push([
                [
                  "users",
                  userId,
                  deviceId,
                  envParentId,
                  "locals",
                  localsUserId,
                  "env",
                ],
                {
                  data: envSymmetricKey,
                  pubkey,
                  privkey,
                },
              ]);
            }

            if (metaSymmetricKey) {
              toEncrypt.push([
                [
                  "users",
                  userId,
                  deviceId,
                  envParentId,
                  "locals",
                  localsUserId,
                  "meta",
                ],
                {
                  data: metaSymmetricKey,
                  pubkey,
                  privkey,
                },
              ]);
            }

            if (
              authz.canReadLocalsVersions(
                state.graph,
                userId,
                envParent.id,
                localsUserId
              )
            ) {
              if (
                (pending || initEnvs) &&
                !reencryptChangesets &&
                changesetsSymmetricKey
              ) {
                toEncrypt.push([
                  [
                    "users",
                    userId,
                    deviceId,
                    envParentId,
                    "locals",
                    localsUserId,
                    "changesets",
                  ],
                  {
                    data: changesetsSymmetricKey,
                    pubkey,
                    privkey,
                  },
                ]);
              } else if (reencryptChangesets && changesetsToReencrypt) {
                const path = [
                  "users",
                  userId,
                  deviceId,
                  envParentId,
                  "locals",
                  localsUserId,
                  "changesets",
                ];

                toEncrypt.push([
                  path,
                  {
                    data: changesetKeysByEnvironmentId[environmentId],
                    pubkey,
                    privkey,
                  },
                ]);
              }
            }
          }
        }
      } else {
        const targetUserPermissions = getEnvironmentPermissions(
          state.graph,
          environmentId,
          userId
        );

        const toEncryptKeys: ["env" | "meta" | "inherits", string][] = [];
        if (targetUserPermissions.has("read") && envSymmetricKey) {
          toEncryptKeys.push(["env", envSymmetricKey]);
        }
        if (targetUserPermissions.has("read_meta") && metaSymmetricKey) {
          toEncryptKeys.push(["meta", metaSymmetricKey]);
        }
        if (
          targetUserPermissions.has("read_inherits") &&
          inheritsSymmetricKey
        ) {
          toEncryptKeys.push(["inherits", inheritsSymmetricKey]);
        }

        for (let deviceId of deviceIds) {
          const pubkey = pubkeysByDeviceId[deviceId];
          if (!pubkey) {
            continue;
          }

          toVerifyKeyableIds.add(deviceId == "cli" ? userId : deviceId);

          for (let [envField, key] of toEncryptKeys) {
            toEncrypt.push([
              [
                "users",
                userId,
                deviceId,
                envParentId,
                "environments",
                environmentId,
                envField,
              ],
              {
                data: key,
                pubkey,
                privkey,
              },
            ]);
          }

          if (
            targetUserPermissions.has("read") &&
            targetUserPermissions.has("read_history")
          ) {
            if (
              (pending || initEnvs) &&
              !reencryptChangesets &&
              changesetsSymmetricKey
            ) {
              toEncrypt.push([
                [
                  "users",
                  userId,
                  deviceId,
                  envParentId,
                  "environments",
                  environmentId,
                  "changesets",
                ],
                {
                  data: changesetsSymmetricKey,
                  pubkey,
                  privkey,
                },
              ]);
            } else if (
              reencryptChangesets &&
              changesetsToReencrypt &&
              changesetsSymmetricKey
            ) {
              const path = [
                "users",
                userId,
                deviceId,
                envParentId,
                "environments",
                environmentId,
                "changesets",
              ];
              toEncrypt.push([
                path,
                {
                  data: changesetsSymmetricKey,
                  pubkey,
                  privkey,
                },
              ]);
            }
          }
        }
      }
    }

    let keyableParents: Model.KeyableParent[] = [];

    if (localsUserId) {
      if (envParent.type == "app") {
        keyableParents = keyableParents.concat(
          getLocalKeysByLocalsComposite(state.graph)[environmentId] ?? []
        );
      } else if (envParent.type == "block") {
        const connectedApps = getConnectedAppsForBlock(
          state.graph,
          envParent.id
        );
        for (let app of connectedApps) {
          keyableParents = keyableParents.concat(
            getLocalKeysByLocalsComposite(state.graph)[
              app.id + "|" + localsUserId
            ] ?? []
          );
        }
      }
    } else if (environment) {
      let allEnvironmentIds: string[] = [
        environmentId,
        ...getConnectedEnvironments(state.graph, environmentId).map(
          R.prop("id")
        ),
      ];

      if (!environment.isSub) {
        allEnvironmentIds = [
          ...allEnvironmentIds,
          ...R.flatten(
            allEnvironmentIds.map((id) =>
              (
                getSubEnvironmentsByParentEnvironmentId(state.graph)[id] ?? []
              ).map(R.prop("id"))
            )
          ),
        ];
      }

      for (let id of allEnvironmentIds) {
        keyableParents = keyableParents.concat(
          getLocalKeysByEnvironmentId(state.graph)[id] ?? []
        );
        keyableParents = keyableParents.concat(
          getServersByEnvironmentId(state.graph)[id] ?? []
        );
      }
    }

    for (let keyableParent of keyableParents) {
      const generatedEnvkey = getActiveGeneratedEnvkeysByKeyableParentId(
        state.graph
      )[keyableParent.id];
      if (!generatedEnvkey) {
        continue;
      }

      toVerifyKeyableIds.add(keyableParent.id);

      const basePath = [
        envParent.type == "block" ? "blockKeyableParents" : "keyableParents",
        envParent.type == "block" ? envParent.id : null,
        keyableParent.id,
        generatedEnvkey.id,
      ].filter(Boolean) as string[];

      if (keyableParent.type == "localKey" && localsUserId) {
        if (envSymmetricKey) {
          const localOverridesPath = [...basePath, "localOverrides"];

          toEncrypt.push([
            [...localOverridesPath, "data"],
            {
              data: envSymmetricKey,
              pubkey: generatedEnvkey.pubkey,
              privkey,
            },
          ]);
        }
      } else if (environment) {
        // env or subenv
        if (environment.isSub) {
          if (envSymmetricKey) {
            toEncrypt.push([
              [...basePath, "subEnv", "data"],
              {
                data: envSymmetricKey,
                pubkey: generatedEnvkey.pubkey,
                privkey,
              },
            ]);
          }

          if (parentEnvSymmetricKey) {
            toEncrypt.push([
              [...basePath, "env", "data"],
              {
                data: parentEnvSymmetricKey,
                pubkey: generatedEnvkey.pubkey,
                privkey,
              },
            ]);
          }
        } else if (envSymmetricKey) {
          toEncrypt.push([
            [...basePath, "env", "data"],
            {
              data: envSymmetricKey,
              pubkey: generatedEnvkey.pubkey,
              privkey,
            },
          ]);
        }
      }
    }
  }

  // now generate keys for inheritance overrides if environments on either side of the relationship are being updated
  const inheritingEnvironmentIdsByEnvironmentId: Record<
    string,
    Set<string>
  > = {};

  const environmentIdsSet = new Set(environmentIds);

  const envParentIds = R.uniq(
    environmentIds
      .map((environmentId) => {
        const environment = state.graph[environmentId] as
          | Model.Environment
          | undefined;
        return environment ? environment.envParentId : undefined;
      })
      .filter(Boolean)
  ) as string[];

  const baseEnvironmentsByEnvParentId = envParentIds.reduce(
    (agg, envParentId) => ({
      ...agg,
      [envParentId]: (
        getEnvironmentsByEnvParentId(state.graph)[envParentId] ?? []
      ).filter((environment) => !environment.isSub),
    }),
    {} as Record<string, Model.Environment[]>
  );

  for (let envParentId of envParentIds) {
    const envParent = state.graph[envParentId] as Model.EnvParent;
    const baseEnvironments = baseEnvironmentsByEnvParentId[envParentId];

    const inheritingEnvironmentIdsByBaseEnvironmentId: Record<
      string,
      Set<string>
    > = {};
    const inheritingKeyableParentsByBaseEnvironmentId: Record<
      string,
      Model.KeyableParent[]
    > = {};

    for (let baseEnvironment of baseEnvironments) {
      const inheritingEnvironmentIds = new Set(
        (getEnvironmentsByEnvParentId(state.graph)[envParentId] ?? [])
          .filter(
            (sibling) =>
              sibling.id != baseEnvironment.id &&
              !(
                sibling.isSub &&
                sibling.parentEnvironmentId == baseEnvironment.id
              )
          )
          .map(R.prop("id"))
      );

      inheritingEnvironmentIdsByBaseEnvironmentId[baseEnvironment.id] =
        inheritingEnvironmentIds;

      inheritingKeyableParentsByBaseEnvironmentId[baseEnvironment.id] =
        getInheritingKeyableParents({
          state,
          baseEnvironment,
          inheritingEnvironmentIds,
          environmentIdsSet,
        });
    }

    for (let baseEnvironment of baseEnvironments) {
      const inheritingEnvironmentIds =
        inheritingEnvironmentIdsByBaseEnvironmentId[baseEnvironment.id];

      inheritingEnvironmentIdsByEnvironmentId[baseEnvironment.id] =
        inheritingEnvironmentIds;

      addUserInheritanceOverrides({
        state,
        currentUserId: currentAuth.userId,
        baseEnvironment,
        inheritingEnvironmentIds,
        environmentIdsSet,
        envParentId,
        newKeysOnly,
        environmentKeysByComposite,
        toEncrypt,
        privkey,
        allUserIds,
        pending,
        now,
      });

      const inheritingKeyableParents =
        inheritingKeyableParentsByBaseEnvironmentId[baseEnvironment.id];

      addKeyableParentInheritanceOverrides({
        state,
        currentUserId: currentAuth.userId,
        baseEnvironment,
        inheritingKeyableParents,
        envParent,
        toVerifyKeyableIds,
        newKeysOnly,
        environmentKeysByComposite,
        toEncrypt,
        privkey,
        pending,
        addInheritingSubEnvironments: false,
      });
    }

    for (let baseEnvironment of baseEnvironments) {
      const inheritingKeyableParents =
        inheritingKeyableParentsByBaseEnvironmentId[baseEnvironment.id];

      addKeyableParentInheritanceOverrides({
        state,
        currentUserId: currentAuth.userId,
        baseEnvironment,
        inheritingKeyableParents,
        envParent,
        toVerifyKeyableIds,
        newKeysOnly,
        environmentKeysByComposite,
        toEncrypt,
        privkey,
        pending,
        addInheritingSubEnvironments: true,
      });
    }
  }

  // verify all keyables
  await Promise.all(
    Array.from(toVerifyKeyableIds).map((keyableId) =>
      verifyOrgKeyable(state, keyableId, context)
    )
  );

  await dispatch(
    {
      type: Client.ActionType.SET_CRYPTO_STATUS,
      payload: {
        processed: 0,
        total: toEncrypt.length,
        op: "encrypt",
        dataType: "keys",
      },
    },
    context
  );

  // log("encryptedKeyParamsForEnvironments - starting encryption");

  let pathResults: [string[], Crypto.EncryptedData][] = [];
  let encryptedSinceStatusUpdate = 0;
  for (let batch of R.splitEvery(CRYPTO_ASYMMETRIC_BATCH_SIZE, toEncrypt)) {
    const res = await Promise.all(
      batch.map(([path, params]) =>
        encrypt(params).then((encrypted) => {
          encryptedSinceStatusUpdate++;
          if (encryptedSinceStatusUpdate >= CRYPTO_ASYMMETRIC_STATUS_INTERVAL) {
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
        })
      ) as Promise<[string[], Crypto.EncryptedData]>[]
    );

    await wait(CRYPTO_ASYMMETRIC_BATCH_DELAY_MS);

    pathResults = pathResults.concat(res);
  }
  // log("encryptedKeyParamsForEnvironments - encrypted all");

  await dispatch(
    {
      type: Client.ActionType.SET_CRYPTO_STATUS,
      payload: undefined,
    },
    context
  );

  for (let [path, data] of pathResults) {
    set(keys, path, data);
  }

  return {
    environmentKeysByComposite,
    changesetKeysByEnvironmentId,
    keys,
    environmentIdsSet,
    envParentIds,
    baseEnvironmentsByEnvParentId,
    inheritingEnvironmentIdsByEnvironmentId,
  };
};

const getInheritingKeyableParents = (params: {
  state: Client.State;
  baseEnvironment: Model.Environment;
  inheritingEnvironmentIds: Set<string>;
  environmentIdsSet: Set<string>;
}) => {
  const {
    state,
    baseEnvironment,
    inheritingEnvironmentIds,
    environmentIdsSet,
  } = params;

  let inheritingKeyableParents: Model.KeyableParent[] = [];

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

    let allInheritingEnvironmentIds = [
      inheritingEnvironmentId,
      ...getConnectedEnvironments(state.graph, inheritingEnvironmentId).map(
        R.prop("id")
      ),
    ];

    for (let id of allInheritingEnvironmentIds) {
      inheritingKeyableParents = inheritingKeyableParents.concat(
        getLocalKeysByEnvironmentId(state.graph)[id] ?? []
      );
      inheritingKeyableParents = inheritingKeyableParents.concat(
        getServersByEnvironmentId(state.graph)[id] ?? []
      );
    }
  }

  return inheritingKeyableParents;
};

const addUserInheritanceOverrides = (params: {
  state: Client.State;
  currentUserId: string;
  baseEnvironment: Model.Environment;
  inheritingEnvironmentIds: Set<string>;
  environmentIdsSet: Set<string>;
  envParentId: string;
  newKeysOnly?: boolean;
  environmentKeysByComposite: Record<string, string>;
  toEncrypt: ToEncrypt;
  privkey: Crypto.Privkey;
  allUserIds: string[];
  pending?: true;
  now: number;
}): Record<string, string> => {
  const {
    state,
    currentUserId,
    baseEnvironment,
    inheritingEnvironmentIds,
    environmentIdsSet,
    envParentId,
    newKeysOnly,
    environmentKeysByComposite,
    toEncrypt,
    privkey,
    allUserIds,
    pending,
    now,
  } = params;

  const org = getOrg(state.graph);

  const nonEmptyInheritingEnvironmentIds = new Set(
    getInheritingEnvironmentIds(
      state,
      {
        envParentId,
        environmentId: baseEnvironment.id,
      },
      pending
    )
  );

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
      currentUserId
    );

    if (!currentUserBasePermissions.has("read")) {
      continue;
    }

    const isEmpty = !nonEmptyInheritingEnvironmentIds.has(
      inheritingEnvironmentId
    );

    const composite = getUserEncryptedKeyOrBlobComposite({
      environmentId: inheritingEnvironmentId,
      inheritsEnvironmentId: baseEnvironment.id,
    });
    const existing = state.envs[composite]?.key;

    if (
      !(newKeysOnly && existing) &&
      (!org.optimizeEmptyEnvs || !isEmpty || existing)
    ) {
      let inheritanceOverridesKey = symmetricEncryptionKey();
      environmentKeysByComposite[composite] = inheritanceOverridesKey;
    }

    const key = environmentKeysByComposite[composite];

    if (key) {
      for (let userId of allUserIds) {
        const targetUserInheritingPermissions = getEnvironmentPermissions(
          state.graph,
          inheritingEnvironmentId,
          userId
        );
        if (!targetUserInheritingPermissions.has("read")) {
          continue;
        }

        const deviceIds = getDeviceIdsForUser(state.graph, userId, now);
        const pubkeysByDeviceId = getPubkeysByDeviceIdForUser(
          state.graph,
          userId,
          now
        );

        for (let deviceId of deviceIds) {
          const pubkey = pubkeysByDeviceId[deviceId];
          if (!pubkey) {
            continue;
          }

          toEncrypt.push([
            [
              "users",
              userId,
              deviceId,
              envParentId,
              "environments",
              inheritingEnvironmentId,
              "inheritanceOverrides",
              baseEnvironment.id,
            ],
            {
              data: key,
              pubkey,
              privkey,
            },
          ]);
        }
      }
    }
  }

  return environmentKeysByComposite;
};

const addKeyableParentInheritanceOverrides = (params: {
  state: Client.State;
  currentUserId: string;
  baseEnvironment: Model.Environment;
  inheritingKeyableParents: Model.KeyableParent[];
  envParent: Model.EnvParent;
  toVerifyKeyableIds: Set<string>;
  newKeysOnly?: boolean;
  environmentKeysByComposite: Record<string, string>;
  toEncrypt: ToEncrypt;
  privkey: Crypto.Privkey;
  addInheritingSubEnvironments: boolean;
  pending?: true;
}) => {
  const {
    state,
    currentUserId,
    baseEnvironment,
    inheritingKeyableParents,
    envParent,
    toVerifyKeyableIds,
    newKeysOnly,
    environmentKeysByComposite,
    toEncrypt,
    privkey,
    addInheritingSubEnvironments,
    pending,
  } = params;

  const org = getOrg(state.graph);

  const nonEmptyInheritingEnvironmentIds = new Set(
    getInheritingEnvironmentIds(
      state,
      {
        envParentId: baseEnvironment.envParentId,
        environmentId: baseEnvironment.id,
      },
      pending
    )
  );

  for (let inheritingKeyableParent of inheritingKeyableParents) {
    const generatedEnvkey = getActiveGeneratedEnvkeysByKeyableParentId(
        state.graph
      )[inheritingKeyableParent.id],
      inheritingKeyableParentEnvironment = state.graph[
        inheritingKeyableParent.environmentId
      ] as Model.Environment;

    if (!generatedEnvkey) {
      continue;
    }

    const currentUserBasePermissions = getEnvironmentPermissions(
      state.graph,
      baseEnvironment.id,
      currentUserId
    );

    if (!currentUserBasePermissions.has("read")) {
      continue;
    }

    const basePath = [
      envParent.type == "block" ? "blockKeyableParents" : "keyableParents",
      envParent.type == "block" ? envParent.id : null,
      inheritingKeyableParent.id,
      generatedEnvkey.id,
    ].filter(Boolean) as string[];

    let inheritingEnvironmentId: string;
    if (envParent.type == "block") {
      const blockEnvironment = getConnectedBlockEnvironmentsForApp(
        state.graph,
        inheritingKeyableParentEnvironment.envParentId,
        envParent.id,
        inheritingKeyableParentEnvironment.id
      )[0];
      inheritingEnvironmentId = blockEnvironment.id;
    } else {
      inheritingEnvironmentId = inheritingKeyableParentEnvironment.id;
    }
    const inheritingEnvironment = state.graph[
      inheritingEnvironmentId
    ] as Model.Environment;

    if (
      (addInheritingSubEnvironments && !inheritingEnvironment.isSub) ||
      (!addInheritingSubEnvironments && inheritingEnvironment.isSub)
    ) {
      continue;
    }

    const isEmpty = !nonEmptyInheritingEnvironmentIds.has(
      inheritingEnvironmentId
    );

    toVerifyKeyableIds.add(inheritingKeyableParent.id);

    const composite = getUserEncryptedKeyOrBlobComposite({
      environmentId: inheritingEnvironmentId,
      inheritsEnvironmentId: baseEnvironment.id,
    });

    const existing = state.envs[composite]?.key;

    if (
      !(newKeysOnly && existing) &&
      (!org.optimizeEmptyEnvs || !isEmpty || existing)
    ) {
      const key =
        environmentKeysByComposite[composite] ?? symmetricEncryptionKey();

      environmentKeysByComposite[composite] = key;

      toEncrypt.push([
        [...basePath, "inheritanceOverrides", baseEnvironment.id, "data"],
        {
          data: key,
          pubkey: generatedEnvkey.pubkey,
          privkey,
        },
      ]);
    }
  }
};

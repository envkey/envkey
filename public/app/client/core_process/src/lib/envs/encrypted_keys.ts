import * as R from "ramda";
import { Client, Api, Model, Crypto, Rbac } from "@core/types";
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
} from "@core/lib/graph";
import { getUserEncryptedKeyOrBlobComposite } from "@core/lib/blob";
import { encrypt } from "@core/lib/crypto/proxy";
import { secureRandomAlphanumeric } from "@core/lib/crypto/utils";
import { verifyOrgKeyable } from "../trust";
import {
  getAuth,
  getInheritanceOverrides,
  ensureEnvsFetched,
  ensureChangesetsFetched,
  getInheritingEnvironmentIds,
} from "@core/lib/client";
import set from "lodash.set";
import { log } from "@core/lib/utils/logger";

export const encryptedKeyParamsForEnvironments = async (params: {
  state: Client.State;
  environmentIds: string[];
  pending?: true;
  newKeysOnly?: boolean; // will only generate keys if they aren't set yet in state for a given path
  reencryptChangesets?: boolean;
  context: Client.Context;
}): Promise<{
  environmentKeysByComposite: Record<string, string>;
  changesetKeysByEnvironmentId: Record<string, string>;
  keys: Api.Net.EnvParams["keys"];
}> => {
  const {
    state,
    environmentIds,
    pending,
    newKeysOnly,
    reencryptChangesets,
    context,
  } = params;

  const now = Date.now(),
    currentAuth = getAuth(state, context.accountIdOrCliKey);
  if (!currentAuth || !currentAuth.privkey) {
    throw new Error("Authentication and decrypted privkey required");
  }
  const privkey = currentAuth.privkey;

  const environmentKeysByComposite: Record<string, string> = {};
  const changesetKeysByEnvironmentId: Record<string, string> = {};
  const inheritanceOverridesByEnvironmentId: {
    [inheritingEnvironmentId: string]: {
      [inheritsEnvironmentId: string]: Client.Env.KeyableEnv;
    };
  } = {};
  const inheritingEnvironmentIdsByEnvironmentId: Record<
    string,
    Set<string>
  > = {};

  let keys: Api.Net.EnvParams["keys"] = {};

  const toVerifyKeyableIds = new Set<string>(),
    toEncrypt: [string[], Parameters<typeof encrypt>[0]][] = [],
    allUserIds = [
      ...graphTypes(state.graph).orgUsers.map(R.prop("id")),
      ...graphTypes(state.graph).cliUsers.map(R.prop("id")),
    ];

  for (let environmentId of environmentIds) {
    const environment = state.graph[environmentId] as
      | Model.Environment
      | undefined;
    if (environment && !environment.isSub) {
      const inheritingEnvironmentIds = getInheritingEnvironmentIds(
        state,
        {
          envParentId: environment.envParentId,
          environmentId,
        },
        pending
      );
      inheritingEnvironmentIdsByEnvironmentId[environment.id] =
        inheritingEnvironmentIds;

      for (let inheritingEnvironmentId of inheritingEnvironmentIds) {
        const composite = getUserEncryptedKeyOrBlobComposite({
          environmentId: inheritingEnvironmentId,
          inheritsEnvironmentId: environment.id,
        });
        const existing = state.envs[composite];

        const overridesByEnvironmentId = getInheritanceOverrides(
          state,
          {
            envParentId: environment.envParentId,
            environmentId: inheritingEnvironmentId,
            forInheritsEnvironmentId: environmentId,
          },
          pending
        );

        if (overridesByEnvironmentId[environmentId]) {
          inheritanceOverridesByEnvironmentId[inheritingEnvironmentId] = {
            ...(inheritanceOverridesByEnvironmentId[inheritingEnvironmentId] ??
              {}),
            ...overridesByEnvironmentId,
          };

          if (!(newKeysOnly && existing)) {
            const inheritanceOverridesKey = getNewSymmetricEncryptionKey();
            environmentKeysByComposite[composite] = inheritanceOverridesKey;
          }
        }
      }
    }
  }

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

    if (!(newKeysOnly && existingEnvSymmetricKey)) {
      envSymmetricKey =
        environmentKeysByComposite[envComposite] ?? // in case it's already been set via a sub-environment
        getNewSymmetricEncryptionKey();
      environmentKeysByComposite[envComposite] = envSymmetricKey;
    }

    if (!(newKeysOnly && existingMetaSymmetricKey)) {
      metaSymmetricKey = getNewSymmetricEncryptionKey();
      environmentKeysByComposite[metaComposite] = metaSymmetricKey;
    }

    if (!localsUserId) {
      if (!(newKeysOnly && existingInheritsSymmetricKey)) {
        inheritsSymmetricKey = getNewSymmetricEncryptionKey();
        environmentKeysByComposite[inheritsComposite] = inheritsSymmetricKey;
      }
    }

    if (environment?.isSub) {
      parentEnvComposite = getUserEncryptedKeyOrBlobComposite({
        environmentId: environment.parentEnvironmentId,
      });
      const existingParentSymmetricKey = state.envs[parentEnvComposite]?.key;

      if (!(newKeysOnly && existingParentSymmetricKey)) {
        parentEnvSymmetricKey =
          environmentKeysByComposite[parentEnvComposite] ?? // in case it's already been set via parent environment
          getNewSymmetricEncryptionKey();
        environmentKeysByComposite[parentEnvComposite] = parentEnvSymmetricKey;
      }
    }

    let changesetsToReencrypt: Client.Env.Changeset[] | undefined;
    if (pending && !reencryptChangesets) {
      changesetsSymmetricKey =
        state.changesets[environmentId]?.key ?? getNewSymmetricEncryptionKey();
    } else if (reencryptChangesets) {
      ensureChangesetsFetched(state, envParentId);

      changesetsToReencrypt = state.changesets[environmentId]?.changesets;
      if (changesetsToReencrypt) {
        changesetsSymmetricKey = getNewSymmetricEncryptionKey();
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
          (userId == localsUserId &&
            targetUserEnvParentPermissions.has("app_read_own_locals")) ||
          (envParent.type == "block" &&
            targetUserOrgPermissions.has("blocks_read_all")) ||
          targetUserEnvParentPermissions.has("app_read_user_locals")
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
              (userId == localsUserId &&
                targetUserEnvParentPermissions.has("app_read_own_locals")) ||
              (envParent.type == "block" &&
                targetUserOrgPermissions.has("blocks_read_all")) ||
              targetUserEnvParentPermissions.has("app_read_user_locals_history")
            ) {
              if (pending && !reencryptChangesets && changesetsSymmetricKey) {
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
            if (pending && !reencryptChangesets && changesetsSymmetricKey) {
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

          if (environment && !environment.isSub) {
            const inheritingEnvironmentIds =
              inheritingEnvironmentIdsByEnvironmentId[environment.id];
            for (let inheritingEnvironmentId of inheritingEnvironmentIds) {
              const targetUserInheritingPermissions = getEnvironmentPermissions(
                state.graph,
                inheritingEnvironmentId,
                userId
              );
              if (!targetUserInheritingPermissions.has("read")) {
                continue;
              }

              const composite = getUserEncryptedKeyOrBlobComposite({
                environmentId: inheritingEnvironmentId,
                inheritsEnvironmentId: environmentId,
              });
              const key = environmentKeysByComposite[composite];

              if (key) {
                toEncrypt.push([
                  [
                    "users",
                    userId,
                    deviceId,
                    envParentId,
                    "environments",
                    inheritingEnvironmentId,
                    "inheritanceOverrides",
                    environmentId,
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

      // const environmentRole = state.graph[
      //   environment.environmentRoleId
      // ] as Rbac.EnvironmentRole;
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

    if (environment && !environment.isSub) {
      let inheritingKeyableParents: Model.KeyableParent[] = [];
      const inheritingEnvironmentIds =
        inheritingEnvironmentIdsByEnvironmentId[environment.id];

      for (let inheritingEnvironmentId of inheritingEnvironmentIds) {
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

        let inheritanceOverrides =
          inheritanceOverridesByEnvironmentId[inheritingEnvironmentId] ?? {};

        // for sub-environment, also include parent environment overrides
        if (inheritingEnvironment.isSub) {
          inheritanceOverrides = R.mergeDeepRight(
            inheritanceOverridesByEnvironmentId[
              inheritingEnvironment.parentEnvironmentId
            ] ?? {},
            inheritanceOverrides
          ) as typeof inheritanceOverrides;
        }

        if (!R.isEmpty(inheritanceOverrides)) {
          toVerifyKeyableIds.add(inheritingKeyableParent.id);

          for (let inheritanceOverridesEnvironmentId in inheritanceOverrides) {
            const composite = getUserEncryptedKeyOrBlobComposite({
              environmentId: inheritingEnvironmentId,
              inheritsEnvironmentId: inheritanceOverridesEnvironmentId,
            });

            const existing = state.envs[composite]?.key;

            if (!(newKeysOnly && existing)) {
              const key =
                environmentKeysByComposite[composite] ??
                getNewSymmetricEncryptionKey();
              environmentKeysByComposite[composite] = key;
              toEncrypt.push([
                [
                  ...basePath,
                  "inheritanceOverrides",
                  inheritanceOverridesEnvironmentId,
                  "data",
                ],
                {
                  data: key,
                  pubkey: generatedEnvkey.pubkey,
                  privkey,
                },
              ]);
            }
          }
        }
      }
    }
  }

  // verify all keyables
  await Promise.all(
    Array.from(toVerifyKeyableIds).map((keyableId) =>
      verifyOrgKeyable(state, keyableId, context)
    )
  );

  const cryptoPromises = toEncrypt.map(([path, params]) =>
      encrypt(params).then((encrypted) => [path, encrypted])
    ) as Promise<[string[], Crypto.EncryptedData]>[],
    pathResults = await Promise.all(cryptoPromises);

  for (let [path, data] of pathResults) {
    set(keys, path, data);
  }

  return {
    environmentKeysByComposite,
    changesetKeysByEnvironmentId,
    keys,
  };
};

const getNewSymmetricEncryptionKey = () => secureRandomAlphanumeric(26);

import produce, { Draft } from "immer";
import * as R from "ramda";
import { Client, Api, Model, Blob, Crypto, Graph, Rbac } from "@core/types";
import {
  getCurrentEncryptedKeys,
  getConnectedBlockEnvironmentsForApp,
  getEnvironmentName,
  getEnvironmentsByEnvParentId,
} from "@core/lib/graph";
import {
  keySetDifference,
  getUserEncryptedKeyOrBlobComposite,
  parseUserEncryptedKeyOrBlobComposite,
} from "@core/lib/blob";
import { encrypt, signJson } from "@core/lib/crypto/proxy";
import { verifyOrgKeyable } from "../trust";
import { getTrustChain, getAuth } from "@core/lib/client";
import set from "lodash.set";
import { log } from "@core/lib/utils/logger";

export const keySetForGraphProposal = (
    graph: Client.Graph.UserGraph,
    now: number,
    producer: (
      graphDraft: Draft<Client.Graph.UserGraph>
    ) => void | Client.Graph.UserGraph,
    scope: Rbac.OrgAccessScope = "all"
  ): Blob.KeySet => {
    // log("keySetForGraphProposal", { scope });
    // const start = Date.now();

    const currentKeys = getCurrentEncryptedKeys(graph, scope, now, true);

    // log("currentKeys " + (Date.now() - start).toString());

    const proposedGraph = produce(graph, producer);

    // log("proposedGraph " + (Date.now() - start).toString());

    const proposedKeys = getCurrentEncryptedKeys(
      proposedGraph,
      scope,
      now,
      true
    );

    // log("proposedKeys " + (Date.now() - start).toString());

    const diff = keySetDifference(proposedKeys, currentKeys);

    // log("got diff " + (Date.now() - start).toString());

    // log("keySetForGraphProposal finished " + (Date.now() - start).toString());

    return diff;
  },
  requiredEnvsForKeySet = (
    graph: Client.Graph.UserGraph,
    toSet: Blob.KeySet
  ) => {
    const requiredEnvs = new Set<string>(),
      requiredChangesets = new Set<string>();

    if (toSet.users) {
      for (let userId in toSet.users) {
        for (let deviceId in toSet.users[userId]) {
          const deviceToSet = toSet.users[userId][deviceId];
          for (let envParentId in deviceToSet) {
            const { environments, locals } = deviceToSet[envParentId];

            if (environments) {
              for (let environmentId in environments) {
                const environmentToSet = environments[environmentId];
                if (
                  environmentToSet.env ||
                  environmentToSet.meta ||
                  environmentToSet.inherits
                ) {
                  requiredEnvs.add(envParentId);
                }
                if (environmentToSet.changesets) {
                  requiredChangesets.add(envParentId);
                }
              }
            }

            if (locals) {
              requiredEnvs.add(envParentId);
            }
          }
        }
      }
    }

    if (toSet.blockKeyableParents) {
      for (let blockId in toSet.blockKeyableParents) {
        requiredEnvs.add(blockId);
      }
    }

    if (toSet.keyableParents) {
      for (let keyableParentId in toSet.keyableParents) {
        const keyableParent = graph[keyableParentId] as Model.KeyableParent;
        requiredEnvs.add(keyableParent.appId);
      }
    }

    return {
      requiredEnvs,
      requiredChangesets,
    };
  },
  encryptedKeyParamsForKeySet = async (params: {
    state: Client.State;
    context: Client.Context;
    toSet: Blob.KeySet;
  }) => {
    let state = params.state;

    const { context, toSet } = params,
      currentAuth = getAuth(state, context.accountIdOrCliKey);
    if (!currentAuth || !currentAuth.privkey) {
      throw new Error("Action requires authentication and decrypted privkey");
    }

    const privkey = currentAuth.privkey,
      toVerifyKeyableIds = new Set<string>(),
      toEncryptKeys: [string[], Parameters<typeof encrypt>[0]][] = [];

    let keys = {} as Api.Net.EnvParams["keys"];

    if (toSet.keyableParents) {
      for (let keyableParentId in toSet.keyableParents) {
        toVerifyKeyableIds.add(keyableParentId);

        const keyableParent = state.graph[
            keyableParentId
          ] as Model.KeyableParent,
          environment = state.graph[
            keyableParent.environmentId
          ] as Model.Environment;

        const generatedEnvkeyId = Object.keys(
            toSet.keyableParents[keyableParentId]
          )[0],
          generatedEnvkey = state.graph[
            generatedEnvkeyId
          ] as Model.GeneratedEnvkey,
          envkeyToSet =
            toSet.keyableParents[keyableParentId][generatedEnvkeyId];

        if (envkeyToSet.env) {
          const composite = getUserEncryptedKeyOrBlobComposite({
            environmentId: environment.isSub
              ? environment.parentEnvironmentId
              : environment.id,
          });
          const key = state.envs[composite]?.key;

          if (key) {
            toEncryptKeys.push([
              [
                "keyableParents",
                keyableParent.id,
                generatedEnvkey.id,
                "env",
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

        if (envkeyToSet.subEnv) {
          const key =
            state.envs[
              getUserEncryptedKeyOrBlobComposite({
                environmentId: environment.id,
              })
            ]?.key;
          if (key) {
            toEncryptKeys.push([
              [
                "keyableParents",
                keyableParent.id,
                generatedEnvkey.id,
                "subEnv",
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

        if (envkeyToSet.localOverrides && keyableParent.type == "localKey") {
          const key =
            state.envs[
              getUserEncryptedKeyOrBlobComposite({
                environmentId: keyableParent.appId + "|" + keyableParent.userId,
              })
            ]?.key;

          if (key) {
            toEncryptKeys.push([
              [
                "keyableParents",
                keyableParent.id,
                generatedEnvkey.id,
                "localOverrides",
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

        // inheritance overrides
        if (envkeyToSet.inheritanceOverrides) {
          for (let inheritanceOverridesEnvironmentId of envkeyToSet.inheritanceOverrides) {
            const composite = getUserEncryptedKeyOrBlobComposite({
              environmentId: keyableParent.environmentId,
              inheritsEnvironmentId: inheritanceOverridesEnvironmentId,
            });

            let key = state.envs[composite]?.key;

            if (!key) {
              log("missing state.envs[composite]?.key", {
                composite,
                environmentId: environment.id,
                environment: getEnvironmentName(state.graph, environment.id),
                envParentId: environment.envParentId,
                envParent: (
                  state.graph[environment.envParentId] as Model.EnvParent
                ).name,
                inheritanceOverridesEnvironmentId,
                inheritanceOverridesEnvironment: getEnvironmentName(
                  state.graph,
                  inheritanceOverridesEnvironmentId
                ),
                "envkeyToSet.inheritanceOverrides":
                  envkeyToSet.inheritanceOverrides,
              });

              throw new Error("Missing symmetric key for blob");
            }

            toEncryptKeys.push([
              [
                "keyableParents",
                keyableParent.id,
                generatedEnvkey.id,
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

    if (toSet.blockKeyableParents) {
      for (let blockId in toSet.blockKeyableParents) {
        for (let keyableParentId in toSet.blockKeyableParents[blockId]) {
          toVerifyKeyableIds.add(keyableParentId);

          const keyableParent = state.graph[
              keyableParentId
            ] as Model.KeyableParent,
            appEnvironment = state.graph[
              keyableParent.environmentId
            ] as Model.Environment,
            blockEnvironment = getConnectedBlockEnvironmentsForApp(
              state.graph,
              keyableParent.appId,
              blockId,
              appEnvironment.id
            )[0];

          const generatedEnvkeyId = Object.keys(
              toSet.blockKeyableParents[blockId][keyableParentId]
            )[0],
            generatedEnvkey = state.graph[
              generatedEnvkeyId
            ] as Model.GeneratedEnvkey,
            envkeyToSet =
              toSet.blockKeyableParents[blockId][keyableParentId][
                generatedEnvkeyId
              ];

          if (envkeyToSet.env) {
            const key =
              state.envs[
                getUserEncryptedKeyOrBlobComposite({
                  environmentId: blockEnvironment.isSub
                    ? blockEnvironment.parentEnvironmentId
                    : blockEnvironment.id,
                })
              ]?.key;

            if (key) {
              toEncryptKeys.push([
                [
                  "blockKeyableParents",
                  blockId,
                  keyableParent.id,
                  generatedEnvkey.id,
                  "env",
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

          if (envkeyToSet.subEnv && blockEnvironment.isSub) {
            const key =
              state.envs[
                getUserEncryptedKeyOrBlobComposite({
                  environmentId: blockEnvironment.id,
                })
              ]?.key;
            if (key) {
              toEncryptKeys.push([
                [
                  "blockKeyableParents",
                  blockId,
                  keyableParent.id,
                  generatedEnvkey.id,
                  "subEnv",
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

          if (envkeyToSet.localOverrides && keyableParent.type == "localKey") {
            const key =
              state.envs[
                getUserEncryptedKeyOrBlobComposite({
                  environmentId: blockId + "|" + keyableParent.userId,
                })
              ]?.key;

            if (key) {
              toEncryptKeys.push([
                [
                  "blockKeyableParents",
                  blockId,
                  keyableParent.id,
                  generatedEnvkey.id,
                  "localOverrides",
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

          // inheritance overrides
          if (envkeyToSet.inheritanceOverrides) {
            for (let inheritanceOverridesEnvironmentId of envkeyToSet.inheritanceOverrides) {
              const composite = getUserEncryptedKeyOrBlobComposite({
                environmentId: blockEnvironment.id,
                inheritsEnvironmentId: inheritanceOverridesEnvironmentId,
              });

              let key = state.envs[composite]?.key;

              if (!key) {
                log("missing state.envs[composite]?.key", {
                  composite,
                  environmentId: blockEnvironment.id,
                  environment: getEnvironmentName(
                    state.graph,
                    blockEnvironment.id
                  ),
                  envParentId: blockEnvironment.envParentId,
                  envParent: (
                    state.graph[blockEnvironment.envParentId] as Model.EnvParent
                  ).name,
                  inheritanceOverridesEnvironmentId,
                  inheritanceOverridesEnvironment: getEnvironmentName(
                    state.graph,
                    inheritanceOverridesEnvironmentId
                  ),
                });

                throw new Error("Missing symmetric key for blob");
              }

              toEncryptKeys.push([
                [
                  "blockKeyableParents",
                  blockId,
                  keyableParent.id,
                  generatedEnvkey.id,
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

    if (toSet.users) {
      for (let userId in toSet.users) {
        const user = state.graph[userId] as Model.OrgUser | Model.CliUser;
        if (user.type == "cliUser") {
          toVerifyKeyableIds.add(userId);
        }

        for (let deviceId in toSet.users[userId]) {
          let pubkey: Crypto.Pubkey;

          if (deviceId == "cli" && user.type == "cliUser") {
            pubkey = user.pubkey;
          } else {
            pubkey = (
              state.graph[deviceId] as
                | Model.OrgUserDevice
                | Model.Invite
                | Model.DeviceGrant
            ).pubkey!;
            toVerifyKeyableIds.add(deviceId);
          }

          const deviceToSet = toSet.users[userId][deviceId];

          for (let envParentId in deviceToSet) {
            const { environments, locals } = deviceToSet[envParentId];

            if (environments) {
              for (let environmentId in environments) {
                const environmentToSet = environments[environmentId];

                if (environmentToSet.env) {
                  const key =
                    state.envs[
                      getUserEncryptedKeyOrBlobComposite({ environmentId })
                    ]?.key;
                  if (key) {
                    toEncryptKeys.push([
                      [
                        "users",
                        userId,
                        deviceId,
                        envParentId,
                        "environments",
                        environmentId,
                        "env",
                      ],
                      {
                        data: key,
                        pubkey,
                        privkey,
                      },
                    ]);
                  }
                }
                if (environmentToSet.meta) {
                  const key =
                    state.envs[
                      getUserEncryptedKeyOrBlobComposite({
                        environmentId,
                        envPart: "meta",
                      })
                    ]?.key;
                  if (key) {
                    toEncryptKeys.push([
                      [
                        "users",
                        userId,
                        deviceId,
                        envParentId,
                        "environments",
                        environmentId,
                        "meta",
                      ],
                      {
                        data: key,
                        pubkey,
                        privkey,
                      },
                    ]);
                  }
                }
                if (environmentToSet.inherits) {
                  const key =
                    state.envs[
                      getUserEncryptedKeyOrBlobComposite({
                        environmentId,
                        envPart: "inherits",
                      })
                    ]?.key;

                  if (key) {
                    toEncryptKeys.push([
                      [
                        "users",
                        userId,
                        deviceId,
                        envParentId,
                        "environments",
                        environmentId,
                        "inherits",
                      ],
                      {
                        data: key,
                        pubkey,
                        privkey,
                      },
                    ]);
                  }
                }

                if (environmentToSet.changesets) {
                  const { key } = state.changesets[environmentId] ?? {};

                  if (key) {
                    const path = [
                      "users",
                      userId,
                      deviceId,
                      envParentId,
                      "environments",
                      environmentId,
                      "changesets",
                    ];

                    toEncryptKeys.push([
                      path,
                      {
                        data: key,
                        pubkey,
                        privkey,
                      },
                    ]);
                  }
                }

                // inheritance overrides
                if (environmentToSet.inheritanceOverrides) {
                  for (let inheritsEnvironmentId of environmentToSet.inheritanceOverrides) {
                    const composite = getUserEncryptedKeyOrBlobComposite({
                      environmentId,
                      inheritsEnvironmentId,
                    });

                    const key = state.envs[composite]?.key;

                    if (!key) {
                      log("missing state.envs[composite]?.key", {
                        composite,
                        environmentId: environmentId,
                        environment: getEnvironmentName(
                          state.graph,
                          environmentId
                        ),
                        envParentId,
                        envParent: (state.graph[envParentId] as Model.EnvParent)
                          .name,
                        inheritsEnvironmentId,
                        inheritsEnvironment: getEnvironmentName(
                          state.graph,
                          inheritsEnvironmentId
                        ),
                      });

                      throw new Error("Missing symmetric key for blob");
                    }

                    toEncryptKeys.push([
                      [
                        "users",
                        userId,
                        deviceId,
                        envParentId,
                        "environments",
                        environmentId,
                        "inheritanceOverrides",
                        inheritsEnvironmentId!,
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

            if (locals) {
              for (let localsUserId in locals) {
                const environmentId = envParentId + "|" + localsUserId;

                const localsToSet = locals[localsUserId];
                if (localsToSet.env) {
                  const key =
                    state.envs[
                      getUserEncryptedKeyOrBlobComposite({
                        environmentId,
                      })
                    ]?.key;

                  if (key) {
                    toEncryptKeys.push([
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
                        data: key,
                        pubkey,
                        privkey,
                      },
                    ]);
                  }
                }

                if (localsToSet.meta) {
                  const key =
                    state.envs[
                      getUserEncryptedKeyOrBlobComposite({
                        environmentId,
                        envPart: "meta",
                      })
                    ]?.key;

                  if (key) {
                    toEncryptKeys.push([
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
                        data: key,
                        pubkey,
                        privkey,
                      },
                    ]);
                  }
                }

                if (localsToSet.changesets) {
                  const { key } =
                    state.changesets[envParentId + "|" + localsUserId] ?? {};

                  if (key) {
                    const path = [
                      "users",
                      userId,
                      deviceId,
                      envParentId,
                      "locals",
                      localsUserId,
                      "changesets",
                    ];

                    toEncryptKeys.push([
                      path,
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
      }
    }

    // verify all keyables
    await Promise.all(
      Array.from(toVerifyKeyableIds).map((keyableId) =>
        verifyOrgKeyable(state, keyableId, context)
      )
    );

    const keyPromises = toEncryptKeys.map(([path, params]) =>
        encrypt(params).then((encrypted) => [path, encrypted])
      ) as Promise<[string[], Crypto.EncryptedData]>[],
      keyPathResults = await Promise.all(keyPromises);

    for (let [path, data] of keyPathResults) {
      set(keys, path, data);
    }

    let encryptedByTrustChain: string | undefined;
    const hasKeyables =
      Object.keys(toSet.keyableParents ?? {}).length +
        Object.keys(toSet.blockKeyableParents ?? {}).length >
      0;
    if (hasKeyables) {
      const trustChain = getTrustChain(state, context.accountIdOrCliKey);
      encryptedByTrustChain = await signJson({
        data: trustChain,
        privkey,
      });
    }

    return {
      keys,
      blobs: {},
      encryptedByTrustChain: encryptedByTrustChain
        ? { data: encryptedByTrustChain }
        : undefined,
    } as Api.Net.EnvParams;
  };

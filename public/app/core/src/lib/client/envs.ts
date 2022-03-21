import { pick } from "../utils/pick";
import memoize from "../utils/memoize";
import { Client, Model, Rbac } from "../../types";
import { getEnvWithMetaForActions } from "./versions";
import * as R from "ramda";
import { getUserEncryptedKeyOrBlobComposite } from "../blob";
import {
  getEnvironmentsByEnvParentId,
  getConnectedBlockEnvironmentsForApp,
  getConnectedBlocksForApp,
  getEnvironmentOrLocalsAutoCommitEnabled,
  authz,
  getEnvironmentName,
} from "../graph";
import { groupBy } from "../utils/array";

export const getEnvWithMeta = memoize(
    (
      state: Client.State,
      params: {
        envParentId: string;
        environmentId: string;
      },
      pending?: true,
      memoBuster?: number
    ) => {
      const { environmentId } = params;

      let envWithMeta: Client.Env.EnvWithMeta | undefined;

      const envComposite = getUserEncryptedKeyOrBlobComposite({
        environmentId,
      });
      const metaComposite = getUserEncryptedKeyOrBlobComposite({
        environmentId,
        envPart: "meta",
      });
      const inheritsComposite = getUserEncryptedKeyOrBlobComposite({
        environmentId,
        envPart: "inherits",
      });

      if (
        state.envs[envComposite] ||
        state.envs[metaComposite] ||
        state.envs[inheritsComposite]
      ) {
        envWithMeta = {
          ...R.mergeDeepRight(
            state.envs[envComposite]
              ? { variables: state.envs[envComposite].env }
              : { variables: {} },
            state.envs[metaComposite]
              ? state.envs[metaComposite].env
              : { variables: {} }
          ),

          ...(state.envs[inheritsComposite]
            ? state.envs[inheritsComposite].env
            : { inherits: {} }),
        } as Client.Env.EnvWithMeta;
      }

      if (!envWithMeta) {
        envWithMeta = {
          inherits: {},
          variables: {},
        };
      }

      if (pending) {
        const pendingActions = getPendingActions(state, params);

        if (pendingActions.length == 0) {
          return envWithMeta;
        }

        return getEnvWithMetaForActions(pendingActions, envWithMeta);
      } else {
        return envWithMeta;
      }
    }
  ),
  getPendingEnvWithMeta = (
    state: Client.State,
    params: {
      envParentId: string;
      environmentId: string;
    },
    memoBuster?: number
  ) => getEnvWithMeta(state, params, true, memoBuster),
  getPendingActions = (
    state: Client.State,
    params: {
      envParentId: string;
      environmentId: string;
    }
  ) =>
    state.pendingEnvUpdates.filter(
      ({ meta }) =>
        params.envParentId == meta.envParentId &&
        meta.environmentId == params.environmentId
    ),
  getEnvMetaOnly = (
    state: Client.State,
    params: {
      envParentId: string;
      environmentId: string;
    },
    pending?: true
  ) =>
    R.evolve(
      {
        variables: R.mapObjIndexed(
          pick<Client.Env.EnvWithMetaCell>([
            "inheritsEnvironmentId",
            "isEmpty",
            "isUndefined",
          ])
        ),
      },
      (pending ? getPendingEnvWithMeta : getEnvWithMeta)(state, params)
    ) as Client.Env.EnvMetaOnly,
  getPendingEnvMeta = memoize(
    (
      state: Client.State,
      params: {
        envParentId: string;
        environmentId: string;
      }
    ) => getEnvMetaOnly(state, params, true)
  ),
  getEnvInherits = (
    state: Client.State,
    params: {
      envParentId: string;
      environmentId: string;
    },
    pending?: true
  ) =>
    pick(
      ["inherits"],
      (pending ? getPendingEnvWithMeta : getEnvWithMeta)(state, params)
    ) as Client.Env.EnvInheritsState,
  getPendingInherits = memoize(
    (
      state: Client.State,
      params: {
        envParentId: string;
        environmentId: string;
      }
    ) => getEnvInherits(state, params, true)
  ),
  getPendingEnvironmentIds = memoize((state: Client.State) =>
    R.uniq(state.pendingEnvUpdates.map(({ meta }) => meta.environmentId))
  ),
  getPendingActionsByEnvironmentId = memoize((state: Client.State) =>
    groupBy((action) => action.meta.environmentId, state.pendingEnvUpdates)
  ),
  getEarliestEnvUpdatePendingAt = (
    state: Client.State,
    envParentOrEnvironmentId?: string
  ) => {
    let earliest: number | undefined;

    const pending = envParentOrEnvironmentId
      ? state.pendingEnvUpdates.filter(
          ({ meta }) =>
            meta.envParentId == envParentOrEnvironmentId ||
            meta.environmentId == envParentOrEnvironmentId
        )
      : state.pendingEnvUpdates;

    for (let {
      meta: { pendingAt },
    } of pending) {
      if (!earliest || pendingAt < earliest) {
        earliest = pendingAt;
      }
    }

    return earliest;
  },
  getKeyableEnv = (
    state: Client.State,
    params: {
      envParentId: string;
      environmentId: string;
    },
    pending?: true
  ) =>
    (pending ? getPendingEnvWithMeta : getEnvWithMeta)(state, params).variables,
  getRawEnv = memoize(
    (
      state: Client.State,
      params: {
        envParentId: string;
        environmentId: string;
      },
      pending?: true
    ) => {
      const res: Client.Env.RawEnv = {},
        keyableEnv = getKeyableEnv(state, params, pending),
        environment = state.graph[params.environmentId] as
          | Model.Environment
          | undefined;

      if (environment) {
        const inheritanceOverrides = getInheritanceOverrides(
          state,
          params,
          pending
        );
        for (let k in keyableEnv) {
          const { val, inheritsEnvironmentId } = keyableEnv[k];
          if (inheritsEnvironmentId) {
            let inherited: Client.Env.KeyableEnvVal = {
              inheritsEnvironmentId,
            };
            while (inherited && inherited.inheritsEnvironmentId) {
              inherited = (inheritanceOverrides[
                inherited.inheritsEnvironmentId
              ] ?? {})[k];
            }
            if (inherited && typeof inherited.val !== "undefined") {
              res[k] = inherited.val;
            }
          } else if (typeof val !== "undefined") {
            res[k] = val;
          }
        }
      } else {
        // locals
        for (let k in keyableEnv) {
          const { val } = keyableEnv[k];
          if (typeof val !== "undefined") {
            res[k] = val;
          }
        }
      }

      return res;
    }
  ),
  getRawEnvWithAncestors = memoize(
    (
      state: Client.State,
      params: {
        envParentId: string;
        environmentId: string;
      },
      pending?: true
    ) => {
      const envParent = state.graph[params.envParentId] as Model.EnvParent,
        environment = state.graph[params.environmentId] as
          | Model.Environment
          | undefined;

      let baseEnv: Client.Env.RawEnv = {},
        overrides: Client.Env.RawEnv = {};

      if (environment) {
        let baseEnvironment: Model.Environment,
          subEnvironment: Model.Environment | undefined,
          connectedBaseEnvironments: Model.Environment[] = [],
          connectedSubEnvironments: Model.Environment[] = [];

        if (environment.isSub) {
          baseEnvironment = state.graph[
            environment.parentEnvironmentId
          ] as Model.Environment;
          subEnvironment = environment;
        } else {
          baseEnvironment = environment;
        }

        if (envParent.type == "app") {
          connectedBaseEnvironments = getConnectedBlockEnvironmentsForApp(
            state.graph,
            envParent.id,
            undefined,
            baseEnvironment.id
          );

          if (subEnvironment) {
            connectedSubEnvironments = getConnectedBlockEnvironmentsForApp(
              state.graph,
              envParent.id,
              undefined,
              subEnvironment.id
            );
          }
        }

        const connectedEnvironments = R.flatten(
          Object.values(
            R.groupBy(
              R.pipe(
                R.props(["envParentId", "environmentRoleId"]),
                R.join("|")
              ),

              [...connectedBaseEnvironments, ...connectedSubEnvironments]
            )
          )
        );

        for (let connected of connectedEnvironments) {
          baseEnv = {
            ...baseEnv,
            ...getRawEnv(
              state,
              {
                envParentId: connected.envParentId,
                environmentId: connected.id,
              },
              pending
            ),
          };
        }

        baseEnv = {
          ...baseEnv,
          ...getRawEnv(
            state,
            {
              envParentId: baseEnvironment.envParentId,
              environmentId: baseEnvironment.id,
            },
            pending
          ),
        };

        if (subEnvironment) {
          baseEnv = {
            ...baseEnv,
            ...getRawEnv(
              state,
              {
                envParentId: subEnvironment.envParentId,
                environmentId: subEnvironment.id,
              },
              pending
            ),
          };
        }
      } else {
        const localsUserId = params.environmentId.split("|")[1],
          localsEnvironment = (
            getEnvironmentsByEnvParentId(state.graph)[envParent.id] ?? []
          ).filter(
            ({ environmentRoleId }) =>
              (state.graph[environmentRoleId] as Rbac.EnvironmentRole)
                .hasLocalKeys
          )[0] as Model.Environment | undefined;

        const connectedBlocks = getConnectedBlocksForApp(
          state.graph,
          envParent.id
        );

        for (let block of connectedBlocks) {
          overrides = {
            ...overrides,
            ...getRawEnv(
              state,
              {
                envParentId: block.id,
                environmentId: [block.id, localsUserId].join("|"),
              },
              pending
            ),
          };
        }

        if (localsEnvironment && envParent.type == "app") {
          const connectedEnvironments = getConnectedBlockEnvironmentsForApp(
            state.graph,
            envParent.id,
            undefined,
            localsEnvironment.id
          );

          for (let connected of connectedEnvironments) {
            baseEnv = {
              ...baseEnv,
              ...getRawEnv(
                state,
                {
                  envParentId: connected.envParentId,
                  environmentId: connected.id,
                },
                pending
              ),
            };
          }
        }

        if (localsEnvironment) {
          baseEnv = {
            ...baseEnv,
            ...getRawEnv(
              state,
              {
                envParentId: params.envParentId,
                environmentId: localsEnvironment.id,
              },
              pending
            ),
          };
        }

        overrides = {
          ...overrides,
          ...getRawEnv(state, params),
        };
      }

      return { ...baseEnv, ...overrides };
    }
  ),
  getPendingKeyableEnv = memoize(
    (
      state: Client.State,
      params: {
        envParentId: string;
        environmentId: string;
      }
    ) => getKeyableEnv(state, params, true)
  ),
  getInheritanceOverrides = (
    state: Client.State,
    params: {
      envParentId: string;
      environmentId: string;
      forInheritsEnvironmentId?: string;
    },
    pending?: true
  ) => {
    let res: { [environmentId: string]: Client.Env.KeyableEnv } = {};
    const keyableEnv = getKeyableEnv(state, params, pending);

    for (let k in keyableEnv) {
      let { inheritsEnvironmentId: currentInheritsEnvironmentId } =
        keyableEnv[k];

      while (currentInheritsEnvironmentId) {
        const inheritsKeyableEnv = getKeyableEnv(
          state,
          {
            envParentId: params.envParentId,
            environmentId: currentInheritsEnvironmentId,
          },
          pending
        );

        let inheritsKeyableVal = inheritsKeyableEnv[k] as
          | Client.Env.KeyableEnvVal
          | undefined;

        if (!inheritsKeyableVal || R.isEmpty(inheritsKeyableVal)) {
          const composite = getUserEncryptedKeyOrBlobComposite({
            environmentId: params.environmentId,
            inheritsEnvironmentId: currentInheritsEnvironmentId,
          });

          const inheritanceOverrides = state.envs[composite]?.env as
            | Client.Env.KeyableEnv
            | undefined;

          if (inheritanceOverrides) {
            inheritsKeyableVal = inheritanceOverrides[k];
          }
        }

        if (inheritsKeyableVal) {
          res = R.assocPath(
            [currentInheritsEnvironmentId, k],
            inheritsKeyableVal,
            res
          );
        }

        currentInheritsEnvironmentId =
          inheritsKeyableVal?.inheritsEnvironmentId;
      }
    }

    if (
      params.forInheritsEnvironmentId &&
      res[params.forInheritsEnvironmentId]
    ) {
      res = pick([params.forInheritsEnvironmentId], res);
    }

    return res;
  },
  getPendingInheritanceOverrides = (
    state: Client.State,
    params: {
      envParentId: string;
      environmentId: string;
      forInheritsEnvironmentId?: string;
    }
  ) => getInheritanceOverrides(state, params, true),
  getEnvInheritsForVariables = (
    variables: (Client.Env.EnvWithMeta | Client.Env.EnvMetaState)["variables"]
  ): Client.Env.EnvInheritsState["inherits"] => {
    const inherits: Client.Env.EnvInheritsState["inherits"] = {};
    for (let k in variables) {
      if (!variables[k]) {
        continue;
      }

      const inheritsEnvironmentId = variables[k].inheritsEnvironmentId;
      if (inheritsEnvironmentId) {
        inherits[inheritsEnvironmentId] = (
          inherits[inheritsEnvironmentId] ?? []
        ).concat([k]);
      }
    }
    return inherits;
  },
  getInheritanceChain = (
    state: Client.State,
    params: {
      envParentId: string;
      environmentId: string;
    } & (
      | {
          key: string;
        }
      | {
          newEntryVals: Record<string, Client.Env.EnvWithMetaCell>;
        }
    ),
    pending?: true
  ): string[] => {
    let currentEnvironmentId: string | undefined;

    if ("key" in params) {
      const keyableEnv = getKeyableEnv(state, params, pending);
      currentEnvironmentId = keyableEnv[params.key]?.inheritsEnvironmentId;
    } else {
      currentEnvironmentId =
        params.newEntryVals[params.environmentId]?.inheritsEnvironmentId;
    }

    if (!currentEnvironmentId) {
      return [];
    }

    const chain: string[] = [currentEnvironmentId];

    while (true) {
      if ("key" in params) {
        const keyableEnv = getKeyableEnv(
          state,
          {
            ...params,
            environmentId: currentEnvironmentId,
          },
          pending
        );

        currentEnvironmentId = keyableEnv[params.key]?.inheritsEnvironmentId;
      } else {
        currentEnvironmentId =
          params.newEntryVals[currentEnvironmentId]?.inheritsEnvironmentId;
      }

      if (currentEnvironmentId) {
        chain.push(currentEnvironmentId);
      } else {
        break;
      }
    }

    return chain;
  },
  getPendingInheritanceChain = (
    state: Client.State,
    params: {
      envParentId: string;
      environmentId: string;
      key: string;
    }
  ) => getInheritanceChain(state, params, true),
  getInheritingEnvironmentIds = (
    state: Client.State,
    params: {
      envParentId: string;
      environmentId: string;
    } & (
      | {
          entryKey?: string;
        }
      | {
          newEntryVals: Record<string, Client.Env.EnvWithMetaCell>;
        }
      | {}
    ),
    pending?: true
  ): Set<string> => {
    const inheritingEnvironmentIds = new Set<string>(),
      siblings = (
        getEnvironmentsByEnvParentId(state.graph)[params.envParentId] ?? []
      ).filter(({ id }) => id != params.environmentId);

    for (let sibling of siblings) {
      const envWithMeta = (pending ? getPendingEnvWithMeta : getEnvWithMeta)(
        state,
        {
          ...params,
          environmentId: sibling.id,
        }
      );

      if ("newEntryVals" in params) {
        const chain = getInheritanceChain(
          state,
          {
            ...params,
            environmentId: sibling.id,
          },
          pending
        );
        if (chain.includes(params.environmentId)) {
          inheritingEnvironmentIds.add(sibling.id);
        }
      } else {
        const keys =
          "entryKey" in params && params.entryKey
            ? [params.entryKey]
            : Object.keys(envWithMeta.variables);

        for (let key of keys) {
          const chain = getInheritanceChain(
            state,
            {
              ...params,
              environmentId: sibling.id,
              key,
            },
            pending
          );
          if (chain.includes(params.environmentId)) {
            inheritingEnvironmentIds.add(sibling.id);
          }
        }
      }
    }

    return inheritingEnvironmentIds;
  },
  getPendingInheritingEnvironmentIds = (
    state: Client.State,
    params: {
      envParentId: string;
      environmentId: string;
      entryKey?: string;
    }
  ) => getInheritingEnvironmentIds(state, params, true),
  getPendingUpdateDetails = (
    state: Client.State,
    params: {
      envParentIds?: Set<string>;
      environmentIds?: Set<string>;
      entryKeys?: Set<string>;
    } = {}
  ) => {
    const apps = new Set<string>(),
      appEnvironments = new Set<string>(),
      appPaths = new Set<string>(),
      blocks = new Set<string>(),
      blockPaths = new Set<string>(),
      blockEnvironments = new Set<string>();

    const pendingEnvUpdates = state.pendingEnvUpdates,
      filteredUpdates = pendingEnvUpdates.filter(({ meta }) => {
        const envParent = state.graph[meta.envParentId];
        if (!envParent) {
          return false;
        }

        const environment = state.graph[meta.environmentId];
        if (!environment) {
          const [envParentId, localsUserId] = meta.environmentId.split("|");
          if (
            !envParentId ||
            !localsUserId ||
            !state.graph[envParentId] ||
            !state.graph[localsUserId]
          ) {
            return false;
          }
        }

        return (
          !getEnvironmentOrLocalsAutoCommitEnabled(
            state.graph,
            meta.environmentId
          ) &&
          (!params.envParentIds || params.envParentIds.has(meta.envParentId)) &&
          (!params.environmentIds ||
            params.environmentIds.has(meta.environmentId)) &&
          (!params.entryKeys ||
            R.any((k) => params.entryKeys?.has(k) ?? false, meta.entryKeys))
        );
      }),
      diffsByEnvironmentId: Record<string, Client.Env.DiffsByKey> = {},
      pendingLocalIds = R.uniq(
        pendingEnvUpdates
          .filter(({ meta }) => meta.environmentId.includes("|"))
          .map(({ meta }) => meta.environmentId)
      );

    for (let { meta } of filteredUpdates) {
      const envParent = state.graph[meta.envParentId] as Model.EnvParent;

      if (!diffsByEnvironmentId[meta.environmentId]) {
        const current = getEnvWithMeta(state, meta).variables;
        const pending = getPendingEnvWithMeta(state, meta).variables;
        const byKey = getDiffsByKey(current, pending, params.entryKeys);

        const hasDiffs = Object.keys(byKey).length > 0;
        if (hasDiffs) {
          diffsByEnvironmentId[meta.environmentId] = byKey;
        }
      }

      const byKey = diffsByEnvironmentId[meta.environmentId];

      if (byKey && Object.keys(byKey).length) {
        if (envParent.type == "app") {
          apps.add(envParent.id);
          appEnvironments.add(meta.environmentId);
          for (let k in byKey) {
            appPaths.add([meta.environmentId, k].join("|"));
          }
        } else if (envParent.type == "block") {
          blocks.add(envParent.id);
          blockEnvironments.add(meta.environmentId);
          for (let k in byKey) {
            blockPaths.add([meta.environmentId, k].join("|"));
          }
        }
      }
    }

    return {
      filteredUpdates,
      apps,
      appEnvironments,
      appPaths,
      blocks,
      blockPaths,
      blockEnvironments,
      diffsByEnvironmentId,
      pendingLocalIds,
    };
  },
  getDiffsByKey = (
    fromVars: Client.Env.EnvWithMeta["variables"],
    toVars: Client.Env.EnvWithMeta["variables"],
    entryKeys?: Set<string>
  ) => {
    const allKeys = new Set([...Object.keys(fromVars), ...Object.keys(toVars)]);
    const byKey: Client.Env.DiffsByKey = {};

    for (let k of allKeys) {
      if (entryKeys && !entryKeys.has(k)) {
        continue;
      }

      if (k in fromVars && fromVars[k] && !(k in toVars)) {
        byKey[k] = {
          fromValue: fromVars[k],
          toValue: undefined,
        };
      } else if (k in toVars && toVars[k] && !(k in fromVars)) {
        byKey[k] = {
          fromValue: undefined,
          toValue: toVars[k],
        };
      } else if (JSON.stringify(fromVars[k]) != JSON.stringify(toVars[k])) {
        byKey[k] = {
          fromValue: fromVars[k],
          toValue: toVars[k],
        };
      }
    }
    return byKey;
  },
  ensureEnvsFetched = (state: Client.State, envParentId: string) => {
    if (envsNeedFetch(state, envParentId)) {
      const envParent = state.graph[envParentId] as Model.EnvParent;
      const msg = `latest envs not fetched for ${envParent.name} - ${envParent.id}`;
      console.log(msg);
      throw new Error(msg);
    }
  },
  ensureChangesetsFetched = (state: Client.State, envParentId: string) => {
    if (changesetsNeedFetch(state, envParentId)) {
      const envParent = state.graph[envParentId] as Model.EnvParent;
      const msg = `latest changesets not fetched for ${envParent.name} - ${envParent.id}`;

      const fetchedAt = state.changesetsFetchedAt[envParentId];
      const envsOrLocalsUpdatedAt = envParent.envsOrLocalsUpdatedAt ?? 0;

      throw new Error(msg);
    }
  },
  envsNeedFetch = (state: Client.State, envParentId: string) => {
    const envParent = state.graph[envParentId] as Model.EnvParent;
    const fetchedAt = state.envsFetchedAt[envParentId];

    const envsOrLocalsUpdatedAt = envParent.envsOrLocalsUpdatedAt;

    if (!envsOrLocalsUpdatedAt) {
      return false;
    }

    if (!fetchedAt || envsOrLocalsUpdatedAt > fetchedAt) {
      return true;
    }

    return false;
  },
  changesetsNeedFetch = (state: Client.State, envParentId: string) => {
    const envParent = state.graph[envParentId] as Model.EnvParent;
    const fetchedAt = state.changesetsFetchedAt[envParentId];
    const envsOrLocalsUpdatedAt = envParent.envsOrLocalsUpdatedAt ?? 0;

    if (!envsOrLocalsUpdatedAt) {
      return false;
    }

    if (!fetchedAt || envsOrLocalsUpdatedAt > fetchedAt) {
      return true;
    }

    // if any changesets were created by deleted user devices / cli keys, then re-fetch
    // in order to include deleted graph
    for (let [environmentId, { changesets }] of R.toPairs(state.changesets)) {
      const environment = (state.graph[environmentId] ??
        state.deletedGraph[environmentId]) as Model.Environment | undefined;

      if (
        !(
          environment?.envParentId == envParentId ||
          environmentId.includes(envParentId)
        )
      ) {
        continue;
      }

      for (let { createdById } of changesets) {
        if (!(state.graph[createdById] ?? state.deletedGraph[createdById])) {
          return true;
        }
      }
    }

    return false;
  },
  getCurrentUserEnv = memoize(
    (
      state: Client.State,
      currentUserId: string,
      environmentId: string,
      pending?: true
    ): Client.Env.UserEnv | undefined => {
      const environment = state.graph[environmentId] as
        | Model.Environment
        | undefined;
      let localsUserId: string | undefined;
      let envParentId: string;

      if (environment) {
        envParentId = environment.envParentId;
      } else {
        [envParentId, localsUserId] = environmentId.split("|");
        if (!localsUserId) {
          return undefined;
        }
      }

      if (
        localsUserId ||
        authz.canReadEnv(state.graph, currentUserId, environmentId)
      ) {
        return (pending ? getPendingEnvWithMeta : getEnvWithMeta)(state, {
          envParentId,
          environmentId,
        });
      } else if (
        authz.canReadEnvMeta(state.graph, currentUserId, environmentId)
      ) {
        return getEnvMetaOnly(state, { envParentId, environmentId }, pending);
      } else if (
        authz.canReadEnvInherits(state.graph, currentUserId, environmentId)
      ) {
        return getEnvInherits(state, { envParentId, environmentId }, pending);
      }

      return undefined;
    }
  ),
  getCurrentUserEntryKeys = memoize(
    (
      state: Client.State,
      currentUserId: string,
      environmentIds: string[],
      pending?: true
    ) =>
      Array.from(
        getCurrentUserEntryKeysSet(
          state,
          currentUserId,
          environmentIds,
          pending
        )
      ).sort()
  ),
  getCurrentUserEntryKeysSet = memoize(
    (
      state: Client.State,
      currentUserId: string,
      environmentIds: string[],
      pending?: true
    ) =>
      new Set(
        environmentIds.flatMap((environmentId) =>
          Object.keys(
            getCurrentUserEnv(state, currentUserId, environmentId, pending)
              ?.variables ?? {}
          )
        )
      )
  ),
  getEnvWithMetaCellDisplay = (
    graph: Client.Graph.UserGraph,
    cell: Client.Env.EnvWithMetaCell | undefined,
    specialCellFormatter: (s: string) => string = R.identity
  ) => {
    if (!cell) {
      return specialCellFormatter("undefined");
    }
    if (cell.inheritsEnvironmentId) {
      const name = getEnvironmentName(graph, cell.inheritsEnvironmentId);
      return `inherits:${name.toLowerCase()}`;
    } else if (cell.isUndefined) {
      return specialCellFormatter("undefined");
    } else if (cell.isEmpty) {
      return specialCellFormatter("empty string");
    } else if (cell.val) {
      return cell.val;
    }

    return specialCellFormatter("undefined");
  };

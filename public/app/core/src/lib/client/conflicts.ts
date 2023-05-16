import memoize from "../utils/memoize";
import { Client, Model } from "../../types";
import { getChangesets } from "./versions";
import * as R from "ramda";
import {
  graphTypes,
  getEnvironmentsByEnvParentId,
  getEnvironmentName,
} from "../graph";
import {
  getEarliestEnvUpdatePendingAt,
  getPendingEnvWithMeta,
  getPendingActionsByEnvironmentId,
  getEnvWithMeta,
} from "./envs";
import { forceApplyPatch } from "../utils/patch";

export const getEnvironmentPendingConflicts = memoize(
    (
      state: Client.State,
      environmentId: string
    ): Client.Env.PotentialConflict[] => {
      let envParentId: string;
      const environment = state.graph[environmentId] as
        | Model.Environment
        | undefined;
      if (environment) {
        envParentId = environment.envParentId;
      } else {
        // local overrides
        [envParentId] = environmentId.split("|");
      }

      if (!state.graph[envParentId]) {
        return [];
      }

      const envWithMeta = getEnvWithMeta(state, {
        envParentId,
        environmentId,
      });
      const pendingEnvWithMeta = getPendingEnvWithMeta(state, {
        envParentId,
        environmentId,
      });

      const earliestPendingAt = getEarliestEnvUpdatePendingAt(
        state,
        environmentId
      );

      if (!earliestPendingAt) {
        return [];
      }
      const pendingActions =
        getPendingActionsByEnvironmentId(state)[environmentId] ?? [];
      const pendingEntryKeys = pendingActions.reduce(
        (agg, { meta: { entryKeys } }) => R.union(agg, entryKeys),
        [] as string[]
      );
      const changesets = getChangesets(state, {
        envParentId,
        environmentId,
        entryKeys: pendingEntryKeys,
        createdAfter: earliestPendingAt,
      });

      // get the *latest* potentially conflicting updates for each key
      const resByKey: Record<string, Client.Env.PotentialConflict> = {};
      for (let changeset of changesets) {
        for (let action of changeset.actions) {
          const overlappingEntryKeys = R.intersection(
            action.meta.entryKeys,
            pendingEntryKeys
          );

          // don't count actions that have an equivalent outcome as conflicts
          for (let entryKey of overlappingEntryKeys) {
            const envWithMetaToUpdate = R.clone(envWithMeta);
            forceApplyPatch(envWithMetaToUpdate, action.payload.diffs);

            if (
              !R.equals(
                envWithMetaToUpdate.variables[entryKey],
                pendingEnvWithMeta.variables[entryKey]
              )
            ) {
              resByKey[entryKey] = { entryKey, changeset, action };
            }
          }
        }
      }

      return Object.values(resByKey);
    }
  ),
  getAllPendingConflicts = memoize(
    (
      state: Client.State,
      envParentIdsArg?: string[],
      environmentIdsArg?: string[]
    ) => {
      const localsUserFilter = (localsUserId: string) => {
        const localsUser = state.graph[localsUserId] as
          | Model.OrgUser
          | Model.CliUser
          | undefined;
        return localsUser && !localsUser.deactivatedAt;
      };

      const allConflicts: {
        [envParentId: string]: {
          [environmentId: string]: Client.Env.PotentialConflict[];
        };
      } = {};

      const sortEnvironments = R.sortWith<Model.Environment>([
        R.ascend(R.prop("isSub")),
        R.ascend((environment) => {
          const name = getEnvironmentName(state.graph, environment.id);
          const i = ["Development", "Staging", "Production"].indexOf(name);
          return i == -1 ? name : i;
        }),
      ]);
      let toCheckEnvironmentIds: string[];
      if (environmentIdsArg) {
        toCheckEnvironmentIds = environmentIdsArg;
      } else if (envParentIdsArg) {
        // environments
        toCheckEnvironmentIds = R.flatten(
          envParentIdsArg.map((envParentIdArg) =>
            sortEnvironments(
              getEnvironmentsByEnvParentId(state.graph)[envParentIdArg] ?? []
            )
          )
        ).map(R.prop("id"));

        // locals
        toCheckEnvironmentIds = toCheckEnvironmentIds.concat(
          R.flatten(
            envParentIdsArg.map((envParentIdArg) => {
              const envParent = state.graph[envParentIdArg] as Model.EnvParent;
              return R.sortBy(
                (localsUserId) =>
                  getEnvironmentName(
                    state.graph,
                    [envParent.id, localsUserId].join("|")
                  ),
                Object.keys(envParent.localsUpdatedAtByUserId).filter(
                  localsUserFilter
                )
              );
            })
          )
        );
      } else {
        const { environments, apps, blocks } = graphTypes(state.graph);

        // all environments
        toCheckEnvironmentIds = sortEnvironments(environments).map(
          R.prop("id")
        );

        // all locals
        for (let { id: envParentId, localsUpdatedAtByUserId } of [
          ...apps,
          ...blocks,
        ]) {
          toCheckEnvironmentIds = toCheckEnvironmentIds.concat(
            R.sortBy(
              (localsUserId) =>
                getEnvironmentName(
                  state.graph,
                  [envParentId, localsUserId].join("|")
                ),
              Object.keys(localsUpdatedAtByUserId).filter(localsUserFilter)
            )
          );
        }
      }

      for (let environmentId of toCheckEnvironmentIds) {
        const environmentConflicts = getEnvironmentPendingConflicts(
          state,
          environmentId
        );
        if (environmentConflicts.length > 0) {
          const environment = state.graph[environmentId] as Model.Environment;
          if (!allConflicts[environment.envParentId]) {
            allConflicts[environment.envParentId] = {};
          }
          allConflicts[environment.envParentId][environmentId] =
            environmentConflicts;
        }
      }

      return allConflicts;
    }
  );

export const getNumPendingConflicts = memoize(
  (state: Client.State, envParentIds?: string[], environmentIds?: string[]) => {
    const allPendingConflicts = getAllPendingConflicts(
      state,
      envParentIds,
      environmentIds
    );
    return R.flatten(R.values(allPendingConflicts).map(R.values)).length;
  }
);

export const hasPendingConflicts = (
  state: Client.State,
  envParentIds?: string[],
  environmentIds?: string[]
) => getNumPendingConflicts(state, envParentIds, environmentIds) > 0;

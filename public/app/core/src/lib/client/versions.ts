import { getEnvWithMeta, getPendingEnvWithMeta } from "./envs";
import { pick } from "../utils/pick";
import { Client } from "../../types";
import { forceApplyPatch } from "../utils/patch";
import memoize from "../utils/memoize";
import * as R from "ramda";
// import { log } from "../utils/logger";

export const getEnvWithMetaForVersion = memoize(
    (
      state: Client.State,
      params: Client.Env.TargetVersionParams
    ): Client.Env.EnvWithMeta => {
      if (params.reverse && params.version > 0) {
        throw new Error(
          "When 'reverse' flag is passed, version must be 0 or a negative integer representing the number of versions *back* from the current value."
        );
      }

      const actions = getActionsForVersion(state, params),
        envWithMetaForActions = getEnvWithMetaForActions(
          actions,
          params.reverse ? getEnvWithMeta(state, params) : undefined,
          params.reverse
        );

      if (params.entryKeys) {
        // scope to params.entryKeys
        const envWithMeta = getPendingEnvWithMeta(state, params);
        return {
          inherits: (<any>(
            R.filter(
              (keys: string[]) => keys.length > 0,
              R.mergeDeepWith(
                R.union,
                R.mapObjIndexed(
                  R.without(params.entryKeys),
                  envWithMeta.inherits
                ),
                R.mapObjIndexed(
                  R.intersection(params.entryKeys),
                  envWithMetaForActions.inherits
                )
              )
            )
          )) as Client.Env.EnvInheritsState["inherits"],
          variables: {
            ...R.omit(params.entryKeys, envWithMeta.variables),
            ...pick(params.entryKeys, envWithMetaForActions.variables),
          },
        };
      } else {
        return envWithMetaForActions;
      }
    }
  ),
  getEntryKeysForVersion = (
    state: Client.State,
    params: Client.Env.TargetVersionParams
  ) => getEntryKeysForChangesetActions(getActionsForVersion(state, params)),
  getEntryKeysForAllVersions = (
    state: Client.State,
    params: Client.Env.ListVersionsParams
  ) =>
    getEntryKeysForChangesetActions(
      getChangesets(state, params).flatMap(R.prop("actions"))
    ),
  getEnvWithMetaForActions = (
    actions: Client.Action.ReplayableEnvUpdateAction[],
    envWithMeta?: Client.Env.EnvWithMeta,
    reverseDiffs?: true
  ) => {
    let res: Client.Env.EnvWithMeta = envWithMeta
      ? R.clone(envWithMeta)
      : { inherits: {}, variables: {} };

    for (let {
      payload: { diffs, reverse },
    } of actions) {
      forceApplyPatch(res, reverseDiffs ? reverse : diffs);
    }

    return res;
  },
  getChangesets = memoize(
    (
      state: Client.State,
      params: Client.Env.ListVersionsParams
    ): Client.Env.Changeset[] => {
      const { changesets } = state.changesets[params.environmentId] ?? {};

      if (!changesets) {
        return [];
      }

      const comparator = params.reverse
        ? R.descend(R.prop("createdAt"))
        : R.ascend(R.prop("createdAt"));

      return R.sort(
        comparator,
        changesets
          .map((changeset) => {
            const actions =
              typeof params.createdAfter == "undefined" ||
              changeset.createdAt > params.createdAfter
                ? changeset.actions.filter(getActionsFilterFn(params))
                : [];
            return {
              ...changeset,
              actions: params.reverse ? R.reverse(actions) : actions,
            };
          })
          .filter(({ actions }) => actions.length > 0)
      );
    }
  ),
  getChangesetCommitNumber = (
    state: Client.State,
    params: Client.Env.ListVersionsParams,
    changeset: Client.Env.Changeset
  ): number => {
    const changesets = getChangesets(state, params);
    const index = changesets.findIndex(
      (c) =>
        c.createdAt === changeset.createdAt &&
        c.encryptedById === c.encryptedById
    );
    if (index === -1) {
      throw new Error("Changeset commit not found!");
    }
    return params.reverse ? index * -1 : index + 1;
  },
  getLatestVersionNumber = memoize(
    (state: Client.State, params: Client.Env.ListVersionsParams): number =>
      params.reverse
        ? 0
        : getChangesets(state, params).reduce(
            (accumulator, current) => accumulator + current.actions.length,
            0
          )
  ),
  getChangesetForVersion = (
    state: Client.State,
    params: Client.Env.TargetVersionParams
  ): Client.Env.Changeset | undefined => {
    const changesets = getChangesets(state, params);
    let i = params.reverse ? 0 : 1;
    for (let changeset of changesets) {
      for (let action of changeset.actions) {
        if (i === Math.abs(params.version)) {
          return changeset;
        }
        i += 1;
      }
    }
    // not found
  },
  getVersionForChangeset = (
    state: Client.State,
    params: Client.Env.ListVersionsParams,
    changesetNumber: number
  ): number => {
    const changesets = getChangesets(state, params);
    let changesetCounter = params.reverse ? 0 : 1;
    let versionCounter = changesetCounter;

    for (let c of changesets) {
      if (changesetCounter === changesetNumber) {
        return (versionCounter + c.actions.length) * (params.reverse ? -1 : 1);
      }
      changesetCounter++;
      versionCounter += c.actions.length;
    }
    throw new Error("Invalid changeset commit number!");
  };

const getActionsFilterFn =
    (params: Client.Env.ListVersionsParams) =>
    (action: Client.Action.ReplayableEnvUpdateAction) =>
      params.envParentId == action.meta.envParentId &&
      action.meta.environmentId == params.environmentId &&
      (!params.entryKeys ||
        R.intersection(params.entryKeys, action.meta.entryKeys).length > 0),
  getActionsForVersion = (
    state: Client.State,
    params: Client.Env.TargetVersionParams
  ) => {
    const { envParentId, environmentId, entryKeys, version } = params;
    let changesets = getChangesets(state, params);

    if (!changesets) {
      throw new Error("changesets not found.");
    }

    const actions = R.flatten(changesets.map(R.prop("actions")))
      .filter(getActionsFilterFn({ envParentId, environmentId, entryKeys }))
      .slice(0, Math.abs(version));

    if (actions.length == 0) {
      return [];
    }

    return actions;
  },
  getEntryKeysForChangesetActions = (
    actions: Client.Action.ReplayableEnvUpdateAction[]
  ) =>
    R.uniq(R.flatten(actions.map(R.path(["meta", "entryKeys"])))) as string[];

import { pick } from "@core/lib/utils/object";
import { Draft } from "immer";
import * as R from "ramda";
import { Client, Model } from "@core/types";
import { getEnvironmentOrLocalsAutoCommitEnabled } from "@core/lib/graph";
import {
  getEnvWithMeta,
  getPendingEnvWithMeta,
  getEnvInheritsForVariables,
  getEnvWithMetaForActions,
  getPendingEnvironmentIds,
} from "@core/lib/client";
import { dispatch, clientAction } from "../../handler";
import { createPatch } from "rfc6902";
import { Action } from "redux";
import stableStringify from "fast-json-stable-stringify";
import { log } from "@core/lib/utils/logger";

export const envUpdateAction = <
    T extends Client.Action.EnvUpdateAction
  >(params: {
    actionType: Client.Action.EnvUpdateAction["type"];
    updateFn: (
      state: Client.State,
      envWithMeta: Client.Env.EnvWithMeta,
      action: T
    ) => Client.Env.EnvWithMeta;
  }) => {
    const { actionType, updateFn } = params;
    clientAction<T>({
      // since auto-commit is disabled, this can be a simple clientAction
      // type: "asyncClientAction",
      type: "clientAction",
      actionType,
      stateProducer: (draft, action) => {
        const environmentId = action.payload.environmentId;
        let envParentId: string;
        const environment = draft.graph[environmentId] as
          | Model.Environment
          | undefined;
        if (environment) {
          envParentId = environment.envParentId;
        } else {
          [envParentId] = environmentId.split("|");
        }

        const envWithMeta = getPendingEnvWithMeta(
          draft,
          R.pick(["envParentId", "environmentId"], action.payload)
        );

        let updated = updateFn(draft, envWithMeta, action);

        updated = {
          ...updated,
          inherits: getEnvInheritsForVariables(updated.variables),
        };

        const diffs = createPatch(envWithMeta, updated);

        // don't queue update if nothing changed
        if (diffs.length == 0) {
          return;
        }

        // only include entryKeys that changed in meta.entryKeys
        const entryKeys: string[] = [];
        for (let { path } of diffs) {
          const k = path.match(/variables\/(.+?)(\/|$)/)?.[1];
          if (k) {
            entryKeys.push(k);
          }
        }

        const reverse = createPatch(updated, envWithMeta);

        const revert =
            action.type == Client.ActionType.REVERT_ENVIRONMENT
              ? (action as Client.Action.ClientActions["RevertEnvironment"])
                  .payload.version
              : undefined,
          pendingAction: Client.Action.PendingEnvUpdateAction = {
            type: actionType,
            payload: { diffs, reverse, revert },
            meta: {
              ...pick(["envParentId", "environmentId"], action.payload),
              entryKeys,
              pendingAt: Date.now(),
            },
          };

        clearOverwrittenActionsProducer(draft, pendingAction);
        draft.pendingEnvUpdates.push(pendingAction);
        clearVoidedPendingEnvUpdatesProducer(draft);

        draft.pendingEnvsUpdatedAt = Date.now();
      },
      // auto-commit is disabled for now, so handler isn't needed
      // handler: async (
      //   state,
      //   { payload: { environmentId } },
      //   { context, dispatchSuccess, dispatchFailure }
      // ) => {
      //   const autoCommit = getEnvironmentOrLocalsAutoCommitEnabled(
      //     state.graph,
      //     environmentId
      //   );

      //   if (autoCommit && Object.keys(state.isUpdatingEnvs).length == 0) {
      //     const res = await dispatch(
      //       {
      //         type: Client.ActionType.COMMIT_ENVS,
      //         payload: {
      //           pendingEnvironmentIds: [environmentId],
      //           autoCommit: true,
      //         },
      //       },
      //       context
      //     );

      //     if (!res.success) {
      //       return dispatchFailure((res.resultAction as any)?.payload, context);
      //     }
      //   }

      //   return dispatchSuccess(null, context);
      // },
    });
  },
  clearOverwrittenActionsProducer = (
    draft: Draft<Client.State>,
    newPending: Client.Action.PendingEnvUpdateAction
  ) => {
    draft.pendingEnvUpdates = draft.pendingEnvUpdates.filter((pending) => {
      if (
        pending.meta.environmentId != newPending.meta.environmentId ||
        newPending.type == Client.ActionType.CREATE_ENTRY ||
        pending.type == Client.ActionType.CREATE_ENTRY
      ) {
        return true;
      }

      const newPendingEntryKeys = new Set(newPending.meta.entryKeys);
      if (pending.meta.entryKeys.every((k) => newPendingEntryKeys.has(k))) {
        return false;
      }

      return true;
    });
  },
  clearVoidedPendingEnvUpdatesProducer = (draft: Draft<Client.State>) => {
    if (draft.pendingEnvUpdates.length == 0) {
      return;
    }

    // if there are multiple pending updates and they combine to
    // produce no diff for an environment, clear them all out
    const environmentIds = getPendingEnvironmentIds(draft);
    const clearEnvironmentIds = new Set<string>();

    for (let environmentId of environmentIds) {
      const environment = draft.graph[environmentId] as
        | Model.Environment
        | undefined;
      const envParentId =
        environment?.envParentId ?? environmentId.split("|")[0];

      const current = getEnvWithMeta(draft, { envParentId, environmentId });
      const pending = getPendingEnvWithMeta(
        draft,
        {
          envParentId,
          environmentId,
        },
        Date.now()
      );

      const eq = R.equals(current, pending);

      if (eq) {
        clearEnvironmentIds.add(environmentId);
      }
    }

    if (clearEnvironmentIds.size > 0) {
      draft.pendingEnvUpdates = draft.pendingEnvUpdates.filter(
        ({ meta }) => !clearEnvironmentIds.has(meta.environmentId)
      );
    }

    // the logic below would also clear out actions that made
    // no change from the previous version, but it's *very* slow
    // when there are a lot of pending updates
    // const byDistinctMetaJson = R.groupBy(
    //   (action) => stableStringify(action.meta),
    //   draft.pendingEnvUpdates
    // );

    // for (let metaJson in byDistinctMetaJson) {
    //   const meta = JSON.parse(
    //     metaJson
    //   ) as Client.Action.ReplayableEnvUpdateAction["meta"];

    //   const current = getEnvWithMeta(draft, meta);
    //   const pending = getEnvWithMeta(draft, meta, true);
    //   const diff = createPatch(current, pending);

    //   if (!(diff && diff.length > 0)) {
    //     draft.pendingEnvUpdates = R.without(
    //       byDistinctMetaJson[metaJson],
    //       draft.pendingEnvUpdates
    //     );
    //   }
    // }

    // // clear pending updates that don't produce a diff from previous version
    // while (true) {
    //   let removedAction = false;

    //   draft.pendingEnvUpdates = draft.pendingEnvUpdates.filter((action, i) => {
    //     const envWithMeta = getEnvWithMeta(draft, action.meta);
    //     const previousActions = draft.pendingEnvUpdates
    //       .slice(0, i)
    //       .filter(
    //         ({ meta: { environmentId } }) =>
    //           environmentId === action.meta.environmentId
    //       );
    //     const previousEnvWithMeta =
    //         previousActions.length > 0
    //           ? getEnvWithMetaForActions(previousActions, envWithMeta)
    //           : envWithMeta,
    //       nextEnvWithMeta = getEnvWithMetaForActions(
    //         [action],
    //         previousEnvWithMeta
    //       ),
    //       diff = createPatch(previousEnvWithMeta, nextEnvWithMeta);

    //     const keep = Boolean(diff && diff.length > 0);

    //     if (!keep) {
    //       removedAction = true;
    //     }
    //     return keep;
    //   });

    //   if (!removedAction) {
    //     return;
    //   }
    // }
  };

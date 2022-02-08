import * as R from "ramda";
import { Client, Model, Api } from "@core/types";
import {
  graphTypes,
  getEnvironmentPermissions,
  getEnvParentPermissions,
  getOrgPermissions,
} from "@core/lib/graph";
import {
  envsNeedFetch,
  changesetsNeedFetch,
  getPendingEnvironmentIds,
} from "@core/lib/client";
import { dispatch } from "../../handler";
import { log } from "@core/lib/utils/logger";

export const fetchEnvsForUserOrAccessParams = async (
    state: Client.State,
    allParams: {
      userId?: string;
      accessParams?: Model.AccessParams;
    }[],
    context: Client.Context
  ) => {
    const toFetchEnvs = new Set<string>(),
      toFetchChangesets = new Set<string>(),
      byType = graphTypes(state.graph),
      allEnvironments = byType.environments,
      allEnvParents = [...byType.apps, ...byType.blocks];

    for (let { userId, accessParams } of allParams) {
      let orgRoleId: string;

      if (userId) {
        ({ orgRoleId } = state.graph[userId] as Model.CliUser | Model.OrgUser);
      } else if (accessParams) {
        ({ orgRoleId } = accessParams);
      } else {
        throw new Error("either userId or accessParams required");
      }
      const orgPermissions = getOrgPermissions(state.graph, orgRoleId);

      for (let environment of allEnvironments) {
        const permissions = getEnvironmentPermissions(
          state.graph,
          environment.id,
          userId,
          accessParams
        );

        if (
          (permissions.has("read") ||
            permissions.has("read_meta") ||
            permissions.has("read_inherits")) &&
          environment.envUpdatedAt
        ) {
          toFetchEnvs.add(environment.envParentId);
        }

        if (permissions.has("read_history") && environment.envUpdatedAt) {
          toFetchChangesets.add(environment.envParentId);
        }
      }

      for (let envParent of allEnvParents) {
        const permissions = getEnvParentPermissions(
          state.graph,
          envParent.id,
          userId,
          accessParams
        );

        if (
          ((envParent.type == "block" &&
            orgPermissions.has("blocks_read_all")) ||
            permissions.has("app_read_user_locals")) &&
          envParent.localsUpdatedAt
        ) {
          toFetchEnvs.add(envParent.id);
        }

        if (
          ((envParent.type == "block" &&
            orgPermissions.has("blocks_read_all")) ||
            permissions.has("app_read_user_locals_history")) &&
          envParent.localsUpdatedAt
        ) {
          toFetchChangesets.add(envParent.id);
        }
      }
    }

    return fetchRequiredEnvs(state, toFetchEnvs, toFetchChangesets, context);
  },
  fetchRequiredEnvs = async (
    state: Client.State,
    requiredEnvs: Set<string>,
    requiredChangesets: Set<string>,
    context: Client.Context,
    skipWaitForReencryption?: true
  ): Promise<Client.DispatchResult | undefined> => {
    const envParentIds = R.uniq(
      Array.from(requiredEnvs).concat(Array.from(requiredChangesets))
    );

    let shouldFetch = false;
    const toFetch: Api.Net.FetchEnvsParams["byEnvParentId"] = {};

    for (let envParentId of envParentIds) {
      if (
        requiredEnvs.has(envParentId) &&
        requiredChangesets.has(envParentId) &&
        envsNeedFetch(state, envParentId) &&
        changesetsNeedFetch(state, envParentId)
      ) {
        shouldFetch = true;
        toFetch[envParentId] = { envs: true, changesets: true };
      } else if (
        requiredEnvs.has(envParentId) &&
        envsNeedFetch(state, envParentId)
      ) {
        shouldFetch = true;
        toFetch[envParentId] = { envs: true };
      } else if (
        requiredChangesets.has(envParentId) &&
        changesetsNeedFetch(state, envParentId)
      ) {
        shouldFetch = true;
        toFetch[envParentId] = { changesets: true };
      }
    }

    if (shouldFetch) {
      return dispatch(
        {
          type: Client.ActionType.FETCH_ENVS,
          payload: {
            byEnvParentId: toFetch,
            skipWaitForReencryption,
          },
        },
        context
      );
    }

    return undefined;
  },
  fetchRequiredPendingEnvs = async (
    state: Client.State,
    context: Client.Context,
    skipWaitForReencryption?: true
  ): Promise<Client.DispatchResult | undefined> => {
    const pendingEnvironmentIds = getPendingEnvironmentIds(state);

    if (pendingEnvironmentIds.length > 0) {
      const pendingEnvParentIds = new Set(
        pendingEnvironmentIds.map((environmentId) => {
          const environment = state.graph[environmentId] as
            | Model.Environment
            | undefined;

          if (environment) {
            return environment.envParentId;
          } else {
            const [envParentId] = environmentId.split("|");
            return envParentId;
          }
        })
      );

      if (pendingEnvParentIds.size > 0) {
        return fetchRequiredEnvs(
          state,
          pendingEnvParentIds,
          new Set(),
          context,
          skipWaitForReencryption
        );
      }

      return undefined;
    }
  };

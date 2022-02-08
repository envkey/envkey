import memoize from "./../../../utils/memoize";
import { Graph, Model, Rbac } from "../../../../types";
import * as g from "../../.";
import { canDeleteEnvironment, canReadEnv } from "../authorizers";
import * as R from "ramda";

export const getEnvsUpdatableBaseEnvironments = memoize(
    (graph: Graph.Graph, currentUserId: string, envParentId: string) =>
      (g.getEnvironmentsByEnvParentId(graph)[envParentId] ?? []).filter(
        (environment) =>
          !environment.isSub &&
          g.authz.canUpdateEnv(graph, currentUserId, environment.id)
      )
  ),
  getVisibleBaseEnvironments = memoize(
    (graph: Graph.Graph, currentUserId: string, envParentId: string) => {
      return (g.getEnvironmentsByEnvParentId(graph)[envParentId] ?? []).filter(
        (environment) =>
          !environment.isSub &&
          (g.authz.canReadEnv(graph, currentUserId, environment.id) ||
            g.authz.canReadEnvMeta(graph, currentUserId, environment.id))
      );
    }
  ),
  getVisibleBaseEnvironmentAndLocalIds = memoize(
    (
      graph: Graph.Graph,
      currentUserId: string,
      envParentId: string,
      localsUserId?: string
    ) => {
      if (localsUserId) {
        if (
          g.authz.canReadLocals(graph, currentUserId, envParentId, localsUserId)
        ) {
          return [envParentId + "|" + localsUserId];
        }
      } else {
        return (g.getEnvironmentsByEnvParentId(graph)[envParentId] ?? [])
          .filter(
            (environment) =>
              !environment.isSub &&
              (g.authz.canReadEnv(graph, currentUserId, environment.id) ||
                g.authz.canReadEnvMeta(graph, currentUserId, environment.id))
          )
          .map(R.prop("id"));
      }

      return [];
    }
  ),
  getEnvsUpdatableSubEnvironments = memoize(
    (graph: Graph.Graph, currentUserId: string, parentEnvironmentId: string) =>
      (
        g.getSubEnvironmentsByParentEnvironmentId(graph)[parentEnvironmentId] ??
        []
      ).filter(
        (environment) =>
          environment.isSub &&
          g.authz.canUpdateEnv(graph, currentUserId, environment.id)
      )
  ),
  getEnvsReadableForParentId = memoize(
    (graph: Graph.Graph, currentUserId: string, envParentId: string) =>
      (g.getEnvironmentsByEnvParentId(graph)[envParentId] ?? []).filter(
        (environment) => canReadEnv(graph, currentUserId, environment.id)
      )
  ),
  getDeletableSubEnvironmentsForEnvParent = memoize(
    (graph: Graph.Graph, currentUserId: string, envParentId: string) =>
      (g.getEnvironmentsByEnvParentId(graph)[envParentId] ?? []).filter(
        (environment) =>
          environment.isSub &&
          canDeleteEnvironment(graph, currentUserId, environment.id)
      )
  ),
  getEnvParentsWithDeletableSubEnvironments = memoize(
    (graph: Graph.Graph, currentUserId: string) => {
      const { apps, blocks } = g.graphTypes(graph);
      const envParents = [...apps, ...blocks] as Model.EnvParent[];
      return envParents.filter(
        (ep) =>
          getDeletableSubEnvironmentsForEnvParent(graph, currentUserId, ep.id)
            .length
      );
    }
  ),
  getCanCreateSubEnvironmentsForEnvParents = memoize(
    (graph: Graph.Graph, currentUserId: string) => {
      const { apps, blocks } = g.graphTypes(graph);
      const envParents = [...apps, ...blocks] as Model.EnvParent[];
      return envParents.filter(
        (ep) =>
          getCanCreateSubEnvironmentForEnvironments(graph, currentUserId, ep.id)
            .length
      );
    }
  ),
  getCanCreateBaseEnvironmentWithRoles = memoize(
    (
      graph: Graph.Graph,
      currentUserId: string,
      envParentId: string
    ): Rbac.EnvironmentRole[] =>
      g
        .graphTypes(graph)
        .environmentRoles.filter(({ id: environmentRoleId }) =>
          g.authz.canCreateBaseEnvironment(
            graph,
            currentUserId,
            envParentId,
            environmentRoleId
          )
        )
  ),
  getCanCreateSubEnvironmentForEnvironments = memoize(
    (graph: Graph.Graph, currentUserId: string, envParentId: string) =>
      (g.getEnvironmentsByEnvParentId(graph)[envParentId] ?? []).filter(
        (environment) =>
          !environment.isSub &&
          g.authz.canCreateSubEnvironment(graph, currentUserId, environment.id)
      )
  ),
  getAppsPassingEnvTest = memoize(
    (
      graph: Graph.Graph,
      currentUserId: string,
      test: (
        graph: Graph.Graph,
        currentUserId: string,
        environmentId: string
      ) => boolean
    ) =>
      g.graphTypes(graph).apps.filter((app) => {
        const appEnvs = g.getEnvironmentsByEnvParentId(graph)[app.id] ?? [];
        return (
          appEnvs.filter((environment) =>
            test(graph, currentUserId, environment.id)
          ).length > 0
        );
      })
  ),
  getEnvParentsPassingEnvTest = memoize(
    (
      graph: Graph.Graph,
      currentUserId: string,
      test: (
        graph: Graph.Graph,
        currentUserId: string,
        environmentId: string
      ) => boolean
    ) => {
      const { apps, blocks } = g.graphTypes(graph);
      const passingEnvParents = [...apps, ...blocks].filter((app) => {
        const appEnvs = g.getEnvironmentsByEnvParentId(graph)[app.id] ?? [];
        const hasAtLeastOneEnvAvailable =
          appEnvs.filter((environment) =>
            test(graph, currentUserId, environment.id)
          ).length > 0;
        return hasAtLeastOneEnvAvailable;
      });
      return passingEnvParents;
    }
  ),
  getInheritableEnvironments = memoize(
    (
      graph: Graph.Graph,
      currentUserId: string,
      environmentId: string,
      inheritingEnvironmentIds: Set<string>
    ): Model.Environment[] => {
      if (!g.authz.canReadEnv(graph, currentUserId, environmentId)) {
        return [];
      }
      const environment = graph[environmentId] as Model.Environment;

      const environments = (
        g.getEnvironmentsByEnvParentId(graph)[environment.envParentId] ?? []
      ).filter(
        (candidate) =>
          candidate.id != environmentId &&
          !inheritingEnvironmentIds.has(candidate.id) &&
          !candidate.isSub &&
          !(
            environment.isSub && environment.parentEnvironmentId == candidate.id
          ) &&
          g.authz.canReadEnv(graph, currentUserId, candidate.id)
      );

      return environments;
    }
  );

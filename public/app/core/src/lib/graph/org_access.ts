import { Graph, Rbac, Model } from "../../types";
import { setToObject, stripUndefinedRecursive } from "../../lib/utils/object";
import {
  getOrgPermissions,
  getEnvParentPermissions,
  getEnvironmentPermissions,
} from "./permissions";
import { getConnectedBlockEnvironmentsForApp } from "./app_blocks";
import { getScoped } from "./scoped";
import set from "lodash.set";
import * as R from "ramda";

export const getOrgAccessSet = (
  graph: Graph.Graph,
  scope: Rbac.OrgAccessScope
) => {
  // const now = Date.now();

  let res: Rbac.OrgAccessSet = {};

  const {
    scopeUsers,
    scopeDevices,
    scopeApps,
    scopeEnvironments,
    scopeGeneratedEnvkeys,
  } = getScoped(graph, scope);

  for (let user of scopeUsers) {
    if (user.deletedAt || user.deactivatedAt) {
      continue;
    }

    const orgPermissions = getOrgPermissions(graph, user.orgRoleId);

    set(res, ["orgPermissions", "users", user.id], setToObject(orgPermissions));

    for (let { id: appId, deletedAt } of scopeApps) {
      if (deletedAt) {
        continue;
      }

      const appPermissions = getEnvParentPermissions(graph, appId, user.id);
      set(
        res,
        ["appPermissions", appId, "users", user.id],
        setToObject(appPermissions)
      );
    }

    for (let { id: environmentId, deletedAt } of scopeEnvironments) {
      if (deletedAt) {
        continue;
      }

      const environmentPermissions = getEnvironmentPermissions(
        graph,
        environmentId,
        user.id
      );

      // logWithElapsed("got user environment permissions", now);

      set(
        res,
        ["environments", environmentId, "users", user.id],
        setToObject(environmentPermissions)
      );
    }
  }

  // logWithElapsed("users", now);

  for (let { userId, id: deviceId, deletedAt, deactivatedAt } of scopeDevices) {
    if (deletedAt || deactivatedAt) {
      continue;
    }

    const orgUser = graph[userId] as Model.OrgUser;

    if (orgUser.deletedAt || orgUser.deactivatedAt) {
      continue;
    }

    const orgPermissions = getOrgPermissions(graph, orgUser.orgRoleId);

    set(
      res,
      ["orgPermissions", "devices", deviceId],
      setToObject(orgPermissions)
    );

    for (let { id: appId, deletedAt } of scopeApps) {
      if (deletedAt) {
        continue;
      }

      const appPermissions = getEnvParentPermissions(graph, appId, userId);
      set(
        res,
        ["appPermissions", appId, "devices", deviceId],
        setToObject(appPermissions)
      );
    }

    for (let { id: environmentId, deletedAt } of scopeEnvironments) {
      if (deletedAt) {
        continue;
      }

      const environmentPermissions = getEnvironmentPermissions(
        graph,
        environmentId,
        userId
      );
      set(
        res,
        ["environments", environmentId, "devices", deviceId],
        setToObject(environmentPermissions)
      );
    }
  }

  // logWithElapsed("devices", now);

  for (let {
    id: generatedEnvkeyId,
    appId,
    keyableParentId,
    keyableParentType,
    deletedAt,
  } of scopeGeneratedEnvkeys) {
    if (deletedAt) {
      continue;
    }

    const keyableParent = graph[keyableParentId] as Model.KeyableParent,
      environment = graph[keyableParent.environmentId] as Model.Environment;

    set(
      res,
      [
        "environments",
        environment.id,
        keyableParentType + "s",
        keyableParentId,
      ],
      generatedEnvkeyId
    );

    if (environment.isSub) {
      set(
        res,
        [
          "environments",
          environment.parentEnvironmentId,
          keyableParentType + "s",
          keyableParentId,
        ],
        generatedEnvkeyId
      );
    }

    const connectedBlockEnvironments = getConnectedBlockEnvironmentsForApp(
      graph,
      appId,
      undefined,
      environment.id
    );
    for (let blockEnvironment of connectedBlockEnvironments) {
      if (blockEnvironment.deletedAt) {
        continue;
      }

      if (
        scope != "all" &&
        scope.envParentIds &&
        scope.envParentIds != "all" &&
        !scope.envParentIds.has(blockEnvironment.envParentId)
      ) {
        continue;
      }

      if (
        scope != "all" &&
        scope.environmentIds &&
        scope.environmentIds != "all" &&
        !scope.environmentIds.has(blockEnvironment.id)
      ) {
        continue;
      }

      set(
        res,
        [
          "environments",
          blockEnvironment.id,
          keyableParentType + "s",
          keyableParentId,
        ],
        generatedEnvkeyId
      );

      if (blockEnvironment.isSub) {
        set(
          res,
          [
            "environments",
            blockEnvironment.parentEnvironmentId,
            keyableParentType + "s",
            keyableParentId,
          ],
          generatedEnvkeyId
        );
      }
    }
  }

  // logWithElapsed("envkeys", now);

  return res;
};

export const mergeAccessScopes = (...sets: Rbac.OrgAccessScope[]) => {
  if (sets.some((scope) => scope == "all")) {
    return "all";
  }

  return sets.map(stripUndefinedRecursive).reduce(
    R.mergeWith((scope1, scope2) => {
      if (scope1 == "all" || scope2 == "all") {
        return "all";
      } else {
        return new Set(Array.from(scope1).concat(Array.from(scope2)));
      }
    })
  ) as Rbac.OrgAccessScope;
};

import { Graph, Rbac, Model } from "../../types";
import { graphTypes } from "./base";

export const getScoped = (graph: Graph.Graph, scope: Rbac.OrgAccessScope) => {
  const {
    orgUsers,
    cliUsers,
    orgUserDevices,
    apps,
    blocks,
    environments,
    generatedEnvkeys,
  } = graphTypes(graph);

  const allUsers = [...orgUsers, ...cliUsers];

  if (scope == "all") {
    return {
      scopeUsers: allUsers,
      scopeDevices: orgUserDevices,
      scopeApps: apps,
      scopeBlocks: blocks,
      scopeEnvironments: environments,
      scopeGeneratedEnvkeys: generatedEnvkeys,
    };
  }

  let scopeUsers: (Model.OrgUser | Model.CliUser)[] = [];
  if (scope.userIds == "all") {
    scopeUsers = allUsers;
  } else if (scope.userIds) {
    scopeUsers = allUsers.filter(({ id }) =>
      (scope.userIds as Set<string>).has(id)
    );
  }

  let scopeDevices: Model.OrgUserDevice[] = [];
  if (
    (scope.userIds == "all" && scope.deviceIds == "all") ||
    (!scope.userIds && scope.deviceIds == "all")
  ) {
    scopeDevices = orgUserDevices;
  } else if (scope.userIds || scope.deviceIds) {
    scopeDevices = orgUserDevices.filter(
      ({ userId, id }) =>
        (!scope.userIds ||
          scope.userIds == "all" ||
          scope.userIds.has(userId)) &&
        (!scope.deviceIds ||
          scope.deviceIds == "all" ||
          scope.deviceIds.has(id))
    );
  }

  let scopeApps: Model.App[] = [];
  if (scope.envParentIds == "all") {
    scopeApps = apps;
  } else if (scope.envParentIds) {
    scopeApps = apps.filter(({ id }) =>
      (scope.envParentIds as Set<string>).has(id)
    );
  }

  let scopeBlocks: Model.Block[] = [];
  if (scope.envParentIds == "all") {
    scopeBlocks = blocks;
  } else if (scope.envParentIds) {
    scopeBlocks = blocks.filter(({ id }) =>
      (scope.envParentIds as Set<string>).has(id)
    );
  }

  let scopeEnvironments: Model.Environment[] = [];
  if (
    (scope.envParentIds == "all" && scope.environmentIds == "all") ||
    (!scope.envParentIds && scope.environmentIds == "all")
  ) {
    scopeEnvironments = environments;
  } else if (scope.envParentIds || scope.environmentIds) {
    scopeEnvironments = environments.filter(
      ({ envParentId, id }) =>
        (!scope.envParentIds ||
          scope.envParentIds == "all" ||
          scope.envParentIds.has(envParentId)) &&
        (!scope.environmentIds ||
          scope.environmentIds == "all" ||
          scope.environmentIds.has(id))
    );
  }

  let scopeGeneratedEnvkeys: Model.GeneratedEnvkey[] = [];
  if (
    (scope.envParentIds == "all" &&
      scope.environmentIds == "all" &&
      scope.keyableParentIds == "all") ||
    (!scope.envParentIds &&
      scope.environmentIds == "all" &&
      scope.keyableParentIds == "all") ||
    (!scope.envParentIds &&
      !scope.environmentIds &&
      scope.keyableParentIds == "all") ||
    (!scope.envParentIds && !scope.environmentIds && !scope.keyableParentIds)
  ) {
    scopeGeneratedEnvkeys = generatedEnvkeys;
  } else if (scope.keyableParentIds) {
    scopeGeneratedEnvkeys = generatedEnvkeys.filter(
      ({ appId, environmentId, keyableParentId, id }) =>
        (!scope.envParentIds ||
          scope.envParentIds == "all" ||
          scope.envParentIds.has(appId)) &&
        (!scope.environmentIds ||
          scope.environmentIds == "all" ||
          scope.environmentIds.has(environmentId)) &&
        (!scope.keyableParentIds ||
          scope.keyableParentIds == "all" ||
          scope.keyableParentIds.has(keyableParentId))
    );
  }

  return {
    scopeUsers,
    scopeDevices,
    scopeApps,
    scopeBlocks,
    scopeEnvironments,
    scopeGeneratedEnvkeys,
  };
};

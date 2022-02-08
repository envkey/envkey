import { Graph, Rbac, Model } from "../../types";
import { getOrg } from "./base";

export const getEnvironmentOrLocalsAutoCommitEnabled = (
  graph: Graph.Graph,
  environmentOrLocalsId: string
) => {
  let autoCommit: boolean | undefined;

  const org = getOrg(graph);
  let envParentId: string;
  const environment = graph[environmentOrLocalsId] as
    | Model.Environment
    | undefined;
  if (environment) {
    envParentId = environment.envParentId;
  } else {
    [envParentId] = environmentOrLocalsId.split("|");
  }
  const envParent = graph[envParentId] as Model.EnvParent;

  if (environment) {
    if (environment.isSub) {
      const parentEnvironment = graph[
        environment.parentEnvironmentId
      ] as Model.Environment;
      if (!parentEnvironment.isSub && parentEnvironment.settings?.autoCommit) {
        autoCommit = true;
      }
    } else if (environment.settings?.autoCommit) {
      autoCommit = true;
    }
  } else if (typeof envParent.settings.autoCommitLocals == "boolean") {
    autoCommit = envParent.settings.autoCommitLocals;
  }

  if (typeof autoCommit == "undefined") {
    if (environment) {
      const environmentRole = graph[
        environment.environmentRoleId
      ] as Rbac.EnvironmentRole;
      autoCommit = environmentRole.settings?.autoCommit ?? false;
    } else {
      autoCommit = org.settings.envs?.autoCommitLocals ?? false;
    }
  }

  return autoCommit;
};

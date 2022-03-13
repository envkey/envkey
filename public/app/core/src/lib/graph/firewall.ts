import { Graph, Model } from "../../types";
import { getOrg } from "./base";

export const getAppAllowedIps = (
  graph: Graph.Graph,
  appId: string,
  environmentRoleId: string
): string[] | undefined => {
  const org = getOrg(graph);
  const app = graph[appId] as Model.App;

  if (!app.environmentRoleIpsMergeStrategies) {
    return undefined;
  }

  const mergeStrategy =
    app.environmentRoleIpsMergeStrategies[environmentRoleId];

  // no entry for an app's environmentRoleIpsMergeStrategies means it inherits from org
  if (!mergeStrategy) {
    return org.environmentRoleIpsAllowed?.[environmentRoleId];
  } else if (mergeStrategy == "override") {
    return app.environmentRoleIpsAllowed?.[environmentRoleId];
  } else if (mergeStrategy == "extend") {
    if (!app.environmentRoleIpsAllowed) {
      return org.environmentRoleIpsAllowed?.[environmentRoleId];
    }

    const orgIps = org.environmentRoleIpsAllowed?.[environmentRoleId];

    if (!orgIps) {
      return undefined;
    }

    return [
      ...orgIps,
      ...(app.environmentRoleIpsAllowed[environmentRoleId] ?? []),
    ];
  }
};

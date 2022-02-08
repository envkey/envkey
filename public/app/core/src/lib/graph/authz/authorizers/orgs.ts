import { Graph } from "../../../../types";
import { hasAllOrgPermissions } from "./helpers";

export const canUpdateOrgSettings = (
    graph: Graph.Graph,
    currentUserId: string
  ) => hasAllOrgPermissions(graph, currentUserId, ["org_manage_settings"]),
  canRenameOrg = (graph: Graph.Graph, currentUserId: string) =>
    hasAllOrgPermissions(graph, currentUserId, ["org_rename"]),
  canDeleteOrg = (graph: Graph.Graph, currentUserId: string) =>
    hasAllOrgPermissions(graph, currentUserId, ["org_delete"]);

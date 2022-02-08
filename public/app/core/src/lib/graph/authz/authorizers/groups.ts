import { Graph } from "../../../../types";
import { hasOrgPermission } from "./helpers";

export const canManageUserGroups = (
  graph: Graph.Graph,
  currentUserId: string
) => hasOrgPermission(graph, currentUserId, "org_manage_teams");

export const canManageAppGroups = (graph: Graph.Graph, currentUserId: string) =>
  hasOrgPermission(graph, currentUserId, "org_manage_app_groups");

export const canManageBlockGroups = (
  graph: Graph.Graph,
  currentUserId: string
) => hasOrgPermission(graph, currentUserId, "org_manage_block_groups");

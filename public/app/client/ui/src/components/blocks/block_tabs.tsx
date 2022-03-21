import React, { useMemo, useCallback } from "react";
import { OrgComponentProps } from "@ui_types";
import { Model } from "@core/types";
import * as ui from "@ui";
import * as g from "@core/lib/graph";
import * as styles from "@styles";

export const useBlockTabs = (
  props: OrgComponentProps<{ orgId: string }>,
  blockId: string
) => {
  const { graph, graphUpdatedAt } = props.core;
  const block = graph[blockId] as Model.Block;
  const currentUserId = props.ui.loadedAccountId!;

  const [
    canReadVersions,
    canListOrgUserCollaborators,
    // canListEnvkeys,
    canListCliKeys,
    canReadLogs,
    canManageSettings,
  ] = useMemo(() => {
    // const blockPermissions = g.getConnectedAppPermissionsUnionForBlock(
    //   graph,
    //   block.id,
    //   currentUserId
    // );

    return [
      g.authz.canReadBlockVersions(graph, currentUserId, block.id),

      g.authz.canListBlockCollaborators(
        graph,
        currentUserId,
        block.id,
        "orgUser"
      ),

      // g.authz.hasOrgPermission(graph, currentUserId, "blocks_read_all") ||
      //   blockPermissions.has("app_manage_local_keys") ||
      //   blockPermissions.has("app_manage_servers"),

      g.authz.canListBlockCollaborators(
        graph,
        currentUserId,
        block.id,
        "cliUser"
      ),

      g.authz.hasOrgPermission(graph, currentUserId, "org_read_logs"),

      g.authz.hasOrgPermission(graph, currentUserId, "blocks_manage_settings"),
    ];
  }, [graphUpdatedAt, currentUserId, block.id]);

  const basePathTest = useCallback(() => {
    return block && props.location.pathname.endsWith(block.id);
  }, [props.location.pathname, block.id]);

  const tabs = [
    {
      label: "Environments",
      path: "/environments",
      permitted: () => true,
    },
    {
      label: "Apps",
      path: "/apps",
      permitted: () => true,
    },
    {
      path: "/apps-add",
      permitted: () => true,
      hidden: true,
    },
    {
      label: "Versions",
      path: "/versions",
      permitted: () => canReadVersions,
    },
    {
      label: "Logs",
      path: "/logs",
      permitted: () => canReadLogs,
    },

    {
      label: "Collaborators",
      path: "/collaborators",
      permitted: () => canListOrgUserCollaborators,
    },

    {
      label: "CLI Keys",
      path: "/cli-keys",
      permitted: () => canListCliKeys,
    },

    {
      label: "Settings",
      path: "/settings",
      permitted: () => canManageSettings,
    },
  ];

  return ui.useTabs(props, {
    tabs,
    redirectFromBasePath: true,
    basePathTest,
    className: styles.SelectedObjectTabs(1150),
    collapsible: true,
  });
};

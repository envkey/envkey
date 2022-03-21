import React, { useMemo, useCallback } from "react";
import { OrgComponentProps } from "@ui_types";
import { Model } from "@core/types";
import * as g from "@core/lib/graph";
import * as ui from "@ui";
import * as styles from "@styles";

export const useAppTabs = (
  props: OrgComponentProps<{ orgId: string }>,
  appId: string
) => {
  const app = props.core.graph[appId] as Model.App;
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const [
    canReadVersions,
    canListOrgUserCollaborators,
    canListEnvkeys,
    canListCliKeys,
    canReadLogs,
    canManageSettings,
    canManageFirewall,
  ] = useMemo(() => {
    return [
      g.authz.canReadAppVersions(graph, currentUserId, app.id),

      g.authz.canListAppCollaborators(graph, currentUserId, app.id, "orgUser"),

      g.authz.hasAnyAppPermissions(graph, currentUserId, app.id, [
        "app_manage_local_keys",
        "app_manage_servers",
      ]),

      g.authz.canListAppCollaborators(graph, currentUserId, app.id, "cliUser"),

      g.authz.hasAppPermission(graph, currentUserId, app.id, "app_read_logs"),

      g.authz.hasAppPermission(
        graph,
        currentUserId,
        app.id,
        "app_manage_settings"
      ),

      g.authz.hasAppPermission(
        graph,
        currentUserId,
        app.id,
        "app_manage_firewall"
      ),
    ];
  }, [graphUpdatedAt, currentUserId, app.id]);

  const basePathTest = useCallback(() => {
    return app && props.location.pathname.endsWith(app.id);
  }, [props.location.pathname, app.id]);

  const tabs = [
    {
      label: "Environments",
      path: "/environments",
      permitted: () => true,
    },
    {
      label: "ENVKEYs",
      path: "/envkeys",
      permitted: () => canListEnvkeys,
    },
    {
      label: "Collaborators",
      path: "/collaborators",
      permitted: () => canListOrgUserCollaborators,
    },
    {
      label: "Versions",
      path: `/versions`,
      permitted: () => canReadVersions,
    },
    {
      label: "Logs",
      path: `/logs`,
      permitted: () => canReadLogs,
    },
    {
      label: "CLI Keys",
      path: "/cli-keys",
      permitted: () => canListCliKeys,
    },
    {
      label: "Firewall",
      path: "/firewall",
      permitted: () => canManageFirewall,
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
    className: styles.SelectedObjectTabs(1250),
    collapsible: true,
  });
};

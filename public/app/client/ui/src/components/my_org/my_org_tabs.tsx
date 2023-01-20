import React, { useMemo, useCallback } from "react";
import { OrgComponentProps } from "@ui_types";
import * as ui from "@ui";
import * as g from "@core/lib/graph";
import * as styles from "@styles";

export const useMyOrgTabs = (props: OrgComponentProps<{ orgId: string }>) => {
  const graph = props.core.graph;
  const currentUserId = props.ui.loadedAccountId!;

  const [
    canManageSettings,
    canManageSSO,
    canGenRecoveryKey,
    canReadLogs,
    canManageBilling,
    canManageEnvironmentRoles,
    canImportExportArchive,
    canManageFirewall,
    canManageIntegrations,
  ] = useMemo(() => {
    const { org, license } = g.graphTypes(graph);

    return [
      g.authz.hasOrgPermission(graph, currentUserId, "org_manage_settings"),
      (org.ssoEnabled &&
        g.authz.hasOrgPermission(
          graph,
          currentUserId,
          "org_manage_auth_settings"
        )) ||
        false,
      g.authz.hasOrgPermission(
        graph,
        currentUserId,
        "org_generate_recovery_key"
      ),
      g.authz.hasAnyOrgPermissions(graph, currentUserId, [
        "org_read_logs",
        "self_hosted_read_host_logs",
      ]),
      g.authz.hasOrgPermission(graph, currentUserId, "org_manage_billing"),

      g.authz.hasOrgPermission(
        graph,
        currentUserId,
        "org_manage_environment_roles"
      ),

      g.authz.hasOrgPermission(
        graph,
        currentUserId,
        "org_archive_import_export"
      ),

      g.authz.hasOrgPermission(graph, currentUserId, "org_manage_firewall"),

      license.hostType == "cloud" &&
        g.authz.hasOrgPermission(
          graph,
          currentUserId,
          "org_manage_integrations"
        ),
    ];
  }, [props.core.graphUpdatedAt, currentUserId]);

  const basePathTest = useCallback(() => {
    return props.location.pathname.endsWith("/my-org");
  }, [props.location.pathname]);

  const tabs = [
    {
      label: "Settings",
      path: "/settings",
      permitted: () => canManageSettings,
    },
    {
      label: "Environments",
      path: "/environment-settings",
      permitted: () => canManageEnvironmentRoles,
    },
    {
      label: "Firewall",
      path: "/firewall",
      permitted: () => canManageFirewall,
    },
    {
      label: "SSO",
      path: "/sso",
      permitted: () => canManageSSO,
    },
    {
      label: "Billing",
      path: "/billing",
      permitted: () => canManageBilling,
    },
    {
      label: "Logs",
      path: "/logs",
      permitted: () => canReadLogs,
    },
    {
      label: "Recovery",
      path: "/recovery-key",
      permitted: () => canGenRecoveryKey,
    },
    {
      label: "Import/Export",
      path: "/archive",
      permitted: () => canImportExportArchive,
    },
    {
      label: "Integrations",
      path: "/integrations",
      permitted: () => canManageIntegrations,
    },
  ];

  return ui.useTabs(props, {
    tabs,
    redirectFromBasePath: true,
    basePathTest,
    className: styles.SelectedObjectTabs(1200),
    collapsible: true,
  });
};

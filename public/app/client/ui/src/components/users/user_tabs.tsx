import React, { useMemo, useCallback } from "react";
import { OrgComponentProps } from "@ui_types";
import { Model } from "@core/types";
import * as ui from "@ui";
import * as g from "@core/lib/graph";
import * as styles from "@styles";

export const useUserTabs = (
  props: OrgComponentProps<{ orgId: string }>,
  userId: string
) => {
  const { graph, graphUpdatedAt } = props.core;
  const user = graph[userId] as Model.OrgUser | Model.CliUser | undefined;
  const currentUserId = props.ui.loadedAccountId!;
  const now = props.ui.now;

  const [
    canManageSettings,
    canListApps,
    canListBlocks,
    canManageTeams,
    canReadLogs,
  ] = useMemo(() => {
    if (!user) {
      return [false, false, false, false, false];
    }

    const { org } = g.graphTypes(graph);

    return [
      user.type == "orgUser"
        ? g.authz.canManageOrgUser(graph, currentUserId, user.id)
        : g.authz.canManageCliUser(graph, currentUserId, user.id),
      g.authz.canListAppsForUser(graph, currentUserId, user.id),
      g.authz.canListBlocksForUser(graph, currentUserId, user.id),
      user.type == "orgUser" &&
        (org.teamsEnabled ?? false) &&
        g.authz.canManageUserGroups(graph, currentUserId),
      g.authz.hasOrgPermission(graph, currentUserId, "org_read_logs"),
    ];
  }, [graphUpdatedAt, currentUserId, user?.id]);

  const canManageDevices = useMemo(
    () =>
      user
        ? g.authz.canManageAnyUserDevicesOrGrants(graph, currentUserId, user.id)
        : false,
    [graphUpdatedAt, currentUserId, user?.id, now]
  );

  const basePathTest = useCallback(() => {
    return user ? props.location.pathname.endsWith(user.id) : false;
  }, [props.location.pathname, user?.id]);

  const tabs = [
    {
      label: "Settings",
      path: "/settings",
      permitted: () => canManageSettings,
    },
    {
      label: "Devices",
      path: "/devices",
      permitted: () => canManageDevices,
    },
    {
      label: "Teams",
      path: "/teams",
      permitted: () => canManageTeams,
    },

    {
      path: "/teams-add",
      hidden: true,
      permitted: () => canManageTeams,
    },
    {
      label: "Apps",
      path: "/apps",
      permitted: () => canListApps,
    },
    {
      path: "/apps-add",
      hidden: true,
      permitted: () => canListApps,
    },

    {
      label: "Blocks",
      path: "/blocks",
      permitted: () => canListBlocks,
    },

    {
      label: "Logs",
      path: "/logs",
      permitted: () => canReadLogs,
    },
  ];

  return ui.useTabs(props, {
    tabs,
    redirectFromBasePath: true,
    basePathTest,
    className: styles.SelectedObjectTabs(user?.type == "orgUser" ? 1100 : 950),
    collapsible: true,
  });
};

import React, { useMemo, useCallback } from "react";
import { OrgComponentProps } from "@ui_types";
import { Model } from "@core/types";
import * as g from "@core/lib/graph";
import * as ui from "@ui";
import * as styles from "@styles";
import { style } from "typestyle";

export const useAppCollaboratorsTabs = (
  props: OrgComponentProps<{ orgId: string }>,
  appId: string
) => {
  const app = props.core.graph[appId] as Model.App;
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const canManageTeams = useMemo(() => {
    return g.authz.canManageUserGroups(graph, currentUserId);
  }, [graphUpdatedAt, currentUserId, app.id]);

  const basePathTest = useCallback(() => {
    return props.location.pathname.endsWith("/collaborators");
  }, [props.location.pathname]);

  const tabs = [
    {
      label: "People",
      path: "/list",
      permitted: () => true,
    },
    {
      label: "Teams",
      path: `/teams`,
      permitted: () => canManageTeams,
    },
    {
      path: "/list/add",
      hidden: true,
      permitted: () => true,
    },
  ];

  return ui.useTabs(props, {
    tabs,
    redirectFromBasePath: true,
    basePathTest,
    // hide these tabs until groups are implemented
    className: styles.SelectedObjectTabs + " " + style({ display: "none" }),
  });
};

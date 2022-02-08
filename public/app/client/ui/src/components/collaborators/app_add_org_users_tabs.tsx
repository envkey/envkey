import React, { useMemo, useCallback } from "react";
import { OrgComponentProps } from "@ui_types";
import { Model } from "@core/types";
import * as g from "@core/lib/graph";
import * as ui from "@ui";
import * as styles from "@styles";

export const useAppAddOrgUsersTabs = (
  props: OrgComponentProps<{ orgId: string }>,
  appId: string
) => {
  const app = props.core.graph[appId] as Model.App;
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const canInvite = useMemo(() => {
    return g.authz.canInviteToApp(graph, currentUserId, app.id);
  }, [graphUpdatedAt, currentUserId, app.id]);

  const basePathTest = useCallback(() => {
    return props.location.pathname.endsWith("/add");
  }, [props.location.pathname]);

  const tabs = [
    {
      label: "Add Existing",
      path: "/existing",
      permitted: () =>
        g.authz.getAccessGrantableOrgUsersForApp(
          graph,
          currentUserId,
          app.id,
          props.ui.now
        ).length > 0,
    },
    {
      label: "Invite New",
      path: `/invite-users`,
      permitted: () => canInvite,
    },
  ];

  return ui.useTabs(props, {
    tabs,
    redirectFromBasePath: true,
    basePathTest,
    className: styles.SelectedObjectSubTabs + " add",
  });
};

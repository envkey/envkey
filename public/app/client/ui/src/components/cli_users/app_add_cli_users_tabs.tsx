import React, { useMemo, useCallback } from "react";
import { OrgComponentProps } from "@ui_types";
import { Model } from "@core/types";
import * as g from "@core/lib/graph";
import * as ui from "@ui";
import * as styles from "@styles";

export const useAppAddCliUsersTabs = (
  props: OrgComponentProps<{ orgId: string }>,
  appId: string
) => {
  const app = props.core.graph[appId] as Model.App;
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const canCreate = useMemo(() => {
    return g.authz.canCreateCliUserForApp(graph, currentUserId, app.id);
  }, [graphUpdatedAt, currentUserId, app.id]);

  const basePathTest = useCallback(() => {
    return props.location.pathname.endsWith("/add");
  }, [props.location.pathname]);

  const tabs = [
    {
      label: "Add Existing CLI Keys",
      path: "/existing",
      permitted: () =>
        g.authz.getAccessGrantableCliUsersForApp(graph, currentUserId, app.id)
          .length > 0,
    },
    {
      label: "Create New CLI Key",
      path: `/new-cli-key`,
      permitted: () => canCreate,
    },
  ];

  return ui.useTabs(props, {
    tabs,
    redirectFromBasePath: true,
    basePathTest,
    className: styles.SelectedObjectSubTabs,
  });
};

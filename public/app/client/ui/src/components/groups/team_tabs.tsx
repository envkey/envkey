import React, { useMemo, useCallback } from "react";
import { OrgComponentProps } from "@ui_types";
import { Model } from "@core/types";
import * as g from "@core/lib/graph";
import * as ui from "@ui";
import * as styles from "@styles";

export const useTeamTabs = (
  props: OrgComponentProps<{ orgId: string }>,
  groupId: string
) => {
  const team = props.core.graph[groupId] as Model.Group;

  const basePathTest = useCallback(() => {
    return team && props.location.pathname.endsWith(team.id);
  }, [props.location.pathname, team.id]);

  const tabs = [
    {
      label: "Members",
      path: "/members",
      permitted: () => true,
    },

    {
      label: "Apps",
      path: "/apps",
      permitted: () => true,
    },

    {
      label: "Settings",
      path: "/settings",
      permitted: () => true,
    },

    {
      path: "/apps-add",
      hidden: true,
      permitted: () => true,
    },

    {
      path: "/members-add",
      hidden: true,
      permitted: () => true,
    },
  ];

  return ui.useTabs(props, {
    tabs,
    redirectFromBasePath: true,
    basePathTest,
    className: styles.SelectedObjectTabs(),
  });
};

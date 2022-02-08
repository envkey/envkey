import React, { useEffect, useState } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Rbac } from "@core/types";
import { useTeamTabs } from "./team_tabs";
import * as g from "@core/lib/graph";
import * as styles from "@styles";
import { SvgImage } from "@images";

export const TeamContainer: OrgComponent<{ groupId: string }> = (props) => {
  const { graph } = props.core;
  const groupId = props.routeParams.groupId;
  const team = graph[groupId] as Model.App;
  const currentUserId = props.ui.loadedAccountId!;
  const currentUser = graph[currentUserId] as Model.OrgUser;

  const { shouldRedirect, tabsComponent } = useTeamTabs(props, groupId);

  if (!team || shouldRedirect) {
    return <div></div>;
  }

  return (
    <div className={styles.SelectedObjectContainer}>
      <header className={styles.SelectedObjectHeader}>
        <h1>
          <span>
            Team
            <SvgImage type="right-caret" />
          </span>
          <label>{team.name}</label>
        </h1>

        {tabsComponent}
      </header>
    </div>
  );
};

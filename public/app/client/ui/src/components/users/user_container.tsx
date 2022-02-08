import React from "react";
import { OrgComponent } from "@ui_types";
import { Model } from "@core/types";
import { useUserTabs } from "./user_tabs";
import * as g from "@core/lib/graph";
import * as styles from "@styles";
import { SvgImage } from "@images";

export const UserContainer: OrgComponent<{ userId: string }> = (props) => {
  const userId = props.routeParams.userId;
  const user = props.core.graph[userId] as
    | Model.OrgUser
    | Model.CliUser
    | undefined;

  const { shouldRedirect, tabsComponent } = useUserTabs(props, userId);

  if (!user || shouldRedirect) {
    return <div />;
  }

  return (
    <div className={styles.SelectedObjectContainer}>
      <header className={styles.SelectedObjectHeader}>
        <h1>
          <span>
            {user.type == "orgUser" ? "User" : "CLI Key"}{" "}
            <SvgImage type="right-caret" />
          </span>
          <label>{g.getUserName(props.core.graph, user.id)}</label>
        </h1>

        {tabsComponent}
      </header>
    </div>
  );
};

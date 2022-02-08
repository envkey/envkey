import React from "react";
import { OrgComponent } from "@ui_types";
import { Model } from "@core/types";
import { useMyOrgTabs } from "./my_org_tabs";
import * as styles from "@styles";
import { SvgImage } from "@images";

export const MyOrgContainer: OrgComponent = (props) => {
  const org = props.core.graph[props.routeParams.orgId] as Model.Org;

  const { shouldRedirect, tabsComponent } = useMyOrgTabs(props);

  if (shouldRedirect) {
    return <div></div>;
  }

  return (
    <div className={styles.SelectedObjectContainer}>
      <header className={styles.SelectedObjectHeader}>
        <h1>
          <span>
            Org
            <SvgImage type="right-caret" />
          </span>
          <label>{org.name}</label>
        </h1>

        {tabsComponent}
      </header>
    </div>
  );
};

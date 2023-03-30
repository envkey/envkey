import React from "react";
import { OrgComponent } from "@ui_types";
import { AccountMenu } from "./account_menu";
import { SearchTree } from "./search_tree";
import * as styles from "@styles";
import { SvgImage } from "@images";

export const Sidebar: OrgComponent = (props) => {
  return (
    <div className={styles.SidebarContainer}>
      <AccountMenu {...props} />
      <SearchTree {...props} defaultExpandTopLevel />
    </div>
  );
};

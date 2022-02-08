import React, { useState } from "react";
import { EnvManagerComponent } from "@ui_types";
import { EntryForm } from "./entry_form";
import { ConnectBlocks } from "./connect_blocks";
import * as g from "@core/lib/graph";
import * as styles from "@styles";
import { style } from "typestyle";

type AddTabType = "add-var" | "connect-blocks";

export const AddTabs: EnvManagerComponent = (props) => {
  const { graph } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const [selectedTab, setSelectedTab] = useState<AddTabType>("add-var");

  const subListWidth = props.entryColWidth * 1.1666;
  const subStyle = style({
    left: styles.layout.SIDEBAR_WIDTH + subListWidth,
    width: `calc(100% - ${styles.layout.SIDEBAR_WIDTH + subListWidth}px)`,
  });

  return (
    <div
      className={
        styles.EnvAddForm +
        " " +
        (props.isSub ? subStyle : "") +
        " env-add-form"
      }
    >
      <div className="tabs">
        <span
          className={selectedTab == "add-var" ? "selected" : ""}
          onClick={() => setSelectedTab("add-var")}
        >
          Add Variable
        </span>

        {props.envParentType == "app" &&
        g.authz.hasAppPermission(
          props.core.graph,
          currentUserId,
          props.envParentId,
          "app_manage_blocks"
        ) ? (
          <span
            className={selectedTab == "connect-blocks" ? "selected" : ""}
            onClick={() => setSelectedTab("connect-blocks")}
          >
            Connect Blocks
          </span>
        ) : (
          ""
        )}
      </div>

      {selectedTab == "add-var" ? <EntryForm {...props} /> : ""}
      {selectedTab == "connect-blocks" ? <ConnectBlocks {...props} /> : ""}
    </div>
  );
};

import React, { useState } from "react";
import { OrgComponent } from "@ui_types";
import { Client, Rbac, Model } from "@core/types";
import * as R from "ramda";
import * as ui from "@ui";
import { SvgImage } from "@images";
import * as styles from "@styles";
import { style } from "typestyle";

export const AddInviteTeams: OrgComponent<
  {},
  {
    grantableUserGroupIds: string[];
    userGroupIds: string[];
    onClose: () => any;
    onSubmit: (userGroupIds: string[]) => any;
  }
> = (props) => {
  const { graph } = props.core;
  const userGroupIdSet = new Set(props.userGroupIds);

  return (
    <div className={styles.OrgContainer + " " + styles.Modal}>
      <div className="overlay" onClick={props.onClose}>
        <span className="back">
          <span>← Back</span>
        </span>
      </div>

      <div className="modal">
        <h4>Add To Teams</h4>
        <div className="field no-margin">
          <ui.CheckboxMultiSelect
            title="Team"
            winHeight={props.winHeight}
            maxHeight={
              props.winHeight - (styles.layout.MAIN_HEADER_HEIGHT + 405)
            }
            emptyText="This person can't be added to any teams."
            items={props.grantableUserGroupIds
              .filter((id) => !userGroupIdSet.has(id))
              .map((id) => {
                const team = graph[id] as Model.Group;
                return {
                  id: team.id,
                  searchText: team.name,
                  label: team.name,
                };
              })}
            onSubmit={(ids) => {
              props.onSubmit(ids);
            }}
          />
        </div>
      </div>
    </div>
  );
};

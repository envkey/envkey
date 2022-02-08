import React, { useState } from "react";
import { OrgComponent } from "@ui_types";
import { Client, Rbac, Model } from "@core/types";
import * as R from "ramda";
import * as ui from "@ui";
import { SvgImage } from "@images";
import * as styles from "@styles";
import { style } from "typestyle";

export const AddInviteAppForm: OrgComponent<
  {},
  {
    grantableAppIds: string[];
    grantableAppRoleIdsByAppId: Record<string, string[]>;

    appUserGrantsByAppId: Record<
      string,
      Required<Client.PendingInvite>["appUserGrants"][0]
    >;

    onClose: () => any;

    onSubmit: (appRoleId: string, appIds: string[]) => any;
  }
> = (props) => {
  const { graph } = props.core;

  const grantableAppRoleIds = R.uniq(
    R.flatten(Object.values(props.grantableAppRoleIdsByAppId))
  );

  const [selectedAppRoleId, setSelectedAppRoleId] = useState(
    grantableAppRoleIds[grantableAppRoleIds.length - 1]
  );

  const renderAppRoleSelect = () => {
    if (grantableAppRoleIds.length == 0) {
      return;
    }

    return (
      <div className="select">
        <select
          value={selectedAppRoleId}
          onChange={(e) => setSelectedAppRoleId(e.target.value)}
        >
          {grantableAppRoleIds.map((appRoleId) => {
            const appRole = graph[appRoleId] as Rbac.AppRole;
            return <option value={appRoleId}>{appRole.name}</option>;
          })}
        </select>
        <SvgImage type="down-caret" />
      </div>
    );
  };

  return (
    <div className={styles.OrgContainer + " " + styles.Modal}>
      <div className="overlay" onClick={props.onClose}>
        <span className="back">
          <span>← Back</span>
        </span>
      </div>

      <div className="modal">
        <h4>Grant Access To Apps</h4>
        <div className="field app-role">
          <label>
            App Role <ui.RoleInfoLink {...props} roleType="appRoles" />
          </label>
          {renderAppRoleSelect()}
        </div>

        <div className="field no-margin">
          <label>Apps To Add</label>

          <ui.CheckboxMultiSelect
            title="App"
            winHeight={props.winHeight}
            maxHeight={
              props.winHeight - (styles.layout.MAIN_HEADER_HEIGHT + 405)
            }
            emptyText="No apps can be granted with this App Role. Try a different role."
            items={props.grantableAppIds
              .filter(
                (appId) =>
                  !(
                    props.appUserGrantsByAppId[appId]?.appRoleId ==
                    selectedAppRoleId
                  )
              )
              .map((appId) => {
                const app = graph[appId] as Model.App;
                const existingRoleId =
                  props.appUserGrantsByAppId[appId]?.appRoleId;
                const existingRole = existingRoleId
                  ? (graph[existingRoleId] as Rbac.AppRole)
                  : undefined;
                return {
                  id: app.id,
                  searchText: app.name,
                  label: (
                    <label>
                      {app.name}{" "}
                      {existingRole ? (
                        <span className="small">
                          Pending Role: {existingRole.name}
                        </span>
                      ) : (
                        ""
                      )}
                    </label>
                  ),
                };
              })}
            onSubmit={(ids) => {
              props.onSubmit(selectedAppRoleId, ids);
            }}
          />
        </div>
      </div>
    </div>
  );
};

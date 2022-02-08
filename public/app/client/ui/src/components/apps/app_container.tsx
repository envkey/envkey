import React, { useEffect, useState } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Rbac } from "@core/types";
import { useAppTabs } from "./app_tabs";
import * as g from "@core/lib/graph";
import * as styles from "@styles";
import { SvgImage } from "@images";

let initialAppRole: Rbac.AppRole | undefined;
let initialAppPermissionsJson: string | undefined;
let initialOrgRoleId: string | undefined;
let initialOrgPermissionsJson: string | undefined;

export const AppContainer: OrgComponent<{ appId: string }> = (props) => {
  const { graph } = props.core;
  const appId = props.routeParams.appId;
  const app = graph[appId] as Model.App;
  const currentUserId = props.ui.loadedAccountId!;
  const currentUser = graph[currentUserId] as Model.OrgUser;
  const appRole = g.getAppRoleForUserOrInvitee(graph, app.id, currentUserId);
  const orgRole = graph[currentUser.orgRoleId] as Rbac.OrgRole;
  const appPermissionsJson = JSON.stringify(
    app
      ? Array.from(
          g.getEnvParentPermissions(graph, app.id, currentUserId)
        ).sort()
      : []
  );
  const orgPermissionsJson = JSON.stringify(
    Array.from(g.getOrgPermissions(graph, orgRole.id)).sort()
  );

  const { shouldRedirect, tabsComponent } = useAppTabs(props, appId);

  useEffect(() => {
    if (shouldRedirect) {
      return;
    }
    initialOrgRoleId = orgRole.id;
    initialAppRole = appRole;
    initialAppPermissionsJson = appPermissionsJson;
    initialOrgPermissionsJson = orgPermissionsJson;
  }, [app?.id]);

  useEffect(() => {
    if (shouldRedirect) {
      return;
    }
    if (
      initialOrgRoleId == orgRole.id &&
      orgPermissionsJson == initialOrgPermissionsJson &&
      appRole &&
      appRole.id != initialAppRole?.id
    ) {
      alert(
        "Your role in this app has been changed. Your role is now: " +
          appRole.name
      );
    } else if (
      initialOrgRoleId == orgRole.id &&
      orgPermissionsJson == initialOrgPermissionsJson &&
      initialAppPermissionsJson != appPermissionsJson
    ) {
      alert("Your permissions for this app have been updated.");
    }

    initialOrgRoleId = orgRole.id;
    initialAppRole = appRole;
    initialAppPermissionsJson = appPermissionsJson;
    initialOrgPermissionsJson = orgPermissionsJson;
  }, [appRole?.id, appPermissionsJson, orgRole.id, orgPermissionsJson]);

  if (!app || shouldRedirect) {
    return <div></div>;
  }

  return (
    <div className={styles.SelectedObjectContainer}>
      <header className={styles.SelectedObjectHeader}>
        <h1>
          <span>
            App
            <SvgImage type="right-caret" />
          </span>
          <label>{app.name}</label>
        </h1>

        {tabsComponent}
      </header>
    </div>
  );
};

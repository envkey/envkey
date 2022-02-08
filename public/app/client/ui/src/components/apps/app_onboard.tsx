import React, { useMemo } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Rbac } from "@core/types";
import * as styles from "@styles";
import * as g from "@core/lib/graph";
import { SvgImage } from "@images";
import { style } from "typestyle";

export const AppOnboard: OrgComponent<{}, { appId: string }> = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  // const { canManageLocalKeys, canManageAppSettings } = useMemo(() => {
  //   return {
  //     canManageLocalKeys: g.authz.hasAppPermission(
  //       graph,
  //       currentUserId,
  //       props.appId,
  //       "app_manage_local_keys"
  //     ),
  //     canManageAppSettings: g.authz.canUpdateAppSettings(
  //       graph,
  //       currentUserId,
  //       props.appId
  //     ),
  //   };
  // }, [graphUpdatedAt]);
  // const { org } = g.graphTypes(graph);

  // const user = graph[currentUserId] as Model.OrgUser;

  // const orgRole = graph[user.orgRoleId] as Rbac.OrgRole;
  // const appRole = (
  //   orgRole.autoAppRoleId
  //     ? graph[orgRole.autoAppRoleId]
  //     : g.getAppRoleForUserOrInvitee(graph, props.appId)
  // ) as Rbac.AppRole;

  // const { canManageOrgUsers, canManageCliUsers, hasFullPermissions } =
  //   useMemo(() => {
  //     const appPermissions = g.getAppPermissions(graph, appRole.id);
  //     const allAppPermissions = Object.keys(Rbac.appPermissions);

  //     const hasFullPermissions =
  //       appRole.hasFullEnvironmentPermissions &&
  //       appPermissions &&
  //       appPermissions.size == allAppPermissions.length;

  //     return {
  //       canManageOrgUsers: g.authz.hasOrgPermission(
  //         graph,
  //         currentUserId,
  //         "org_manage_users"
  //       ),
  //       canManageCliUsers: g.authz.hasOrgPermission(
  //         graph,
  //         currentUserId,
  //         "org_manage_cli_users"
  //       ),
  //       hasFullPermissions,
  //     };
  //   }, [graphUpdatedAt]);

  return (
    <div
      className={
        styles.OnboardHelp +
        " onboard-app " +
        style({
          boxShadow:
            g.getConnectedBlocksForApp(graph, props.appId).length > 0
              ? "0 0 0 1px rgba(0,0,0,0.1)"
              : undefined,
        })
      }
    >
      <span
        className="close"
        onClick={() => {
          props.setUiState({ closedOnboardApp: true });
        }}
      >
        <SvgImage type="x" />
      </span>

      <p>
        This is the <span className="tab">Environments</span> tab. Here you can
        view, add, or update this app's <strong>environment variables.</strong>
      </p>

      <p>
        To set a new variable, click the{" "}
        <span className="add-button">
          <SvgImage type="add" />
        </span>{" "}
        button above.
      </p>

      <p>
        When you make a change, <strong>it won't be saved immediately.</strong>{" "}
        Instead, you'll see a bar at the bottom of the screen showing pending
        changes across all apps, blocks, and environments. From there, you can
        review, reset, or commit your changes.
      </p>
    </div>
  );
};

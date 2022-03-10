import React from "react";
import { OrgComponent } from "@ui_types";
import { Link } from "react-router-dom";
import { Client, Model, Rbac } from "@core/types";
import * as g from "@core/lib/graph";
import { LockLink } from "@ui";
import { style } from "typestyle";
import { logAndAlertError } from "@ui_lib/errors";

export const MainNav: OrgComponent = (props) => {
  const { ui, core, orgRoute, setUiState, dispatch } = props;
  const { graph } = core;
  const currentUserId = ui.loadedAccountId!;
  const currentUser = graph[currentUserId] as Model.OrgUser;
  const currentOrg = g.getOrg(graph);
  const currentOrgRole = graph[currentUser.orgRoleId] as Rbac.OrgRole;

  const navSection = (
    items: ([JSX.Element] | [JSX.Element, boolean])[],
    minItems = 1
  ) => {
    const toRender = items.filter(
      ([, cond]) => cond === true || typeof cond == "undefined"
    );
    if (toRender.length >= minItems) {
      return (
        <ul
          className={style({
            listStyle: "none",
            margin: [0, 0, 10],
            padding: 0,
          })}
        >
          {toRender.map(([el]) => el)}
        </ul>
      );
    }
  };

  return (
    <div>
      {navSection(
        [
          [
            <li
              key="all"
              onClick={() => setUiState({ selectedCategoryFilter: "all" })}
            >
              All
            </li>,
          ],
          [
            <li
              key="apps"
              onClick={() => setUiState({ selectedCategoryFilter: "apps" })}
            >
              Apps
            </li>,
          ],
          [
            <li
              key="blocks"
              onClick={() => setUiState({ selectedCategoryFilter: "blocks" })}
            >
              Blocks
            </li>,
            g.authz.hasOrgPermission(graph, currentUserId, "blocks_read_all") ||
              g.graphTypes(graph).blocks.length > 0,
          ],
          [
            <li
              key="users"
              onClick={() => setUiState({ selectedCategoryFilter: "orgUsers" })}
            >
              Users
            </li>,
            g.authz.hasOrgPermission(graph, currentUserId, "org_manage_users"),
          ],
          [
            <li
              key="cliUsers"
              onClick={() => setUiState({ selectedCategoryFilter: "cliUsers" })}
            >
              CLI Keys
            </li>,
            g.authz.hasOrgPermission(
              graph,
              currentUserId,
              "org_manage_cli_users"
            ),
          ],
        ],
        3
      )}

      {navSection([
        [
          <li key="new-app">
            <Link to={orgRoute("/new-app")}>New App</Link>
          </li>,
          g.authz.canCreateApp(graph, currentUserId),
        ],
        [
          <li key="new-block">
            <Link to={orgRoute("/new-block")}>New Block</Link>
          </li>,
          g.authz.canCreateBlock(graph, currentUserId),
        ],
        [
          <li key="invite-users">
            <Link to={orgRoute("/invite-users")}>Invite Users</Link>
          </li>,
          g.authz.canInviteAny(graph, currentUserId),
        ],
        [
          <li key="new-cli-key">
            <Link to={orgRoute("/new-cli-key")}>New CLI Key</Link>
          </li>,
          g.authz.canCreateAnyCliUser(graph, currentUserId),
        ],
        [
          <li key="devices">
            <Link to={orgRoute("/devices")}>Authorize Devices</Link>
          </li>,
          g.authz.canManageAnyDevicesOrGrants(graph, currentUserId, Date.now()),
        ],
      ])}

      {navSection([
        [
          <li key="my-org">
            <Link to={orgRoute("/my-org/settings")}>My Org</Link>
          </li>,
          g.authz.hasOrgPermission(graph, currentUserId, "org_manage_settings"),
        ],
        [
          <li key="billing">
            <Link to={orgRoute("/my-org/billing")}>Billing</Link>
          </li>,
          g.authz.hasOrgPermission(graph, currentUserId, "org_manage_billing"),
        ],
      ])}

      {navSection([
        [
          <li key="select-account">
            <Link to="/select-account">Switch Account</Link>
          </li>,
          Object.keys(core.orgUserAccounts).length > 1,
        ],
        [
          <li key="accept-invite">
            <Link to="/accept-invite">Accept Invite</Link>
          </li>,
        ],
        [
          <li key="create-org">
            <Link to="/create-org">Create New Org</Link>
          </li>,
        ],
      ])}

      {navSection([
        [
          <li key="device-settings">
            <Link to="/device-settings">Device Settings</Link>
          </li>,
        ],
        [
          <li key="lock">
            <LockLink {...props}>Lock Device</LockLink>
          </li>,
        ],

        [
          <li key="sign-out">
            <Link
              to="/home"
              onClick={() =>
                dispatch({
                  type: Client.ActionType.SIGN_OUT,
                  payload: { accountId: ui.loadedAccountId! },
                }).then((res) => {
                  if (!res.success) {
                    logAndAlertError(
                      `There was a problem signing out.`,
                      res.resultAction
                    );
                  }
                })
              }
            >
              Sign Out
            </Link>
          </li>,
        ],
      ])}
    </div>
  );
};

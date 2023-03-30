import React, { useState, useEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Link } from "react-router-dom";
import { Client, Model, Rbac } from "@core/types";
import * as g from "@core/lib/graph";
import { LockLink } from "@ui";
import { SvgImage } from "@images";
import * as styles from "@styles";
import { logAndAlertError } from "@ui_lib/errors";
import { style } from "typestyle";

const CLASS_NAME = "account-menu";

export const AccountMenu: OrgComponent = (props) => {
  const { ui, core, orgRoute, setUiState, dispatch } = props;
  const { graph } = core;
  const currentUserId = ui.loadedAccountId!;
  const currentUser = graph[currentUserId] as Model.OrgUser;
  const currentOrg = g.getOrg(graph);
  const currentOrgRole = graph[currentUser.orgRoleId] as Rbac.OrgRole;

  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      const expandedMenu = (e.target as HTMLElement).closest(`.${CLASS_NAME}`);
      if (expandedMenu) {
        return;
      }
      setExpanded(false);
    };

    document.documentElement.addEventListener("click", fn);
    return () => {
      document.documentElement.removeEventListener("click", fn);
    };
  }, []);

  const navSection = (
    items: ([JSX.Element] | [JSX.Element, boolean])[],
    minItems = 1
  ) => {
    const toRender = items.filter(
      ([, cond]) => cond === true || typeof cond == "undefined"
    );
    if (toRender.length >= minItems) {
      return <ul>{toRender.map(([el]) => el)}</ul>;
    }
  };

  const accountMenu = (
    <div
      className={styles.ExpandedAccountMenu + (expanded ? " expanded" : "")}
      onClick={() => setExpanded(false)}
    >
      <section
        className={styles.ExpandedAccountMenuSummary}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="user-name">
          <label>{g.getUserName(graph, currentUser.id)}</label>
        </div>
        <div className="org-name">
          <label>{currentOrgRole.name}</label>
        </div>
      </section>

      {navSection([
        [
          <li key="my-org">
            <Link to={orgRoute("/my-org")}>My Org</Link>
          </li>,
          g.authz.hasAnyOrgPermissions(graph, currentUserId, [
            "org_manage_settings",
            "org_generate_recovery_key",
            "org_read_logs",
            "self_hosted_read_host_logs",
            "org_manage_billing",
          ]),
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
        [
          <li key="recover">
            <Link to="/redeem-recovery-key">Recover An Account</Link>
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
                      (res.resultAction as any)?.payload
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

      <div
        className={
          "report-problem " +
          style({
            bottom:
              (props.hasPendingEnvUpdates
                ? styles.layout.DEFAULT_PENDING_FOOTER_HEIGHT
                : 0) +
              (props.startedUpgrade
                ? styles.layout.DEFAULT_PENDING_FOOTER_HEIGHT
                : 0),
            borderBottom: props.hasPendingEnvUpdates
              ? `1px solid rgba(255,255,255,0.2)`
              : "none",
          })
        }
        onClick={(e) => {
          e.stopPropagation();
          props.setUiState({
            reportErrorOpen: true,
          });
        }}
      >
        <SvgImage type="megaphone" />
        <label>Report a problem</label>
      </div>
    </div>
  );

  return (
    <div
      className={
        CLASS_NAME +
        " " +
        (props.hasPendingEnvUpdates && props.startedUpgrade
          ? style({
              $nest: {
                "@media screen and (max-height: 660px)": {
                  $nest: {
                    ".report-problem": {
                      display: "none",
                    },
                  },
                },
              },
            })
          : "")
      }
    >
      <div
        className={
          styles.AccountMenu + " has-tooltip " + (expanded ? " expanded" : "")
        }
        onClick={() => setExpanded(!expanded)}
      >
        <label>{currentOrg.name}</label>
        <SvgImage type="down-caret" />
        {expanded ? (
          <span className="tooltip">Click again to close settings menu</span>
        ) : (
          <span className="tooltip">Org, account, and device settings</span>
        )}
      </div>
      {accountMenu}
    </div>
  );
};

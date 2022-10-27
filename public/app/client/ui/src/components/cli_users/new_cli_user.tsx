import React, { useState, useMemo, useLayoutEffect } from "react";
import { Link } from "react-router-dom";
import { OrgComponent } from "@ui_types";
import { Rbac, Model, Client } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import * as ui from "@ui";
import { cliUserRoute } from "./helpers";
import * as styles from "@styles";
import { style } from "typestyle";
import { SmallLoader, SvgImage } from "@images";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { wait } from "@core/lib/utils/wait";
import { logAndAlertError } from "@ui_lib/errors";
import { AddInviteAppForm } from "../invites/add_invite_app_form";

export const NewCliUser: OrgComponent<{
  appId?: string;
}> = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;
  const appId = props.routeParams.appId;

  const [name, setName] = useState("");

  const [generating, setGenerating] = useState(false);
  const [awaitingMinDelay, setAwaitingMinDelay] = useState(false);
  const [showAddApps, setShowAddApps] = useState(false);

  useLayoutEffect(() => {
    if (props.core.generatedCliUsers.length > 0 && !awaitingMinDelay) {
      props.history.push(cliUserRoute(props, "/new-cli-key/generated"));
    }
  }, [props.core.generatedCliUsers.length > 0, awaitingMinDelay]);

  const [validOrgRoleIds, grantableAppIds, license, numActive] = useMemo(() => {
    let grantableAppIds = g.authz
      .getAccessGrantableApps(graph, currentUserId)
      .map(R.prop("id"));
    if (appId) {
      grantableAppIds = [appId, ...R.without([appId], grantableAppIds)];
    }

    const { license, org } = g.graphTypes(graph);

    return [
      g.authz
        .getCliUserCreatableOrgRoles(graph, currentUserId)
        .map(R.prop("id")),
      grantableAppIds,
      license,
      org.deviceLikeCount,
    ];
  }, [graphUpdatedAt, currentUserId]);

  const [orgRoleId, setOrgRoleId] = useState(
    validOrgRoleIds[validOrgRoleIds.length - 1]
  );

  const grantableAppRoleIdsByAppId = useMemo(
    () =>
      R.mergeAll(
        grantableAppIds.map((id) => ({
          [id]: g.authz
            .getAccessGrantableAppRolesForOrgRole(
              graph,
              currentUserId,
              id,
              orgRoleId
            )
            .map(R.prop("id")),
        }))
      ),
    [graphUpdatedAt, currentUserId, grantableAppIds, orgRoleId]
  );

  const defaultAppUserGrants: Required<Client.PendingInvite["appUserGrants"]> =
    appId
      ? [
          {
            appId,
            appRoleId: R.last(grantableAppRoleIdsByAppId[appId])!,
          },
        ]
      : [];

  const [appUserGrantsByAppId, setAppUserGrantsByAppId] = useState<
    Record<string, Required<Client.PendingInvite>["appUserGrants"][0]>
  >(R.indexBy(R.prop("appId"), defaultAppUserGrants));

  const canSubmit = !generating && name && orgRoleId;

  const onSubmit = () => {
    if (!canSubmit) {
      return;
    }

    setGenerating(true);
    setAwaitingMinDelay(true);

    wait(MIN_ACTION_DELAY_MS).then(() => setAwaitingMinDelay(false));

    const appUserGrants = Object.values(appUserGrantsByAppId);

    props
      .dispatch({
        type: Client.ActionType.CREATE_CLI_USER,
        payload: {
          name,
          orgRoleId,
          appUserGrants,
        },
      })
      .then((res) => {
        if (!res.success) {
          logAndAlertError(
            "There was a problem creating the CLI key.",
            (res.resultAction as any)?.payload
          );
        }
      });
  };

  const selectedOrgRole = orgRoleId
    ? (graph[orgRoleId] as Rbac.OrgRole)
    : undefined;

  const licenseExpired =
    license.expiresAt != -1 && props.ui.now > license.expiresAt;
  if (
    (license.maxDevices != -1 && numActive >= license.maxDevices) ||
    licenseExpired
  ) {
    const blockStatement = licenseExpired
      ? `Your organization's ${
          license.provisional ? "provisional " : ""
        }license has expired.`
      : `Your organization has reached its limit of ${
          license.maxDevices
        } device${license.maxDevices == 1 ? "" : "s"}.`;

    return (
      <div>
        <p>{blockStatement}</p>
        {g.authz.hasOrgPermission(
          graph,
          currentUserId,
          "org_manage_billing"
        ) ? (
          <p>
            To generate more CLI keys,{" "}
            <Link to={props.orgRoute("/my-org/billing")}>
              {licenseExpired ? "renew" : "upgrade"} your org's license.
            </Link>
          </p>
        ) : (
          <p>
            To generate more CLI keys, ask an admin to{" "}
            {licenseExpired ? "renew" : "upgrade"} your org's license.
          </p>
        )}
      </div>
    );
  }

  const orgRoleOptions = validOrgRoleIds.map((id) => (
    <option value={id} label={(graph[id] as Rbac.OrgRole).name} />
  ));

  const form = (
    <form>
      <div className="field">
        <label>CLI Key Name</label>
        <input
          type="text"
          disabled={generating}
          placeholder="Enter a name..."
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <label>
          Org Role <ui.RoleInfoLink {...props} />
        </label>
        <div className={"select" + (generating ? " disabled" : "")}>
          <select
            disabled={generating}
            value={orgRoleId}
            onChange={(e) => setOrgRoleId(e.target.value)}
          >
            {orgRoleOptions}
          </select>
          <SvgImage type="down-caret" />
        </div>
      </div>
    </form>
  );

  let appRoles: React.ReactNode;
  if (
    selectedOrgRole &&
    !selectedOrgRole.autoAppRoleId &&
    grantableAppIds.length > 0
  ) {
    const sortedApps = R.sortWith(
      [
        R.ascend(({ appRoleId }) => {
          const appRole = graph[appRoleId] as Rbac.AppRole;
          return appRole.orderIndex;
        }),
        R.ascend(({ appId }) => {
          const app = graph[appId] as Model.App;
          return app.name;
        }),
      ],

      Object.values(appUserGrantsByAppId)
    );

    const pendingApps =
      sortedApps.length > 0 ? (
        <div className={styles.AssocManager + " " + style({ width: "100%" })}>
          <div className="assoc-list">
            {sortedApps.map(({ appId, appRoleId }) => {
              const app = graph[appId] as Model.App;
              const appRole = graph[appRoleId] as Rbac.AppRole;
              return (
                <div key={appId}>
                  <div>
                    <span className="title">{app.name}</span>
                  </div>
                  <div>
                    <span className="role">{appRole.name} Access</span>
                    <div className="actions">
                      <span
                        className="delete"
                        onClick={() =>
                          setAppUserGrantsByAppId(
                            R.omit([appId], appUserGrantsByAppId)
                          )
                        }
                      >
                        <SvgImage type="x" />
                        <span>Remove</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="field no-margin">
          <p>
            <strong>This CLI key doesn't yet have access to any apps.</strong>
            <br />
            Note: it's fine to generate the CLI key now and grant access to apps
            later.
          </p>
        </div>
      );

    appRoles = [
      <h4>App Access</h4>,
      pendingApps,
      grantableAppIds.length > sortedApps.length ? (
        <div className="field buttons">
          <button className="tertiary" onClick={() => setShowAddApps(true)}>
            Add To {sortedApps.length > 0 ? "More Apps" : "Apps"}
          </button>
        </div>
      ) : (
        ""
      ),
    ];
  }

  return (
    <div className={styles.OrgContainer}>
      <h3>
        Generate <strong>CLI Key</strong>
      </h3>
      {!appId && !props.ui.closedOnboardCLIKeys ? (
        <ui.CliUsersOnboard {...props} />
      ) : (
        ""
      )}

      {form}
      {appRoles}
      <div className="buttons">
        <button
          className="primary"
          onClick={onSubmit}
          disabled={!canSubmit || generating}
        >
          {generating ? <SmallLoader /> : "Generate CLI Key"}
        </button>
      </div>

      {showAddApps ? (
        <AddInviteAppForm
          {...props}
          grantableAppIds={grantableAppIds}
          grantableAppRoleIdsByAppId={grantableAppRoleIdsByAppId}
          appUserGrantsByAppId={appUserGrantsByAppId}
          onClose={() => setShowAddApps(false)}
          onSubmit={(appRoleId, appIds) => {
            setAppUserGrantsByAppId(
              appIds.reduce(
                (agg, appId) => ({
                  ...agg,
                  [appId]: { appId, appRoleId },
                }),
                appUserGrantsByAppId
              )
            );
            setShowAddApps(false);
          }}
        />
      ) : (
        ""
      )}

      {generating ? <ui.CryptoStatus {...props} /> : ""}
    </div>
  );
};

import React, { useState, useEffect, useLayoutEffect, useMemo } from "react";
import { Model, Api, Rbac } from "@core/types";
import * as R from "ramda";
import * as g from "@core/lib/graph";
import * as ui from "@ui";
import { OrgComponent } from "@ui_types";
import { Link } from "react-router-dom";
import { getEnvParentPath } from "@ui_lib/paths";
import * as styles from "@styles";
import { AppUserAccessRow } from "../../shared/app_user_access_row";
import { SvgImage, SmallLoader } from "@images";
import { logAndAlertError } from "@ui_lib/errors";

export const UserApps: OrgComponent<{ userId: string }> = (props) => {
  const userId = props.routeParams.userId;
  const graph = props.core.graph;
  const user = graph[userId] as Model.OrgUser | Model.CliUser;
  const orgRole = graph[user.orgRoleId] as Rbac.OrgRole;
  const graphUpdatedAt = props.core.graphUpdatedAt;
  const currentUserId = props.ui.loadedAccountId!;
  const now = props.ui.now;
  const searchParams = new URLSearchParams(props.location.search);
  const scrollToAppId = searchParams.get("appId");

  const [removingId, setRemovingId] = useState<string>();
  const [filter, setFilter] = useState("");
  const [rolesCollapsed, setRolesCollapsed] = useState<Record<string, true>>(
    {}
  );

  const { appRoleIds, appsByAppRoleId, filteredAppsByAppRoleId, appIds } =
    useMemo(() => {
      const apps = g
        .graphTypes(graph)
        .apps.filter((app) =>
          g.getAppRoleForUserOrInvitee(graph, app.id, userId)
        );

      const f = filter.toLowerCase().trim();
      const filteredApps = f
        ? apps.filter(({ name }) => name.toLowerCase().includes(f))
        : apps;

      const appsByAppRoleId = R.groupBy(
        (app) => g.getAppRoleForUserOrInvitee(graph, app.id, userId)!.id,
        apps
      );

      const filteredAppsByAppRoleId = f
        ? R.groupBy(
            (app) => g.getAppRoleForUserOrInvitee(graph, app.id, userId)!.id,
            filteredApps
          )
        : appsByAppRoleId;

      return {
        appRoleIds: Object.keys(filteredAppsByAppRoleId),
        appsByAppRoleId,
        filteredAppsByAppRoleId,
        appIds: new Set(apps.map(R.prop("id"))),
      };
    }, [graphUpdatedAt, currentUserId, userId, filter, now]);

  const numApps = appIds.size;

  useEffect(() => {
    if (removingId && !appIds.has(removingId)) {
      setRemovingId(undefined);
    }
  }, [appIds]);

  useLayoutEffect(() => {
    if (scrollToAppId) {
      const appEl = document.getElementById(scrollToAppId);
      if (appEl) {
        setTimeout(() => {
          const scrollTo =
            appEl.getBoundingClientRect().top -
            (styles.layout.MAIN_HEADER_HEIGHT + 20);

          window.scrollTo(0, scrollTo), 100;
        });
      }
    }
  }, [scrollToAppId]);

  const remove = (app: Model.App) => {
    const appUserGrant =
      g.getAppUserGrantsByComposite(graph)[[userId, app.id].join("|")];

    if (!appUserGrant || removingId) {
      return;
    }
    setRemovingId(app.id);
    props
      .dispatch({
        type: Api.ActionType.REMOVE_APP_ACCESS,
        payload: {
          id: appUserGrant.id,
        },
      })
      .then((res) => {
        if (!res.success) {
          logAndAlertError(
            `There was a problem removing app cess.`,
            (res.resultAction as any).payload
          );
        }
      });
  };

  const renderRemove = (app: Model.App) => {
    if (removingId == app.id) {
      return <SmallLoader />;
    }

    if (
      g.authz.canRemoveAppUserAccess(graph, currentUserId, {
        userId,
        appId: app.id,
      })
    ) {
      return (
        <span className="delete" onClick={() => remove(app)}>
          <SvgImage type="x" />
          <span>Remove</span>
        </span>
      );
    }
  };

  const renderAccess = (app: Model.App) => (
    <AppUserAccessRow {...props} appId={app.id} userId={userId} />
  );

  const renderApp = (app: Model.App) => {
    return (
      <div id={app.id} key={app.id}>
        <div>
          <span className="title">
            <Link to={props.orgRoute(getEnvParentPath(app))}>{app.name}</Link>
          </span>

          <span className="subtitle">
            <ui.AppUserGroupConnection
              {...props}
              appId={app.id}
              userId={userId}
            />
          </span>
        </div>

        <div>
          {renderAccess(app)}
          <div className={"actions" + (removingId ? " disabled" : "")}>
            {renderRemove(app)}
          </div>
        </div>
      </div>
    );
  };

  const renderAppRoleSection = (appRoleId: string) => {
    const appRole = graph[appRoleId] as Rbac.AppRole;
    const allApps = appsByAppRoleId[appRoleId] ?? [];
    const filteredApps = filteredAppsByAppRoleId[appRoleId] ?? [];

    let roleId: string;
    if (
      appRole.defaultName &&
      ["Org Owner", "Org Admin"].includes(appRole.defaultName)
    ) {
      const orgRole = g
        .graphTypes(graph)
        .orgRoles.find(({ defaultName }) => defaultName == appRole.defaultName);
      roleId = orgRole!.id;
    } else {
      roleId = appRole.id;
    }

    if (filteredApps.length > 0) {
      const collapsed = rolesCollapsed[appRole.id];
      return (
        <div>
          <h4 className="toggle-header">
            <span
              className={"toggle " + (collapsed ? "collapsed" : "expanded")}
              onClick={() =>
                setRolesCollapsed(
                  collapsed
                    ? R.omit([appRole.id], rolesCollapsed)
                    : { ...rolesCollapsed, [appRole.id]: true }
                )
              }
            >
              <SvgImage type="triangle" />
            </span>
            {appRole.name} Access
            <small>
              {allApps.length} app{allApps.length == 1 ? "" : "s"}
            </small>
            <ui.RoleInfoLink {...props} roleId={roleId} />
          </h4>
          {collapsed ? (
            ""
          ) : (
            <div className="assoc-list">{filteredApps.map(renderApp)}</div>
          )}
        </div>
      );
    }
  };

  const renderFilter = () => {
    if (numApps > 2) {
      return (
        <div className="field search">
          <SvgImage type="search" />
          <input
            value={filter}
            autoFocus={true}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search apps..."
          />
        </div>
      );
    }
  };

  return (
    <div className={styles.ManageApps}>
      <div>
        <h3>
          {numApps}
          <strong>{numApps == 1 ? " app" : " apps"}</strong>
        </h3>
        {orgRole.autoAppRoleId ? (
          ""
        ) : (
          <div className="buttons">
            <Link
              className="primary"
              to={props.match.url.replace(/\/apps(\/[^\/]*)?$/, "/apps-add")}
            >
              Add Apps
            </Link>
          </div>
        )}

        {renderFilter()}

        <div>{appRoleIds.map(renderAppRoleSection)}</div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useLayoutEffect, useMemo } from "react";
import { Model, Api, Rbac } from "@core/types";
import * as R from "ramda";
import * as g from "@core/lib/graph";
import * as ui from "@ui";
import { OrgComponent } from "@ui_types";
import { Link } from "react-router-dom";
import { getEnvParentPath, getGroupPath } from "@ui_lib/paths";
import * as styles from "@styles";
import { SvgImage, SmallLoader } from "@images";
import { logAndAlertError } from "@ui_lib/errors";

export const TeamApps: OrgComponent<{ groupId: string }> = (props) => {
  const groupId = props.routeParams.groupId;
  const graph = props.core.graph;
  const group = graph[groupId] as Model.Group;
  const graphUpdatedAt = props.core.graphUpdatedAt;
  const currentUserId = props.ui.loadedAccountId!;
  const byType = g.graphTypes(props.core.graph);

  const searchParams = new URLSearchParams(props.location.search);
  const scrollToAppId = searchParams.get("appId");

  const [removingId, setRemovingId] = useState<string>();
  const [filter, setFilter] = useState("");
  const [rolesCollapsed, setRolesCollapsed] = useState<Record<string, true>>(
    {}
  );

  const { appsByAppRoleId, filteredAppsByAppRoleId, appRoleIds, appIds } =
    useMemo(() => {
      const apps = R.sortBy(
        R.prop("name"),
        (g.getAppUserGroupsByGroupId(graph)[groupId] ?? []).map(
          ({ appId }) => graph[appId] as Model.App
        )
      );

      const f = filter.toLowerCase().trim();
      const filteredApps = f
        ? apps.filter(({ name }) => name.toLowerCase().includes(f))
        : apps;

      const appsByAppRoleId = R.groupBy(
        (app) =>
          g.getAppUserGroupsByComposite(graph)[app.id + "|" + groupId]!
            .appRoleId,
        apps
      );

      const filteredAppsByAppRoleId = f
        ? R.groupBy(
            (app) =>
              g.getAppUserGroupsByComposite(graph)[app.id + "|" + groupId]!
                .appRoleId,
            filteredApps
          )
        : appsByAppRoleId;

      return {
        appRoleIds: Object.keys(filteredAppsByAppRoleId),
        appsByAppRoleId,
        filteredAppsByAppRoleId,
        appIds: new Set(apps.map(R.prop("id"))),
      };
    }, [graphUpdatedAt, currentUserId, groupId, filter]);

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
    const appUserGroup =
      g.getAppUserGroupsByComposite(graph)[[app.id, groupId].join("|")];

    if (!appUserGroup || removingId) {
      return;
    }
    setRemovingId(app.id);

    props.dispatch({
      type: Api.ActionType.DELETE_APP_USER_GROUP,
      payload: {
        id: appUserGroup.id,
      },
    });
  };

  const renderRemove = (app: Model.App) => {
    if (removingId == app.id) {
      return <SmallLoader />;
    }

    return (
      <span className="delete" onClick={() => remove(app)}>
        <SvgImage type="x" />
        <span>Remove</span>
      </span>
    );
  };

  const renderApp = (app: Model.App) => {
    return (
      <div id={app.id} key={app.id}>
        <div>
          <span className="title">
            <Link to={props.orgRoute(getEnvParentPath(app))}>{app.name}</Link>
          </span>
        </div>

        <div>
          <div className={"actions" + (removingId ? " disabled" : "")}>
            {renderRemove(app)}
          </div>
        </div>
      </div>
    );
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

  const renderAppRoleSection = (appRoleId: string) => {
    const appRole = graph[appRoleId] as Rbac.AppRole;
    const allApps = appsByAppRoleId[appRoleId] ?? [];
    const filteredApps = filteredAppsByAppRoleId[appRoleId] ?? [];

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
            <ui.RoleInfoLink {...props} roleId={appRole.id} />
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

  return (
    <div className={styles.ManageApps}>
      <div>
        <h3>
          {numApps}
          <strong>{numApps == 1 ? " app" : " apps"}</strong>
        </h3>

        <div className="buttons">
          <Link
            className="primary"
            to={props.match.url.replace(/\/apps(\/[^\/]*)?$/, "/apps-add")}
          >
            Add Apps
          </Link>
        </div>

        {renderFilter()}

        <div>{appRoleIds.map(renderAppRoleSection)}</div>
      </div>
    </div>
  );
};

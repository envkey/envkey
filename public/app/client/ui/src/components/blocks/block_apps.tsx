import React, { useState, useEffect, useMemo } from "react";
import { OrgComponent } from "@ui_types";
import { Client, Model, Api } from "@core/types";
import * as R from "ramda";
import * as g from "@core/lib/graph";
import { style } from "typestyle";
import { color } from "csx";
import { Link } from "react-router-dom";
import { getEnvParentPath } from "@ui_lib/paths";
import * as styles from "@styles";
import { SvgImage, SmallLoader } from "@images";
import { logAndAlertError } from "@ui_lib/errors";

export const BlockApps: OrgComponent<{ blockId: string }> = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;
  const blockId = props.routeParams.blockId;

  const [removingId, setRemovingId] = useState<string>();
  const [filter, setFilter] = useState("");

  const [connectedApps, filteredConnectedApps, appIds] = useMemo(() => {
    const apps = g.getConnectedAppsForBlock(graph, blockId);

    const f = filter.toLowerCase().trim();
    const filteredApps = apps.filter(({ name }) =>
      name.toLowerCase().includes(f)
    );

    return [apps, filteredApps, new Set(apps.map(R.prop("id")))];
  }, [graphUpdatedAt, currentUserId, blockId, filter]);

  useEffect(() => {
    if (removingId && !appIds.has(removingId)) {
      setRemovingId(undefined);
    }
  }, [appIds]);

  const remove = (app: Model.App) => {
    const appBlock =
      g.getAppBlocksByComposite(graph)[[app.id, blockId].join("|")];
    if (!appBlock || removingId) {
      return;
    }
    setRemovingId(app.id);

    props
      .dispatch({
        type: Api.ActionType.DISCONNECT_BLOCK,
        payload: {
          id: appBlock.id,
        },
      })
      .then((res) => {
        if (!res.success) {
          logAndAlertError(
            "There was a problem disconnecting blocks.",
            res.resultAction
          );
        }
      });
  };

  const renderRemove = (app: Model.App) => {
    if (removingId == app.id) {
      return <SmallLoader />;
    }

    if (
      g.authz.canDisconnectBlock(graph, currentUserId, {
        appId: app.id,
        blockId,
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

  const renderApp = (app: Model.App) => {
    return (
      <div>
        <div>
          <span className="title">
            <Link to={props.orgRoute(getEnvParentPath(app))}>{app.name}</Link>
          </span>
          <div className={"actions" + (removingId ? " disabled" : "")}>
            {renderRemove(app)}
          </div>
        </div>
      </div>
    );
  };

  const renderFilter = () => {
    if (connectedApps.length > 2) {
      return (
        <div className="field search">
          <SvgImage type="search" />
          <input
            value={filter}
            autoFocus={true}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={"Search apps..."}
          />
        </div>
      );
    }
  };

  return (
    <div className={styles.ManageApps}>
      <div>
        <h3>
          {connectedApps.length} <strong>Connected Apps</strong>
        </h3>

        {g.authz.hasOrgPermission(
          graph,
          currentUserId,
          "blocks_manage_connections_permitted"
        ) &&
        g.authz.getAppsWithAllPermissions(graph, currentUserId, [
          "app_manage_blocks",
        ]).length > 0 ? (
          <div className="buttons">
            <Link
              className="primary"
              to={props.match.url.replace(/\/apps(\/[^\/]*)?$/, "/apps-add")}
            >
              Connect Apps
            </Link>
          </div>
        ) : (
          ""
        )}

        {renderFilter()}

        <div className="assoc-list">{filteredConnectedApps.map(renderApp)}</div>
      </div>
    </div>
  );
};

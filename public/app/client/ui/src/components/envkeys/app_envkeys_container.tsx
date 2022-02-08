import React, { useMemo } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Rbac } from "@core/types";
import * as ui from "@ui";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import * as styles from "@styles";

export const AppEnvkeysContainer: OrgComponent<{ appId: string }> = (props) => {
  const appId = props.routeParams.appId;
  const currentUserId = props.ui.loadedAccountId!;
  const { graph, graphUpdatedAt } = props.core;

  const {
    canManageLocalKeys,
    canManageServers,
    userLocalKeys,
    servers,
    collaborators,
  } = useMemo(() => {
    const canManageLocalKeys = g.authz.hasAppPermission(
      graph,
      currentUserId,
      appId,
      "app_manage_local_keys"
    );

    const canManageServers = g.authz.hasAppPermission(
      graph,
      currentUserId,
      appId,
      "app_manage_servers"
    );
    const developmentEnvironment = (
      g.getEnvironmentsByEnvParentId(graph)[appId] ?? []
    ).find((environment) => {
      if (environment.isSub) {
        return false;
      }
      const environmentRole = graph[
        environment.environmentRoleId
      ] as Rbac.EnvironmentRole;

      return environmentRole.hasLocalKeys;
    });

    const userLocalKeys = developmentEnvironment
      ? g.getLocalKeysByEnvironmentComposite(graph)[
          [developmentEnvironment.id, currentUserId].join("|")
        ] ?? []
      : [];

    const servers = g
      .graphTypes(graph)
      .servers.filter(R.propEq("appId", appId));

    const collaborators = g.authz.getAppCollaborators(
      graph,
      currentUserId,
      appId,
      "orgUser"
    );

    return {
      canManageLocalKeys,
      canManageServers,
      userLocalKeys,
      servers,
      collaborators,
    };
  }, [graphUpdatedAt]);

  return (
    <div className={styles.ManageEnvkeysContainer}>
      {canManageServers ? (
        <div className="server-envkeys">
          <h3>
            Server <strong>Keys</strong>
          </h3>
          {props.ui.startedOnboarding &&
          !props.ui.closedOnboardAppServers &&
          canManageServers &&
          servers.length == 0 ? (
            <ui.AppServersOnboard {...props} appId={appId} />
          ) : (
            ""
          )}
          <ui.AppServerEnvkeys {...props} />
        </div>
      ) : (
        ""
      )}

      {canManageLocalKeys ? (
        <div className="local-envkeys">
          <h3>
            Local Development <strong>Keys</strong>
          </h3>

          {props.ui.closedOnboardAppLocalKeys ? (
            ""
          ) : (
            <ui.AppLocalKeysOnboard {...props} appId={appId} />
          )}
          <ui.AppLocalEnvkeys {...props} />
        </div>
      ) : (
        ""
      )}
    </div>
  );
};

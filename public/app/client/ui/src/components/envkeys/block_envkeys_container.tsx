import React, { useLayoutEffect } from "react";
import { OrgComponent } from "@ui_types";
import * as g from "@core/lib/graph";
import * as ui from "@ui";
import * as styles from "@styles";

export const BlockEnvkeysContainer: OrgComponent<{ blockId: string }> = (
  props
) => {
  const blockId = props.routeParams.blockId;
  const currentUserId = props.ui.loadedAccountId!;
  const { graph } = props.core;

  const blockPermissions = g.getConnectedAppPermissionsUnionForBlock(
    graph,
    blockId,
    currentUserId
  );

  const canManageLocalKeys = blockPermissions.has("app_manage_local_keys");

  const canManageServers = blockPermissions.has("app_manage_servers");

  return (
    <div className={styles.ManageEnvkeysContainer}>
      {canManageLocalKeys
        ? [
            <h3>
              Local Development <strong>Keys</strong>
            </h3>,
            <ui.BlockLocalEnvkeys {...props} />,
          ]
        : ""}

      {canManageServers
        ? [
            <h3>
              Server <strong>Keys</strong>
            </h3>,
            <ui.BlockServerEnvkeys {...props} />,
          ]
        : ""}
    </div>
  );
};

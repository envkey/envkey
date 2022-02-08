import React, { useLayoutEffect, useMemo } from "react";
import { OrgComponent } from "@ui_types";
import * as g from "@core/lib/graph";
import * as styles from "@styles";

export const NoAppsOrBlocks: OrgComponent = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const shouldRedirect = useMemo(() => {
    const { apps, blocks } = g.graphTypes(graph);
    const canCreateApp = g.authz.canCreateApp(graph, currentUserId);

    return apps.length > 0 || blocks.length > 0 || canCreateApp;
  }, [graphUpdatedAt, currentUserId]);

  useLayoutEffect(() => {
    if (shouldRedirect) {
      props.history.replace(props.orgRoute(""));
    }
  }, [shouldRedirect]);

  return (
    <div className={styles.OrgContainer}>
      <h3>
        No App <strong>Access</strong>
      </h3>
      <p>
        You don't currently have access to any apps. Talk to an admin in your
        org to change this sad state of affairs.
      </p>
    </div>
  );
};

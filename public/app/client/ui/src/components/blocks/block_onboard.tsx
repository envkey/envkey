import React, { useMemo } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Rbac } from "@core/types";
import * as styles from "@styles";
import * as g from "@core/lib/graph";
import { SvgImage } from "@images";

export const BlockOnboard: OrgComponent<{}, { blockId: string }> = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const canConnectBlock = useMemo(
    () =>
      g.authz.getConnectableAppsForBlock(graph, currentUserId, props.blockId)
        .length > 0,
    [graphUpdatedAt]
  );

  return (
    <div className={styles.OnboardHelp + " onboard-block"}>
      <span
        className="close"
        onClick={() => {
          props.setUiState({ closedOnboardBlock: true });
        }}
      >
        <SvgImage type="x" />
      </span>
      <p>
        <em>Blocks</em> are stackable, reusable groups of environment variables
        that can be connected to multiple apps to prevent duplication. Like
        apps, they have multiple <strong>environments.</strong> They can also
        have <strong>branches</strong> and user-specific{" "}
        <strong>local overrides.</strong>
      </p>

      <p>
        Unlike apps, blocks don't have ENVKEYs directly attached, and also can't
        be made directly accessible to collaborators or CLI Keys. Instead,
        access is granted{" "}
        <strong>through the apps a block is connected to.</strong>
      </p>

      {canConnectBlock ? (
        <p>
          To connect apps, go to the <span className="tab">Apps</span> tab in
          the header above.
        </p>
      ) : (
        ""
      )}
    </div>
  );
};

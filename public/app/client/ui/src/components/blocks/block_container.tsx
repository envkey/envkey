import React, { useEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Rbac } from "@core/types";
import { useBlockTabs } from "./block_tabs";
import * as g from "@core/lib/graph";
import * as styles from "@styles";
import { SvgImage } from "@images";

let initialBlockPermissionsJson: string | undefined;
let initialOrgRoleId: string | undefined;
let initialOrgPermissionsJson: string | undefined;

export const BlockContainer: OrgComponent<{ blockId: string }> = (props) => {
  const { graph } = props.core;
  const blockId = props.routeParams.blockId;
  const block = graph[blockId] as Model.Block | undefined;
  const currentUserId = props.ui.loadedAccountId!;
  const currentUser = graph[currentUserId] as Model.OrgUser;
  const orgRole = graph[currentUser.orgRoleId] as Rbac.OrgRole;
  const blockPermissionsJson = JSON.stringify(
    block
      ? Array.from(
          g.getEnvParentPermissions(graph, block.id, currentUserId)
        ).sort()
      : []
  );
  const orgPermissionsJson = JSON.stringify(
    Array.from(g.getOrgPermissions(graph, orgRole.id)).sort()
  );

  const { shouldRedirect, tabsComponent } = useBlockTabs(props, blockId);

  useEffect(() => {
    if (shouldRedirect) {
      return;
    }
    if (block) {
      initialOrgRoleId = orgRole.id;
      initialBlockPermissionsJson = blockPermissionsJson;
      initialOrgPermissionsJson = orgPermissionsJson;
    }
  }, [block?.id]);

  useEffect(() => {
    if (shouldRedirect) {
      return;
    }
    // if (
    //   orgRole.id == initialOrgRoleId &&
    //   orgPermissionsJson == initialOrgPermissionsJson &&
    //   blockPermissionsJson != initialBlockPermissionsJson
    // ) {
    //   alert(
    //     "Your permissions for this block have been updated through a connected app."
    //   );
    // }
    initialOrgRoleId = orgRole.id;
    initialBlockPermissionsJson = blockPermissionsJson;
    initialOrgPermissionsJson = orgPermissionsJson;
  }, [blockPermissionsJson, orgRole.id, orgPermissionsJson]);

  if (!block || shouldRedirect) {
    return <div></div>;
  }

  return (
    <div className={styles.SelectedObjectContainer}>
      <header className={styles.SelectedObjectHeader}>
        <h1>
          <span>
            Block
            <SvgImage type="right-caret" />
          </span>
          <label>{block.name}</label>
        </h1>

        {tabsComponent}
      </header>
    </div>
  );
};

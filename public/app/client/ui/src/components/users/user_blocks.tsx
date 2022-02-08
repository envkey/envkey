import React, { useMemo, useLayoutEffect, useState } from "react";
import { Model, Api, Rbac } from "@core/types";
import * as R from "ramda";
import * as g from "@core/lib/graph";
import { OrgComponent } from "@ui_types";
import { Link } from "react-router-dom";
import { getEnvParentPath } from "@ui_lib/paths";
import { style } from "typestyle";
import { BlockUserAccessRow } from "../shared/block_user_access_row";
import * as styles from "@styles";
import { SvgImage } from "@images";

export const UserBlocks: OrgComponent<{ userId: string }> = (props) => {
  const userId = props.routeParams.userId;
  const graph = props.core.graph;
  const user = graph[userId] as Model.OrgUser | Model.CliUser;
  const orgRole = graph[user.orgRoleId] as Rbac.OrgRole;
  const graphUpdatedAt = props.core.graphUpdatedAt;
  const currentUserId = props.ui.loadedAccountId!;
  const searchParams = new URLSearchParams(props.location.search);
  const scrollToBlockId = searchParams.get("blockId");

  const [filter, setFilter] = useState("");

  const { canReadAllOrgBlocks, blocks, filteredBlocks } = useMemo(() => {
    const canReadAllOrgBlocks = g.authz.hasOrgPermission(
      graph,
      user.id,
      "blocks_read_all"
    );

    let { blocks } = g.graphTypes(graph);
    blocks = blocks.filter(
      (block) =>
        g.getConnectedAppPermissionsUnionForBlock(graph, block.id, userId)
          .size > 0
    );

    const f = filter.toLowerCase().trim();
    const filteredBlocks = f
      ? blocks.filter(({ name }) => name.toLowerCase().includes(f))
      : blocks;

    return {
      canReadAllOrgBlocks,
      blocks,
      filteredBlocks,
    };
  }, [graphUpdatedAt, currentUserId, userId, filter]);

  useLayoutEffect(() => {
    if (scrollToBlockId) {
      const blockEl = document.getElementById(scrollToBlockId);
      if (blockEl) {
        setTimeout(() => {
          const scrollTo =
            blockEl.getBoundingClientRect().top -
            (styles.layout.MAIN_HEADER_HEIGHT + 20);

          window.scrollTo(0, scrollTo), 100;
        });
      }
    }
  }, [scrollToBlockId]);

  const renderAccessRow = (block: Model.Block) => (
    <BlockUserAccessRow
      {...props}
      canReadAllOrgBlocks={canReadAllOrgBlocks}
      orgRole={orgRole}
      blockId={block.id}
      userId={user.id}
    />
  );

  const renderBlock = (block: Model.Block) => {
    return (
      <div id={block.id} key={block.id}>
        <div>
          <span className="title">
            <Link to={props.orgRoute(getEnvParentPath(block))}>
              {block.name}
            </Link>
          </span>
        </div>
        {canReadAllOrgBlocks ? "" : renderAccessRow(block)}
      </div>
    );
  };

  const renderFilter = () => {
    if (blocks.length > 2) {
      return (
        <div className="field search">
          <SvgImage type="search" />
          <input
            value={filter}
            autoFocus={true}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search blocks..."
          />
        </div>
      );
    }
  };

  return (
    <div className={styles.ManageBlocks}>
      <h3>
        {blocks.length}
        <strong>{blocks.length == 1 ? " block" : " blocks"}</strong>
      </h3>

      {canReadAllOrgBlocks ? (
        <p>
          {user.type == "orgUser"
            ? g.getUserName(graph, user.id)
            : "This CLI Key "}{" "}
          has access to all blocks in the organization through{" "}
          {user.type == "orgUser" ? "their" : "its"}{" "}
          <strong>{orgRole.name}</strong> role.
        </p>
      ) : (
        ""
      )}

      {renderFilter()}

      <div className="assoc-list">{filteredBlocks.map(renderBlock)}</div>
    </div>
  );
};

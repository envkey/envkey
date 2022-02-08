import React, { useMemo, useEffect, useLayoutEffect, useState } from "react";
import { Model, Rbac } from "@core/types";
import * as g from "@core/lib/graph";
import { OrgComponent } from "@ui_types";
import { Link } from "react-router-dom";
import { getUserPath } from "@ui_lib/paths";
import { BlockUserAccessRow } from "../shared/block_user_access_row";
import { style } from "typestyle";
import * as styles from "@styles";
import { SvgImage } from "@images";

const getBlockUsersComponent = (userType: "orgUser" | "cliUser") => {
  const BlockUsers: OrgComponent<{ blockId: string }> = (props) => {
    const blockId = props.routeParams.blockId;
    const graph = props.core.graph;
    const graphUpdatedAt = props.core.graphUpdatedAt;
    const currentUserId = props.ui.loadedAccountId!;
    const userTypeLabelLower = { orgUser: "collaborator", cliUser: "CLI key" }[
      userType
    ];
    const searchParams = new URLSearchParams(props.location.search);
    const scrollToUserId = searchParams.get("userId");

    const [filter, setFilter] = useState("");

    const [list, setList] = useState<React.ReactNode>();

    const {
      collaborators,
      filteredCollaborators,
      canReadAllOrgBlocksByUserId,
    } = useMemo(() => {
      const collaborators = g.authz.getBlockCollaborators(
        graph,
        currentUserId,
        blockId,
        userType
      );

      const f = filter.toLowerCase().trim();
      const filteredCollaborators = f
        ? collaborators.filter((user) => {
            if (user.type == "orgUser") {
              return `${user.firstName} ${user.lastName}`
                .toLowerCase()
                .includes(f);
            } else {
              return user.name.toLowerCase().includes(f);
            }
          })
        : collaborators;

      const canReadAllOrgBlocksByUserId: Record<string, true> = {};

      for (let user of collaborators) {
        const canReadAllOrgBlocks = g.authz.hasOrgPermission(
          graph,
          user.id,
          "blocks_read_all"
        );
        if (canReadAllOrgBlocks) {
          canReadAllOrgBlocksByUserId[user.id] = true;
          continue;
        }
      }

      return {
        collaborators,
        filteredCollaborators,
        canReadAllOrgBlocksByUserId,
      };
    }, [graphUpdatedAt, currentUserId, blockId, filter]);

    useLayoutEffect(() => {
      if (scrollToUserId) {
        const userEl = document.getElementById(scrollToUserId);
        if (userEl) {
          setTimeout(() => {
            const scrollTo =
              userEl.getBoundingClientRect().top -
              (styles.layout.MAIN_HEADER_HEIGHT + 20);

            window.scrollTo(0, scrollTo), 100;
          });
        }
      }
    }, [list, scrollToUserId]);

    useEffect(() => {
      setList(filteredCollaborators.map(renderCollaborator));
    }, [filteredCollaborators]);

    const renderAccessRow = (user: Model.OrgUser | Model.CliUser) => {
      return (
        <BlockUserAccessRow
          {...props}
          canReadAllOrgBlocks={canReadAllOrgBlocksByUserId[user.id]}
          orgRole={graph[user.orgRoleId] as Rbac.OrgRole}
          blockId={blockId}
          userId={user.id}
        />
      );
    };

    const renderCollaborator = (user: Model.OrgUser | Model.CliUser) => {
      return (
        <div id={user.id} key={user.id}>
          <div>
            <span className="title">
              <Link to={props.orgRoute(getUserPath(user))}>
                {g.getUserName(graph, user.id)}
              </Link>
            </span>

            {user.type == "orgUser" ? (
              <span className="subtitle">{user.email}</span>
            ) : (
              ""
            )}
          </div>

          <div>{renderAccessRow(user)}</div>
        </div>
      );
    };

    const renderFilter = () => {
      if (collaborators.length > 2) {
        return (
          <div className="field search">
            <SvgImage type="search" />
            <input
              value={filter}
              autoFocus={true}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Search ${
                userType == "cliUser" ? "CLI Keys" : "Collaborators"
              }...`}
            />
          </div>
        );
      }
    };

    return (
      <div className={styles.ManageCollaborators}>
        <div>
          <h3>
            {collaborators.length}{" "}
            <strong>
              {userTypeLabelLower}
              {collaborators.length == 1 ? "" : "s"}
            </strong>
            {collaborators.length == 1 ? ` has ` : ` have `}
            access
          </h3>

          {renderFilter()}

          <div className="assoc-list">{list}</div>
        </div>
      </div>
    );
  };

  return BlockUsers;
};

export const BlockOrgUsers = getBlockUsersComponent("orgUser");
export const BlockCliUsers = getBlockUsersComponent("cliUser");

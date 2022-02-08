import React from "react";
import * as g from "@core/lib/graph";
import { Model, Rbac } from "@core/types";
import { Link } from "react-router-dom";
import { getEnvParentPath, getLocalsPath } from "@ui_lib/paths";
import { OrgComponent } from "@ui_types";

export const BlockUserAccessRow: OrgComponent<
  {},
  {
    canReadAllOrgBlocks: boolean;
    orgRole: Rbac.OrgRole;
    blockId: string;
    userId: string;
  }
> = (props) => {
  const {
    canReadAllOrgBlocks,
    orgRole,
    core: { graph },
    blockId,
    userId,
  } = props;
  const currentUserId = props.ui.loadedAccountId!;

  const block = graph[blockId] as Model.Block;

  const contents: React.ReactNode[] = [];
  let connectedNodes: React.ReactNode;

  // const appLinks = connectedApps.map((app) => (
  //   <Link to={props.orgRoute(getEnvParentPath(app))}>{app.name}</Link>
  // ));

  if (canReadAllOrgBlocks) {
    connectedNodes = ["org role: ", <strong>{orgRole.name}</strong>];
  } else {
    connectedNodes = ["connected apps"];
  }

  // else if (connectedApps.length > 3) {
  //   connectedNodes = [
  //     appLinks[0],
  //     ", ",
  //     appLinks[1],
  //     `, and ${connectedApps.length - 2} other app${
  //       connectedApps.length == 3 ? "" : "s"
  //     }`,
  //   ];
  // } else if (connectedApps.length == 3) {
  //   connectedNodes = [appLinks[0], ", ", appLinks[1], ", and ", appLinks[2]];
  // } else if (connectedApps.length == 2) {
  //   connectedNodes = [appLinks[0], " and ", appLinks[1]];
  // } else if (connectedApps.length == 1) {
  //   connectedNodes = appLinks;
  // }

  contents.push(<span className="connections">Through {connectedNodes}</span>);

  if (g.authz.canReadLocals(graph, currentUserId, blockId, userId)) {
    const localsEnvironment = (
      g.getEnvironmentsByEnvParentId(graph)[blockId] ?? []
    ).find(
      (environment) =>
        !environment.isSub &&
        (graph[environment.environmentRoleId] as Rbac.EnvironmentRole)
          .hasLocalKeys
    );

    if (localsEnvironment) {
      contents.push(
        <span className="sep">{"●"}</span>,
        <span className="locals-link">
          <Link
            to={props.orgRoute(
              getLocalsPath(block, localsEnvironment.id, userId) +
                `?backPath=${encodeURIComponent(
                  props.location.pathname +
                    `?blockId=${blockId}&userId=${userId}`
                )}`
            )}
          >
            Locals
          </Link>
        </span>
      );
    }
  }

  return <span className="access">{contents}</span>;
};

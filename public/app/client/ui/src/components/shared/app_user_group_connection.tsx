import React from "react";
import * as g from "@core/lib/graph";
import { Model } from "@core/types";
import { Link } from "react-router-dom";
import { OrgComponent } from "@ui_types";
import { getGroupPath } from "@ui_lib/paths";

export const AppUserGroupConnection: OrgComponent<
  {},
  {
    userId: string;
    appId: string;
  }
> = (props) => {
  const {
    core: { graph },
    userId,
    appId,
  } = props;
  const user = graph[userId] as Model.OrgUser | Model.CliUser;
  const appUserGrant =
    g.getAppUserGrantsByComposite(graph)[[user.id, appId].join("|")];
  const groupAssoc = g.getAppUserGroupAssoc(graph, appId, user.id);

  if (!appUserGrant && groupAssoc) {
    const contents: React.ReactNode[] = [];

    if (groupAssoc.type == "appGroupUser") {
      const appGroup = graph[groupAssoc.appGroupId] as Model.Group;
      contents.push(
        <span>
          via app group:{" "}
          <Link to={props.orgRoute(getGroupPath(appGroup))}>
            {appGroup.name}
          </Link>
        </span>
      );
    } else if (groupAssoc.type == "appUserGroup") {
      const userGroup = graph[groupAssoc.userGroupId] as Model.Group;
      contents.push(
        <span>
          via team:{" "}
          <Link to={props.orgRoute(getGroupPath(userGroup))}>
            {userGroup.name}
          </Link>
        </span>
      );
    } else if (groupAssoc.type == "appGroupUserGroup") {
      const appGroup = graph[groupAssoc.appGroupId] as Model.Group;
      const userGroup = graph[groupAssoc.userGroupId] as Model.Group;

      contents.push(
        <span>
          via app group:{" "}
          <Link to={props.orgRoute(getGroupPath(appGroup))}>
            {appGroup.name}
          </Link>
          / team:{" "}
          <Link to={props.orgRoute(getGroupPath(userGroup))}>
            {userGroup.name}
          </Link>
        </span>
      );
    }

    return <span className="group-connection">{contents}</span>;
  }

  return <span></span>;
};

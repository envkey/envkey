import React from "react";
import * as g from "@core/lib/graph";
import { Client, Model, Rbac } from "@core/types";
import { twitterShortTs } from "@core/lib/utils/date";
import { Link } from "react-router-dom";
import { OrgComponent } from "@ui_types";
import { getGroupPath, getLocalsPath } from "@ui_lib/paths";

export const AppUserAccessRow: OrgComponent<
  {},
  {
    userId: string;
    appId: string;
  }
> = (props) => {
  const {
    core: { graph },
    ui: { now },
    userId,
    appId,
  } = props;
  const currentUserId = props.ui.loadedAccountId!;

  const user = graph[userId] as Model.OrgUser | Model.CliUser;
  const app = graph[appId] as Model.App;
  const appUserGrant =
    g.getAppUserGrantsByComposite(graph)[[user.id, appId].join("|")];
  const groupAssoc = g.getAppUserGroupAssoc(graph, appId, user.id);

  const orgRole = graph[user.orgRoleId] as Rbac.OrgRole;

  const contents: React.ReactNode[] = [];

  if (user.type == "orgUser") {
    const inviteStatus = g.getInviteStatus(graph, user.id, now);

    if (
      inviteStatus == "pending" ||
      inviteStatus == "expired" ||
      inviteStatus == "failed"
    ) {
      contents.push(<span className="role">Invite {inviteStatus + " "}</span>);
    } else if (inviteStatus == "pending-v1-upgrade") {
      contents.push(<span className="role">Pending v1 upgrade</span>);
    } else {
      contents.push(
        <span className="role">
          {groupAssoc && appUserGrant ? "Team " : ""}Access{" "}
          {orgRole.autoAppRoleId
            ? "Auto-Granted"
            : groupAssoc && appUserGrant
            ? "Override"
            : "Granted"}
        </span>
      );
    }
  } else {
    contents.push(
      <span className="role">
        Access {orgRole.autoAppRoleId ? "Auto-Granted" : "Granted"}
      </span>
    );
  }

  const ts =
    appUserGrant?.createdAt ??
    groupAssoc?.createdAt ??
    user.orgRoleUpdatedAt ??
    ("inviteAcceptedAt" in user ? user.inviteAcceptedAt : undefined) ??
    user.createdAt;

  contents.push(
    <span className="sep">{"●"}</span>,
    <span className="timestamp">{twitterShortTs(ts, now)}</span>
  );

  if (g.authz.canReadLocals(graph, currentUserId, appId, userId)) {
    const localsEnvironment = (
      g.getEnvironmentsByEnvParentId(graph)[appId] ?? []
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
              getLocalsPath(app, localsEnvironment.id, userId) +
                `?backPath=${encodeURIComponent(
                  props.location.pathname + `?appId=${appId}&userId=${userId}`
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

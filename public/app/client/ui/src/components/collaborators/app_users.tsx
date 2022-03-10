import React, { useState, useEffect, useMemo, useLayoutEffect } from "react";
import { Model, Api, Rbac } from "@core/types";
import * as R from "ramda";
import * as g from "@core/lib/graph";
import * as ui from "@ui";
import { OrgComponent } from "@ui_types";
import { Link } from "react-router-dom";
import { getUserPath, getGroupPath } from "@ui_lib/paths";
import * as styles from "@styles";
import { style } from "typestyle";
import { AppUserAccessRow } from "../shared/app_user_access_row";
import { SvgImage, SmallLoader } from "@images";
import { logAndAlertError } from "@ui_lib/errors";

const getAppUsersComponent = (userType: "orgUser" | "cliUser") => {
  const AppUsers: OrgComponent<{ appId: string; userId?: string }> = (
    props
  ) => {
    const appId = props.routeParams.appId;
    const graph = props.core.graph;
    const graphUpdatedAt = props.core.graphUpdatedAt;
    const currentUserId = props.ui.loadedAccountId!;
    const now = props.ui.now;
    const userTypeLabelLower = { orgUser: "collaborator", cliUser: "CLI Key" }[
      userType
    ];
    const userTypeLabelCapitalized = {
      orgUser: "Collaborator",
      cliUser: "CLI Key",
    }[userType];
    const searchParams = new URLSearchParams(props.location.search);
    const scrollToUserId = searchParams.get("userId");

    const [removingId, setRemovingId] = useState<string>();
    const [filter, setFilter] = useState("");
    const [rolesCollapsed, setRolesCollapsed] = useState<Record<string, true>>(
      {}
    );
    const [teamsExpanded, setTeamsExpanded] = useState<Record<string, true>>(
      {}
    );

    const f = filter.toLowerCase().trim();

    const userFilterFn = (user: Model.OrgUser | Model.CliUser) => {
      if (user.type == "orgUser") {
        return `${user.firstName} ${user.lastName}`.toLowerCase().includes(f);
      } else {
        return user.name.toLowerCase().includes(f);
      }
    };

    const {
      appRoleIds,
      collaboratorsByAppRoleId,
      filteredCollaboratorsByAppRoleId,
      collaboratorIds,
      teamIds,
      teamsByAppRoleId,
      filteredTeamsByAppRoleId,
      collaboratorsByTeamId,
      teamIdByCollaboratorId,
      teamOverridesByCollaboratorId,
    } = useMemo(() => {
      const collaborators = g.authz.getAppCollaborators(
        graph,
        currentUserId,
        appId,
        userType
      );

      const teams =
        userType == "orgUser"
          ? g.authz.getAppConnectedUserGroups(graph, currentUserId, appId)
          : [];

      const collaboratorsByTeamId: Record<string, Model.OrgUser[]> = {};
      const teamIdByCollaboratorId: Record<string, string> = {};
      const teamOverridesByCollaboratorId: Record<string, true> = {};
      for (let team of teams) {
        const memberships =
          g.getGroupMembershipsByGroupId(graph)[team.id] ?? [];
        for (let membership of memberships) {
          const user = graph[membership.objectId] as Model.OrgUser;
          if (!collaboratorsByTeamId[team.id]) {
            collaboratorsByTeamId[team.id] = [];
          }

          collaboratorsByTeamId[team.id].push(user);
          teamIdByCollaboratorId[user.id] = team.id;

          if (
            g.getAppUserGrantsByComposite(graph)[[user.id, appId].join("|")]
          ) {
            teamOverridesByCollaboratorId[user.id] = true;
          }
        }
      }

      const filteredCollaborators = f
        ? collaborators.filter(userFilterFn)
        : collaborators;

      const filteredTeams = f
        ? teams.filter((team) => {
            if (team.name.toLowerCase().includes(f)) {
              return true;
            }
            const users = collaboratorsByTeamId[team.id];
            return users.some(userFilterFn);
          })
        : teams;

      const appRoleIds = (g.getIncludedAppRolesByAppId(graph)[appId] ?? []).map(
        R.prop("appRoleId")
      );

      const collaboratorsByAppRoleId = R.groupBy(
        (user) => g.getAppRoleForUserOrInvitee(graph, appId, user.id)!.id,
        collaborators
      );

      const filteredCollaboratorsByAppRoleId = f
        ? R.groupBy(
            (user) => g.getAppRoleForUserOrInvitee(graph, appId, user.id)!.id,
            filteredCollaborators
          )
        : collaboratorsByAppRoleId;

      const teamsByAppRoleId = R.groupBy((team) => {
        const appUserGroup =
          g.getAppUserGroupsByComposite(graph)[appId + "|" + team.id];
        return appUserGroup!.appRoleId;
      }, teams);

      const filteredTeamsByAppRoleId = f
        ? R.groupBy((team) => {
            const appUserGroup =
              g.getAppUserGroupsByComposite(graph)[appId + "|" + team.id];
            return appUserGroup!.appRoleId;
          }, filteredTeams)
        : teamsByAppRoleId;

      const teamIds = new Set(teams.map(R.prop("id")));
      const collaboratorIds = new Set(collaborators.map(R.prop("id")));

      return {
        appRoleIds,
        collaboratorsByAppRoleId,
        filteredCollaboratorsByAppRoleId,
        collaboratorIds,
        teamIds,
        filteredTeamsByAppRoleId,
        teamsByAppRoleId,
        collaboratorsByTeamId,
        teamIdByCollaboratorId,
        teamOverridesByCollaboratorId,
      };
    }, [graphUpdatedAt, currentUserId, appId, f, now]);

    const numCollaborators = collaboratorIds.size;

    useEffect(() => {
      if (removingId && !collaboratorIds.has(removingId)) {
        setRemovingId(undefined);
      }
    }, [collaboratorIds]);

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
    }, [scrollToUserId]);

    const remove = (
      userOrTeam: Model.OrgUser | Model.CliUser | Model.Group
    ) => {
      const assoc =
        userOrTeam.type == "group"
          ? g.getAppUserGroupsByComposite(graph)[
              [appId, userOrTeam.id].join("|")
            ]
          : g.getAppUserGrantsByComposite(graph)[
              [userOrTeam.id, appId].join("|")
            ];

      if (!assoc || removingId) {
        return;
      }
      setRemovingId(userOrTeam.id);

      props
        .dispatch({
          type: Api.ActionType.REMOVE_APP_ACCESS,
          payload: {
            id: assoc.id,
          },
        })
        .then((res) => {
          if (!res.success) {
            logAndAlertError(
              "There was a problem removing app access.",
              res.resultAction
            );
          }
        });
    };

    const renderRemove = (
      userOrTeam: Model.OrgUser | Model.CliUser | Model.Group
    ) => {
      if (removingId == userOrTeam.id) {
        return <SmallLoader />;
      }

      if (
        (userOrTeam.type == "group" &&
          g.authz.canRemoveAppUserGroupAccess(graph, currentUserId, {
            appId,
            userGroupId: userOrTeam.id,
          })) ||
        (userOrTeam.type != "group" &&
          g.authz.canRemoveAppUserAccess(graph, currentUserId, {
            appId,
            userId: userOrTeam.id,
          }))
      ) {
        return (
          <span className="delete" onClick={() => remove(userOrTeam)}>
            <SvgImage type="x" />
            <span>Remove</span>
          </span>
        );
      }
    };

    const renderAccess = (user: Model.OrgUser | Model.CliUser) => (
      <AppUserAccessRow {...props} appId={appId} userId={user.id} />
    );

    const getRenderCollaborator =
      (isTeam?: true) => (user: Model.OrgUser | Model.CliUser) => {
        const overridden = isTeam
          ? Boolean(
              g.getAppUserGrantsByComposite(graph)[[user.id, appId].join("|")]
            )
          : false;

        return (
          <div
            id={user.id}
            key={user.id}
            className={
              (isTeam ? "indent " : "") +
              (overridden ? style({ opacity: 0.5 }) : "")
            }
          >
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

            {overridden ? (
              <div>
                <span className="access">
                  <span className="role">Overriden by app-specific role</span>
                </span>
              </div>
            ) : (
              <div>
                {renderAccess(user)}
                <div className={"actions" + (removingId ? " disabled" : "")}>
                  {renderRemove(user)}
                </div>
              </div>
            )}
          </div>
        );
      };

    const renderTeam = (team: Model.Group) => {
      const collaborators = collaboratorsByTeamId[team.id] ?? [];
      let filtered = f ? collaborators.filter(userFilterFn) : collaborators;

      // if we match the filter on the team name only and none of its users,
      // show all team users when expanded
      if (filtered.length == 0) {
        filtered = collaborators;
      }

      const expanded = teamsExpanded[team.id];
      return [
        <div id={team.id} key={team.id} className="toggle-item">
          <div>
            <span className="title">
              <span
                className={"toggle " + (expanded ? "expanded" : "collapsed")}
                onClick={() =>
                  setTeamsExpanded(
                    expanded
                      ? R.omit([team.id], teamsExpanded)
                      : { ...teamsExpanded, [team.id]: true }
                  )
                }
              >
                <SvgImage type="triangle" />
              </span>
              <Link to={props.orgRoute(getGroupPath(team))}>{team.name}</Link>
            </span>
          </div>
          <div>
            <span className="subtitle">{collaborators.length} members</span>
            <div className={"actions" + (removingId ? " disabled" : "")}>
              <span className="access"></span>
              {renderRemove(team)}
            </div>
          </div>
        </div>,

        ...(expanded ? filtered.map(getRenderCollaborator(true)) : []),
      ];
    };

    const renderAppRoleSection = (appRoleId: string) => {
      const appRole = graph[appRoleId] as Rbac.AppRole;
      const allCollaborators = collaboratorsByAppRoleId[appRoleId] ?? [];
      const allFilteredCollaborators =
        filteredCollaboratorsByAppRoleId[appRoleId] ?? [];
      const nonTeamCollaborators = allFilteredCollaborators.filter(
        ({ id }) =>
          !teamIdByCollaboratorId[id] || teamOverridesByCollaboratorId[id]
      );
      const teams = teamsByAppRoleId[appRoleId] ?? [];
      const filteredTeams = filteredTeamsByAppRoleId[appRoleId] ?? [];

      let roleId: string;
      if (
        appRole.defaultName &&
        ["Org Owner", "Org Admin"].includes(appRole.defaultName)
      ) {
        const orgRole = g
          .graphTypes(graph)
          .orgRoles.find(
            ({ defaultName }) => defaultName == appRole.defaultName
          );
        roleId = orgRole!.id;
      } else {
        roleId = appRole.id;
      }

      if (filteredTeams.length + nonTeamCollaborators.length > 0) {
        const collapsed = rolesCollapsed[appRole.id];
        return (
          <div>
            <h4 className="toggle-header">
              <span
                className={"toggle " + (collapsed ? "collapsed" : "expanded")}
                onClick={() =>
                  setRolesCollapsed(
                    collapsed
                      ? R.omit([appRole.id], rolesCollapsed)
                      : { ...rolesCollapsed, [appRole.id]: true }
                  )
                }
              >
                <SvgImage type="triangle" />
              </span>
              {appRole.name} Access
              <small>
                {[
                  ...(teams.length > 0
                    ? [
                        `${teams.length} team${teams.length > 1 ? "s" : ""}`,
                        <span className="sep">{"●"}</span>,
                      ]
                    : []),
                  `${allCollaborators.length} ${userTypeLabelLower}${
                    allCollaborators.length == 1 ? "" : "s"
                  }`,
                ]}
              </small>
              <ui.RoleInfoLink {...props} roleId={roleId} />
            </h4>
            {collapsed ? (
              ""
            ) : (
              <div className="assoc-list">
                {filteredTeams.map(renderTeam)}
                {nonTeamCollaborators.map(getRenderCollaborator())}
              </div>
            )}
          </div>
        );
      }
    };

    const renderFilter = () => {
      if (numCollaborators > 2) {
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
            {teamIds.size > 0
              ? [
                  teamIds.size,
                  " ",
                  <strong>team{teamIds.size > 1 ? "s" : ""}</strong>,
                  <span className="sep">{" / "}</span>,
                ]
              : ""}
            {numCollaborators}{" "}
            <strong>
              {userTypeLabelLower}
              {numCollaborators == 1 ? "" : "s"}
            </strong>
            {numCollaborators == 1 ? ` has ` : ` have `}
            access
          </h3>

          {userType == "cliUser" &&
          props.ui.startedOnboarding &&
          !props.ui.closedOnboardCLIKeys ? (
            <ui.CliUsersOnboard {...props} />
          ) : (
            ""
          )}

          <div className="buttons">
            <Link
              className="primary"
              to={props.match.url.replace(/\/list(\/[^\/]*)?$/, "/list/add")}
            >
              Add {userTypeLabelCapitalized}s
            </Link>
          </div>

          {renderFilter()}

          <div>{appRoleIds.map(renderAppRoleSection)}</div>
        </div>
      </div>
    );
  };

  return AppUsers;
};

export const AppOrgUsers = getAppUsersComponent("orgUser");
export const AppCliUsers = getAppUsersComponent("cliUser");

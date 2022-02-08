import React, { useState, useEffect, useLayoutEffect, useMemo } from "react";
import { Model, Api, Rbac } from "@core/types";
import * as R from "ramda";
import * as g from "@core/lib/graph";
import { OrgComponent } from "@ui_types";
import { Link } from "react-router-dom";
import { getGroupPath } from "@ui_lib/paths";
import * as styles from "@styles";
import { SvgImage, SmallLoader } from "@images";

export const UserTeams: OrgComponent<{ userId: string }> = (props) => {
  const userId = props.routeParams.userId;
  const graph = props.core.graph;
  const user = graph[userId] as Model.OrgUser | Model.CliUser;
  const graphUpdatedAt = props.core.graphUpdatedAt;
  const currentUserId = props.ui.loadedAccountId!;
  const searchParams = new URLSearchParams(props.location.search);
  const scrollToTeamId = searchParams.get("userGroupId");

  const [removingId, setRemovingId] = useState<string>();
  const [filter, setFilter] = useState("");

  const { filteredTeams, teamIds } = useMemo(() => {
    const teams = R.sortBy(
      R.prop("name"),
      (g.getGroupMembershipsByObjectId(graph)[userId] ?? []).map(
        ({ groupId }) => graph[groupId] as Model.Group
      )
    );
    const f = filter.toLowerCase().trim();
    const filteredTeams = f
      ? teams.filter(({ name }) => name.toLowerCase().includes(f))
      : teams;

    return {
      teamIds: new Set(teams.map(R.prop("id"))),
      filteredTeams,
    };
  }, [graphUpdatedAt, currentUserId, userId, filter]);

  const numTeams = teamIds.size;

  useEffect(() => {
    if (removingId && !teamIds.has(removingId)) {
      setRemovingId(undefined);
    }
  }, [teamIds]);

  useLayoutEffect(() => {
    if (scrollToTeamId) {
      const appEl = document.getElementById(scrollToTeamId);
      if (appEl) {
        setTimeout(() => {
          const scrollTo =
            appEl.getBoundingClientRect().top -
            (styles.layout.MAIN_HEADER_HEIGHT + 20);

          window.scrollTo(0, scrollTo), 100;
        });
      }
    }
  }, [scrollToTeamId]);

  const remove = (team: Model.Group) => {
    const membership =
      g.getGroupMembershipsByComposite(graph)[team.id + "|" + user.id];

    if (!membership || removingId) {
      return;
    }
    setRemovingId(team.id);

    props.dispatch({
      type: Api.ActionType.DELETE_GROUP_MEMBERSHIP,
      payload: {
        id: membership.id,
      },
    });
  };

  const renderRemove = (team: Model.Group) => {
    if (removingId == team.id) {
      return <SmallLoader />;
    }

    return (
      <span className="delete" onClick={() => remove(team)}>
        <SvgImage type="x" />
        <span>Remove</span>
      </span>
    );
  };

  const renderTeam = (team: Model.Group) => {
    return (
      <div id={team.id} key={team.id}>
        <div>
          <span className="title">
            <Link to={props.orgRoute(getGroupPath(team))}>{team.name}</Link>
          </span>

          <div className={"actions" + (removingId ? " disabled" : "")}>
            {renderRemove(team)}
          </div>
        </div>
      </div>
    );
  };

  const renderFilter = () => {
    if (numTeams > 2) {
      return (
        <div className="field search">
          <SvgImage type="search" />
          <input
            value={filter}
            autoFocus={true}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search teams..."
          />
        </div>
      );
    }
  };

  return (
    <div className={styles.ManageCollaborators}>
      <div>
        <h3>
          {numTeams}
          <strong>{numTeams == 1 ? " team" : " teams"}</strong>
        </h3>

        <div className="buttons">
          <Link
            className="primary"
            to={props.match.url.replace(/\/teams(\/[^\/]*)?$/, "/teams-add")}
          >
            Add To Teams
          </Link>
        </div>

        {renderFilter()}

        <div className="assoc-list">{filteredTeams.map(renderTeam)}</div>
      </div>
    </div>
  );
};

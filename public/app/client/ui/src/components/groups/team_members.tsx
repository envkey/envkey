import React, { useState, useEffect, useMemo, useLayoutEffect } from "react";
import { Model, Api } from "@core/types";
import * as R from "ramda";
import * as g from "@core/lib/graph";
import { OrgComponent } from "@ui_types";
import { Link } from "react-router-dom";
import { getUserPath } from "@ui_lib/paths";
import { style } from "typestyle";
import * as styles from "@styles";
import { SvgImage, SmallLoader } from "@images";
import { logAndAlertError } from "@ui_lib/errors";

export const TeamMembers: OrgComponent<{ groupId: string }> = (props) => {
  const groupId = props.routeParams.groupId;
  const graph = props.core.graph;
  const graphUpdatedAt = props.core.graphUpdatedAt;
  const currentUserId = props.ui.loadedAccountId!;

  const searchParams = new URLSearchParams(props.location.search);
  const scrollToUserId = searchParams.get("userId");

  const [removingId, setRemovingId] = useState<string>();
  const [filter, setFilter] = useState("");

  const { filteredMembers, memberIds } = useMemo(() => {
    const members = R.sortBy(
      ({ firstName, lastName }) => `${lastName} ${firstName}`,
      (g.getGroupMembershipsByGroupId(graph)[groupId] ?? []).map(
        ({ objectId }) => graph[objectId] as Model.OrgUser
      )
    );

    const f = filter.toLowerCase().trim();
    const filteredMembers = f
      ? members.filter((user) =>
          `${user.firstName} ${user.lastName}`.toLowerCase().includes(f)
        )
      : members;

    return {
      memberIds: new Set(members.map(R.prop("id"))),
      filteredMembers,
    };
  }, [graphUpdatedAt, currentUserId, groupId, filter]);

  const numMembers = memberIds.size;

  useEffect(() => {
    if (removingId && !memberIds.has(removingId)) {
      setRemovingId(undefined);
    }
  }, [memberIds]);

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

  const remove = (user: Model.OrgUser) => {
    const membership =
      g.getGroupMembershipsByComposite(graph)[groupId + "|" + user.id];

    if (!membership || removingId) {
      return;
    }
    setRemovingId(user.id);

    props
      .dispatch({
        type: Api.ActionType.DELETE_GROUP_MEMBERSHIP,
        payload: {
          id: membership.id,
        },
      })
      .then((res) => {
        if (!res.success) {
          logAndAlertError(
            `There was a problem removing the member.`,
            res.resultAction
          );
        }
      });
  };

  const renderRemove = (user: Model.OrgUser) => {
    if (removingId == user.id) {
      return <SmallLoader />;
    }

    return (
      <span className="delete" onClick={() => remove(user)}>
        <SvgImage type="x" />
        <span>Remove</span>
      </span>
    );
  };

  const renderMember = (user: Model.OrgUser) => {
    return (
      <div id={user.id} key={user.id}>
        <div>
          <span className="title">
            <Link to={props.orgRoute(getUserPath(user))}>
              {g.getUserName(graph, user.id)}
            </Link>
          </span>

          <span className="subtitle">{user.email}</span>
        </div>

        <div>
          <div className={"actions" + (removingId ? " disabled" : "")}>
            {renderRemove(user)}
          </div>
        </div>
      </div>
    );
  };

  const renderFilter = () => {
    if (numMembers > 2) {
      return (
        <div className="field search">
          <SvgImage type="search" />
          <input
            value={filter}
            autoFocus={true}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={"Search team members..."}
          />
        </div>
      );
    }
  };

  return (
    <div className={styles.ManageCollaborators}>
      <div>
        <h3>
          {numMembers}{" "}
          <strong>
            Team Member
            {numMembers == 1 ? "" : "s"}
          </strong>
        </h3>

        <div className="buttons">
          <Link
            className="primary"
            to={props.match.url.replace(
              /\/members(\/[^\/]*)?$/,
              "/members-add"
            )}
          >
            Add Members
          </Link>
        </div>

        {renderFilter()}

        <div className="assoc-list">{filteredMembers.map(renderMember)}</div>
      </div>
    </div>
  );
};

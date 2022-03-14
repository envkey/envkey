import React, { useState, useMemo } from "react";
import { Client, Model, Rbac } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { OrgComponent } from "@ui_types";
import * as ui from "@ui";
import * as styles from "@styles";
import { Link } from "react-router-dom";
import { logAndAlertError } from "@ui_lib/errors";

export const TeamAddMembers: OrgComponent<{ groupId: string }> = (props) => {
  const groupId = props.routeParams.groupId;
  const graph = props.core.graph;
  const graphUpdatedAt = props.core.graphUpdatedAt;
  const currentUserId = props.ui.loadedAccountId!;

  const grantableUsers = useMemo(() => {
    const memberIds = new Set(
      (g.getGroupMembershipsByGroupId(graph)[groupId] ?? []).map(
        R.prop("objectId")
      )
    );
    const { orgUsers } = g.graphTypes(graph);

    const grantableUsers = orgUsers.filter(({ id, orgRoleId }) => {
      if (memberIds.has(id)) {
        return false;
      }
      const orgRole = graph[orgRoleId] as Rbac.OrgRole;
      return !orgRole.autoAppRoleId;
    });

    return grantableUsers;
  }, [graphUpdatedAt, currentUserId, groupId]);

  const [submitting, setSubmitting] = useState(false);

  return (
    <div className={styles.ManageCollaborators}>
      <div className="back-link">
        <Link to={props.match.url.replace(/\/members-add$/, "/members")}>
          ← Back To Members
        </Link>
      </div>
      <div className="field">
        <label>Members To Add</label>
        <ui.CheckboxMultiSelect
          title="Member"
          winHeight={props.winHeight}
          emptyText="No members can be added to this team."
          submitting={submitting}
          items={grantableUsers.map((user) => {
            const name = g.getUserName(graph, user.id);
            return {
              id: user.id,
              searchText: name,
              label: name,
            };
          })}
          onSubmit={async (ids) => {
            setSubmitting(true);
            const res = await props.dispatch({
              type: Client.ActionType.CREATE_GROUP_MEMBERSHIPS,
              payload: ids.map((objectId) => ({
                groupId,
                objectId,
              })),
            });

            if (res.success) {
              props.history.push(
                props.location.pathname.replace(/\/members-add$/, "/members")
              );
            } else {
              logAndAlertError(
                "There was a problem adding the member.",
                (res.resultAction as any)?.payload
              );
            }
          }}
        />
      </div>
    </div>
  );
};

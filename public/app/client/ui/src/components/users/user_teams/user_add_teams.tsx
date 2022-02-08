import React, { useState, useMemo } from "react";
import { Client } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { OrgComponent } from "@ui_types";
import * as styles from "@styles";
import * as ui from "@ui";
import { Link } from "react-router-dom";

export const UserAddTeams: OrgComponent<{ userId: string }> = (props) => {
  const userId = props.routeParams.userId;
  const graph = props.core.graph;
  const graphUpdatedAt = props.core.graphUpdatedAt;
  const currentUserId = props.ui.loadedAccountId!;

  const grantableTeams = useMemo(() => {
    const teamIds = new Set(
      (g.getGroupMembershipsByObjectId(graph)[userId] ?? []).map(
        R.prop("groupId")
      )
    );
    const teams = g.getGroupsByObjectType(graph)["orgUser"] ?? [];

    const grantableTeams = teams.filter(({ id }) => !teamIds.has(id));

    return grantableTeams;
  }, [graphUpdatedAt, currentUserId, userId]);

  const [submitting, setSubmitting] = useState(false);

  return (
    <div className={styles.ManageCollaborators}>
      <div className="back-link">
        <Link to={props.match.url.replace(/\/teams-add$/, "/teams")}>
          ← Back To Teams
        </Link>
      </div>

      <div className="field">
        <label>Add To Teams</label>

        <ui.CheckboxMultiSelect
          title="Team"
          winHeight={props.winHeight}
          emptyText="No teams available to add this person to."
          submitting={submitting}
          items={grantableTeams.map((team) => {
            return {
              id: team.id,
              searchText: team.name,
              label: team.name,
            };
          })}
          onSubmit={async (ids) => {
            setSubmitting(true);
            await props.dispatch({
              type: Client.ActionType.CREATE_GROUP_MEMBERSHIPS,
              payload: ids.map((groupId) => ({
                groupId,
                objectId: userId,
              })),
            });
            props.history.push(
              props.location.pathname.replace(/\/teams-add$/, "/teams")
            );
          }}
        />
      </div>
    </div>
  );
};

import React, { useState, useMemo, useEffect } from "react";
import { Client, Model, Rbac } from "@core/types";
import * as g from "@core/lib/graph";
import { OrgComponent } from "@ui_types";
import { RadioGroup, Radio } from "react-radio-group";
import * as ui from "@ui";
import * as styles from "@styles";
import { SvgImage } from "@images";
import { logAndAlertError } from "@ui_lib/errors";

const getAppAddUsersComponent = (userType: "orgUser" | "cliUser") => {
  const AppAddUsers: OrgComponent<{ appId: string }> = (props) => {
    const appId = props.routeParams.appId;
    const graph = props.core.graph;
    const graphUpdatedAt = props.core.graphUpdatedAt;
    const currentUserId = props.ui.loadedAccountId!;
    const now = props.ui.now;

    const [assocType, setAssocType] = useState<"user" | "group">("user");

    const {
      grantableAppRoles,
      grantableByAppRoleId,
      existingAppRolesById,
      hasTeams,
    } = useMemo(() => {
      const grantableAppRoles = g.authz.getAccessGrantableAppRoles(
        graph,
        currentUserId,
        appId
      );

      const grantableUsers =
        userType == "orgUser"
          ? assocType == "user"
            ? g.authz.getAccessGrantableOrgUsersForApp(
                graph,
                currentUserId,
                appId,
                now
              )
            : []
          : g.authz.getAccessGrantableCliUsersForApp(
              graph,
              currentUserId,
              appId
            );

      const grantableTeams =
        userType == "orgUser"
          ? g.authz.getAccessGrantableUserGroupsForApp(
              graph,
              currentUserId,
              appId
            )
          : [];

      const grantableUsersOrTeams =
        assocType == "user" ? grantableUsers : grantableTeams;

      const existingAppRolesById: Record<string, Rbac.AppRole | undefined> = {};
      const grantableIdsByAppRoleId: Record<string, Set<string>> = {};
      const grantableByAppRoleId: Record<
        string,
        (Model.Group | Model.OrgUser | Model.CliUser)[]
      > = {};

      for (let grantable of grantableUsersOrTeams) {
        if (assocType == "user") {
          existingAppRolesById[grantable.id] = g.getAppRoleForUserOrInvitee(
            graph,
            appId,
            grantable.id
          );
        } else {
          const existingAppUserGroup =
            g.getAppUserGroupsByComposite(graph)[appId + "|" + grantable.id];
          if (existingAppUserGroup) {
            existingAppRolesById[grantable.id] = graph[
              existingAppUserGroup.appRoleId
            ] as Rbac.AppRole;
          }
        }

        const appRoles =
          assocType == "user"
            ? g.authz.getAccessGrantableAppRolesForUser(
                graph,
                currentUserId,
                appId,
                grantable.id
              )
            : g.authz.getAccessGrantableAppRolesForUserGroup(
                graph,
                currentUserId,
                appId,
                grantable.id
              );

        for (let { id: appRoleId } of appRoles) {
          if (!grantableIdsByAppRoleId[appRoleId]) {
            grantableIdsByAppRoleId[appRoleId] = new Set<string>();
            grantableByAppRoleId[appRoleId] = [];
          }
          const userIds = grantableIdsByAppRoleId[appRoleId];
          if (!userIds.has(grantable.id)) {
            userIds.add(grantable.id);
            grantableByAppRoleId[appRoleId].push(grantable);
          }
        }
      }

      return {
        grantableAppRoles,
        grantableByAppRoleId,
        existingAppRolesById,
        hasTeams: grantableTeams.length > 0,
      };
    }, [
      graphUpdatedAt,
      currentUserId,
      appId,
      userType == "orgUser" ? now : null,
      assocType,
    ]);

    useEffect(() => setAssocType(hasTeams ? "group" : "user"), [hasTeams]);

    const [selectedAppRoleId, setSelectedAppRoleId] = useState(
      grantableAppRoles[grantableAppRoles.length - 1].id
    );

    const [submitting, setSubmitting] = useState(false);

    const grantableUsersOrTeams = useMemo(
      () => grantableByAppRoleId[selectedAppRoleId] ?? [],
      [grantableByAppRoleId, selectedAppRoleId]
    );

    const renderAppRoleSelect = () => {
      if (grantableAppRoles.length == 0) {
        return;
      }

      return (
        <div className="select">
          <select
            value={selectedAppRoleId}
            onChange={(e) => setSelectedAppRoleId(e.target.value)}
          >
            {grantableAppRoles.map((appRole) => (
              <option value={appRole.id}>{appRole.name}</option>
            ))}
          </select>
          <SvgImage type="down-caret" />
        </div>
      );
    };

    return (
      <div className={styles.ManageCollaborators}>
        <div className="field app-role">
          <label>
            Add With App Role <ui.RoleInfoLink {...props} roleType="appRoles" />
          </label>
          {renderAppRoleSelect()}
        </div>
        {userType == "orgUser" && hasTeams ? (
          <div className="field radio-group">
            <RadioGroup
              selectedValue={assocType}
              onChange={(val) => setAssocType(val)}
            >
              <label className={assocType == "group" ? "selected" : ""}>
                <Radio disabled={submitting} value="group" />
                <span>Add Teams</span>
              </label>
              <label className={assocType == "user" ? "selected" : ""}>
                <Radio disabled={submitting} value="user" />
                <span>Add People</span>
              </label>
            </RadioGroup>
          </div>
        ) : (
          ""
        )}
        <div className="field">
          <label>
            {userType == "orgUser"
              ? assocType == "group"
                ? "Teams"
                : "People"
              : "CLI Keys"}{" "}
            To Add
          </label>
          <ui.CheckboxMultiSelect
            title={assocType == "group" ? "Team" : "Collaborator"}
            winHeight={props.winHeight}
            emptyText={`No ${
              assocType == "group" ? "teams" : "collaborators"
            } can be added with this App Role. Try a different role.`}
            submitting={submitting}
            items={grantableUsersOrTeams.map((userOrTeam) => {
              const name =
                userOrTeam.type == "group"
                  ? userOrTeam.name
                  : g.getUserName(graph, userOrTeam.id);
              const existingRole = existingAppRolesById[userOrTeam.id];
              return {
                id: userOrTeam.id,
                searchText: name,
                label: (
                  <label>
                    {name}{" "}
                    {existingRole ? (
                      <span className="small">
                        Current Role: <strong>{existingRole.name}</strong>
                      </span>
                    ) : (
                      ""
                    )}
                  </label>
                ),
              };
            })}
            onSubmit={async (ids) => {
              setSubmitting(true);
              await props
                .dispatch({
                  type: Client.ActionType.GRANT_APPS_ACCESS,
                  payload: ids.map((id) => ({
                    appId,
                    appRoleId: selectedAppRoleId,
                    ...(assocType == "user"
                      ? { userId: id }
                      : { userGroupId: id }),
                  })),
                })
                .then((res) => {
                  if (!res.success) {
                    logAndAlertError(
                      "There was a problem granting app access.",
                      (res.resultAction as any)?.payload
                    );
                  }
                });
              props.history.push(
                props.location.pathname.replace(/\/add.+$/, "/list")
              );
            }}
          />
        </div>
      </div>
    );
  };

  return AppAddUsers;
};

export const AppAddOrgUsers = getAppAddUsersComponent("orgUser");
export const AppAddCliUsers = getAppAddUsersComponent("cliUser");

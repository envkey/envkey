import React, { useState, useMemo, useEffect, useLayoutEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Client, Model, Api, Rbac } from "@core/types";
import humanize from "humanize-string";
import { twitterShortTs } from "@core/lib/utils/date";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import * as styles from "@styles";
import * as ui from "@ui";
import { pick } from "@core/lib/utils/object";
import { style } from "typestyle";
import { SvgImage, SmallLoader } from "@images";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { wait } from "@core/lib/utils/wait";
import { inviteRoute } from "../invites/helpers";
import { logAndAlertError } from "@ui_lib/errors";

const getComponent = (userType: "orgUser" | "cliUser") => {
  const Settings: OrgComponent<{ userId: string }> = (props) => {
    const { graph, graphUpdatedAt } = props.core;
    const userId = props.routeParams.userId;

    const user = graph[userId] as Model.OrgUser | Model.CliUser | undefined;
    const currentUserId = props.ui.loadedAccountId!;
    const userTypeLabel = humanize(userType);
    const orgRole = user ? (graph[user.orgRoleId] as Rbac.OrgRole) : undefined;

    const { canRename, orgRolesAssignable, canDelete, pendingInvite } =
      useMemo(() => {
        if (!user) {
          return {};
        }

        return {
          canRename:
            userType == "orgUser"
              ? g.authz.canRenameUser(graph, currentUserId, userId)
              : g.authz.canRenameCliUser(graph, currentUserId, userId),
          orgRolesAssignable: g.authz.getOrgRolesAssignableToUser(
            graph,
            currentUserId,
            userId
          ),
          canDelete:
            userType == "orgUser"
              ? g.authz.canRemoveFromOrg(graph, currentUserId, userId)
              : g.authz.canDeleteCliUser(graph, currentUserId, userId),

          pendingInvite:
            user.type == "orgUser" && !(user.isCreator || user.inviteAcceptedAt)
              ? R.last(
                  g.getActiveOrExpiredInvitesByInviteeId(graph)[user.id] ?? []
                )
              : undefined,
        };
      }, [graphUpdatedAt, userId, currentUserId]);

    const [firstName, setFirstName] = useState(
      user?.type == "orgUser" ? user.firstName : ""
    );
    const [lastName, setLastName] = useState(
      user?.type == "orgUser" ? user.lastName : ""
    );
    const [cliUserName, setCliUserName] = useState(
      user?.type == "cliUser" ? user.name : ""
    );

    const [confirmDeleteName, setConfirmDeleteName] = useState("");
    const [selectedOrgRoleId, setSelectedOrgRoleId] = useState(
      orgRole?.id ?? ""
    );

    const [renaming, setRenaming] = useState(false);
    const [updatingRole, setUpdatingRole] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [awaitingMinDelay, setAwaitingMinDelay] = useState(false);

    useEffect(() => {
      setFirstName(user?.type == "orgUser" ? user.firstName : "");
      setLastName(user?.type == "orgUser" ? user.lastName : "");
      setCliUserName(user?.type == "cliUser" ? user.name : "");
      setConfirmDeleteName("");
      setSelectedOrgRoleId(orgRole?.id ?? "");
    }, [userId]);

    useEffect(() => {
      if (
        user &&
        renaming &&
        ((user?.type == "orgUser" &&
          firstName == user.firstName &&
          lastName == user.lastName) ||
          (user?.type == "cliUser" && cliUserName == user.name)) &&
        !awaitingMinDelay
      ) {
        setRenaming(false);
      }
    }, [user && g.getUserName(graph, userId), awaitingMinDelay]);

    useEffect(() => {
      if (
        updatingRole &&
        user?.orgRoleId == selectedOrgRoleId &&
        !awaitingMinDelay
      ) {
        setUpdatingRole(false);
      }
    }, [user?.orgRoleId, awaitingMinDelay]);

    useLayoutEffect(() => {
      if (isRegenerating && props.core.generatedInvites.length > 0) {
        props.history.push(inviteRoute(props, "/invite-users/generated"));
      }
    }, [props.core.generatedInvites.length > 0]);

    if (!user || !orgRole || !orgRolesAssignable) {
      return <div />;
    }

    const onDelete = async () => {
      setIsDeleting(true);
      await wait(500); // add a little delay for a smoother transition
      props.setUiState({ justDeletedObjectId: userId });
      props
        .dispatch({
          type:
            userType == "orgUser"
              ? Api.ActionType.REMOVE_FROM_ORG
              : Api.ActionType.DELETE_CLI_USER,
          payload: { id: userId },
        })
        .then((res) => {
          if (!res.success) {
            logAndAlertError(
              `There was a problem removing the ${
                { orgUser: "user", cliUser: "CLI key" }[userId]
              }.`,
              res.resultAction
            );
          }
        });
    };

    const renderAccessStatus = () => {
      let status: string;
      let date: number;

      if (user.type == "cliUser" || user.inviteAcceptedAt) {
        status = "Access Granted";
        date = user.type == "cliUser" ? user.createdAt : user.inviteAcceptedAt!;
      } else if (user.type == "orgUser" && user.isCreator) {
        status = "Created Org";
        date = user.createdAt;
      } else if (pendingInvite) {
        const expired = props.ui.now > pendingInvite.expiresAt;
        if (expired) {
          status = "Invitation Expired";
          date = pendingInvite.expiresAt;
        } else {
          status = "Invitation Pending";
          date = user.createdAt;
        }
      } else {
        return;
      }

      return (
        <div className="field">
          <label>Status</label>
          <span>
            <strong>{status}</strong> <span className="sep">{"●"}</span>
            {twitterShortTs(date, props.ui.now)}
          </span>
        </div>
      );
    };

    const renderNameOrRename = () => {
      if (canRename) {
        return (
          <div className="field">
            {userType == "orgUser"
              ? [
                  <label>First Name</label>,
                  <input
                    type="text"
                    value={firstName}
                    disabled={renaming}
                    onChange={(e) => setFirstName(e.target.value)}
                  />,
                  <label>Last Name</label>,
                  <input
                    type="text"
                    value={lastName}
                    disabled={renaming}
                    onChange={(e) => setLastName(e.target.value)}
                  />,
                ]
              : [
                  <label>CLI Key Name</label>,
                  <input
                    type="text"
                    value={cliUserName}
                    disabled={renaming}
                    onChange={(e) => setCliUserName(e.target.value)}
                  />,
                ]}

            <button
              className="primary"
              disabled={
                !(
                  (firstName.trim() && lastName.trim()) ||
                  cliUserName.trim()
                ) ||
                (user.type == "orgUser" &&
                  firstName == user.firstName &&
                  lastName == user.lastName) ||
                (user.type == "cliUser" && cliUserName == user.name)
              }
              onClick={() => {
                setRenaming(true);
                setAwaitingMinDelay(true);
                wait(MIN_ACTION_DELAY_MS).then(() =>
                  setAwaitingMinDelay(false)
                );

                props
                  .dispatch(
                    userType == "orgUser"
                      ? {
                          type: Api.ActionType.RENAME_USER,
                          payload: { id: userId, firstName, lastName },
                        }
                      : {
                          type: Api.ActionType.RENAME_CLI_USER,
                          payload: { id: userId, name: cliUserName },
                        }
                  )
                  .then((res) => {
                    if (!res.success) {
                      logAndAlertError(
                        `There was a problem renaming the ${
                          { orgUser: "user", cliUser: "CLI key" }[userId]
                        }.`,
                        res.resultAction
                      );
                    }
                  });
              }}
            >
              {renaming ? "Renaming..." : "Rename"}
            </button>
          </div>
        );
      } else {
        return (
          <div className="field">
            <label>
              {user.type == "orgUser"
                ? `${user.firstName} ${user.lastName}`
                : user.name}
            </label>
          </div>
        );
      }
    };

    const renderRoleOrUpdateUserRole = () => {
      return (
        <div>
          <div className="field">
            <label>
              Organization Role
              <ui.RoleInfoLink {...props} />
            </label>
            {orgRolesAssignable.length > 1 ? (
              <div className={"select"}>
                <select
                  disabled={updatingRole}
                  value={selectedOrgRoleId}
                  onChange={(e) => setSelectedOrgRoleId(e.target.value)}
                >
                  {orgRolesAssignable.map((role) => (
                    <option value={role.id}>{role.name}</option>
                  ))}
                </select>
                <SvgImage type="down-caret" />
              </div>
            ) : (
              <span>
                <strong>{orgRole.name}</strong>
              </span>
            )}
            {orgRolesAssignable.length > 1 &&
            selectedOrgRoleId != orgRole.id ? (
              <button
                className="primary"
                disabled={updatingRole}
                onClick={() => {
                  setUpdatingRole(true);
                  setAwaitingMinDelay(true);
                  wait(MIN_ACTION_DELAY_MS).then(() =>
                    setAwaitingMinDelay(false)
                  );

                  props
                    .dispatch({
                      type: Client.ActionType.UPDATE_USER_ROLES,
                      payload: [{ id: userId, orgRoleId: selectedOrgRoleId }],
                    })
                    .then((res) => {
                      if (!res.success) {
                        logAndAlertError(
                          `There was a problem updating the ${
                            { orgUser: "user", cliUser: "CLI key" }[userId]
                          } role.`,
                          res.resultAction
                        );
                      }
                    });
                }}
              >
                {updatingRole ? "Updating Role..." : "Update Role"}
              </button>
            ) : (
              ""
            )}
          </div>
        </div>
      );
    };

    const renderDelete = () => {
      if (canDelete) {
        return (
          <div className="field">
            <label>
              {userType == "orgUser"
                ? "Remove User From Organization"
                : "Delete CLI Key"}
            </label>
            <input
              type="text"
              value={confirmDeleteName}
              disabled={isDeleting}
              onChange={(e) => setConfirmDeleteName(e.target.value)}
              placeholder={`To confirm, enter the ${
                userType == "orgUser" ? "user's full" : "CLI key's"
              } name here...`}
            />
            <button
              className="primary"
              disabled={
                isDeleting || confirmDeleteName != g.getUserName(graph, userId)
              }
              onClick={onDelete}
            >
              {isDeleting
                ? `Deleting ${userTypeLabel}...`
                : `Delete ${userTypeLabel}`}
            </button>
          </div>
        );
      }
    };

    const renderDangerZone = () => {
      if (
        canDelete &&
        !(user.type == "orgUser" && !(user.inviteAcceptedAt || user.isCreator))
      ) {
        return (
          <div className={"danger-zone"}>
            <h3>Danger Zone</h3>
            {renderDelete()}
          </div>
        );
      }
    };

    const renderInviteButtons = () => {
      if (
        canDelete &&
        user.type == "orgUser" &&
        !(user.inviteAcceptedAt || user.isCreator)
      ) {
        const expired = props.ui.now > pendingInvite!.expiresAt;
        let revokeLabel: string;

        if (expired) {
          revokeLabel = isDeleting ? "Removing..." : "Remove Invitation";
        } else {
          revokeLabel = isDeleting ? "Revoking..." : "Revoke Invitation";
        }

        return (
          <div className="buttons">
            <button
              className="tertiary"
              disabled={isDeleting || isRegenerating}
              onClick={onDelete}
            >
              {revokeLabel}
            </button>

            <button
              className="tertiary"
              disabled={isRegenerating || isDeleting}
              onClick={async () => {
                if (user.type != "orgUser" || !pendingInvite) {
                  return;
                }

                const orgRole = graph[user.orgRoleId] as Rbac.OrgRole;

                setIsRegenerating(true);

                await wait(400);

                props.setUiState({ justRegeneratedInviteForUserId: user.id });

                await wait(50);

                props
                  .dispatch({
                    type: Client.ActionType.INVITE_USERS,
                    payload: [
                      {
                        user: pick(
                          [
                            "email",
                            "firstName",
                            "lastName",
                            "provider",
                            "uid",
                            "externalAuthProviderId",
                            "orgRoleId",
                          ],
                          user
                        ),
                        appUserGrants: orgRole.autoAppRoleId
                          ? undefined
                          : (g
                              .graphTypes(graph)
                              .apps.map((app) => {
                                const appRole = g.getAppRoleForUserOrInvitee(
                                  graph,
                                  app.id,
                                  user.id
                                );

                                if (appRole) {
                                  return {
                                    appId: app.id,
                                    appRoleId: appRole.id,
                                  };
                                }

                                return undefined;
                              })
                              .filter(
                                Boolean
                              ) as Client.PendingInvite["appUserGrants"]),
                      },
                    ],
                  })
                  .then((res) => {
                    if (!res.success) {
                      logAndAlertError(
                        `There was a problem regenerating the invitation.`,
                        res.resultAction
                      );
                    }
                  });
              }}
            >
              {isRegenerating ? "Regenerating..." : "Regenerate Invitation"}
            </button>
          </div>
        );
      }
    };

    const renderEmail = () => {
      if (user.type == "cliUser") {
        return "";
      }

      return (
        <div className="field">
          <label>Email</label>
          <span>
            <strong>{user.email}</strong>
          </span>
        </div>
      );
    };

    return (
      <div
        className={
          styles.OrgContainer +
          " " +
          style({
            $nest: {
              "div.danger-zone": {
                marginTop: 0,
              },
            },
          })
        }
      >
        {renderNameOrRename()}
        {renderEmail()}
        {renderRoleOrUpdateUserRole()}
        {renderAccessStatus()}
        {renderDangerZone()}
        {renderInviteButtons()}
      </div>
    );
  };
  return Settings;
};

export const OrgUserSettings = getComponent("orgUser");
export const CliUserSettings = getComponent("cliUser");

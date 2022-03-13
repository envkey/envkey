import React, { useLayoutEffect, useState } from "react";
import { OrgComponent } from "@ui_types";
import { Link } from "react-router-dom";
import { Auth, Client, Model, Rbac } from "@core/types";
import { SvgImage } from "@images";
import { inviteRoute } from "./helpers";
import * as styles from "@styles";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { wait } from "@core/lib/utils/wait";
import * as R from "ramda";
import { logAndAlertError } from "@ui_lib/errors";

export const InviteUsers: OrgComponent<{ appId?: string }> = (props) => {
  const graph = props.core.graph;
  const pendingInvites = props.core.pendingInvites;
  const generatedInvites = props.core.generatedInvites;
  const appId = props.routeParams.appId;

  const [isInviting, setIsInviting] = useState(false);
  const [invitingPending, setInvitingPending] =
    useState<Client.PendingInvite[]>();
  const [awaitingMinDelay, setAwaitingMinDelay] = useState(false);

  useLayoutEffect(() => {
    if (generatedInvites.length > 0 && !awaitingMinDelay) {
      props.history.replace(inviteRoute(props, "/invite-users/generated"));
    }
  }, [generatedInvites.length > 0, awaitingMinDelay]);

  useLayoutEffect(() => {
    if (
      generatedInvites.length == 0 &&
      pendingInvites.length == 0 &&
      !isInviting
    ) {
      props.history.replace(inviteRoute(props, "/invite-users/form"));
    }
  }, [pendingInvites.length == 0]);

  const onSubmit = async () => {
    setIsInviting(true);
    setAwaitingMinDelay(true);
    setInvitingPending(pendingInvites);

    wait(MIN_ACTION_DELAY_MS).then(() => setAwaitingMinDelay(false));

    props
      .dispatch({
        type: Client.ActionType.INVITE_USERS,
        payload: pendingInvites,
      })
      .then((res) => {
        if (!res.success) {
          logAndAlertError(
            `There was a problem generating the invitation${
              pendingInvites.length > 0 ? "s" : ""
            }.`,
            (res.resultAction as any).payload
          );
        }
      });
  };

  const renderPending = (pending: Client.PendingInvite, i: number) => (
    <div className="pending" key={`pending-${i}`}>
      <div>
        <span className="title">
          {pending.user.firstName} {pending.user.lastName}
        </span>
        <span className="subtitle">{pending.user.email}</span>
      </div>

      <div>
        <div className="access">
          <span className="role">
            {(graph[pending.user.orgRoleId] as Rbac.OrgRole).name}
          </span>
          {pending.appUserGrants ? (
            <span className="apps">
              <span className="sep">{"●"}</span>
              {pending.appUserGrants.length} app
              {pending.appUserGrants.length > 1 ? "s" : ""}
            </span>
          ) : (
            ""
          )}
        </div>

        {isInviting ? (
          ""
        ) : (
          <div className="actions">
            <span
              className="edit"
              onClick={() => {
                props.history.push(
                  inviteRoute(props, `/invite-users/form/${i}`)
                );
              }}
            >
              <SvgImage type="edit" />
              <span>Edit</span>
            </span>
            <span
              className="delete"
              onClick={() => {
                props
                  .dispatch({
                    type: Client.ActionType.REMOVE_PENDING_INVITE,
                    payload: i,
                  })
                  .then((res) => {
                    if (!res.success) {
                      logAndAlertError(
                        `There was a problem removing the pending invite.`,
                        (res.resultAction as any).payload
                      );
                    }
                  });
              }}
            >
              <SvgImage type="x" />
              <span>Remove</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );

  const renderPendingInvites = () => {
    if (
      pendingInvites.length > 0 ||
      (invitingPending && invitingPending.length > 0)
    ) {
      return (
        <div>
          <h3>
            Review <strong>Invitations</strong>
          </h3>
          <div className="pending-invites">
            {(invitingPending ?? pendingInvites).map(renderPending)}
          </div>
        </div>
      );
    }
  };

  const hadInviteErrors =
    Object.keys(props.core.generateInviteErrors).length > 0;
  const inviteErrorsInfo = hadInviteErrors
    ? R.values(props.core.generateInviteErrors).map((e) => (
        <span style={{ color: "#eee", font: "12px monospace" }}>
          {JSON.stringify(e.error)}
        </span>
      ))
    : null;

  const renderActions = () => (
    <div className="buttons">
      <Link
        className={"secondary" + (isInviting ? " disabled" : "")}
        onClick={(e) => {
          if (isInviting) {
            e.preventDefault();
          }
        }}
        to={inviteRoute(props, "/invite-users/form")}
      >
        Add Someone Else
      </Link>
      <button
        className="primary"
        disabled={isInviting && !hadInviteErrors}
        onClick={onSubmit}
      >
        {isInviting && !hadInviteErrors
          ? `Sending Invitation${pendingInvites.length > 1 ? "s" : ""}...`
          : `Send Invitation${pendingInvites.length > 1 ? "s" : ""}`}
      </button>
    </div>
  );

  return (
    <div className={styles.InviteUsers}>
      {renderPendingInvites()}
      {hadInviteErrors ? (
        <p className="error">
          There was a problem sending the invitation
          {props.core.pendingInvites.length == 1 ? "" : "s"}.
          <br />
          {inviteErrorsInfo}
        </p>
      ) : (
        ""
      )}
      {renderActions()}
    </div>
  );
};

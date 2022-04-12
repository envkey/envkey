import React, { useState, useEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Api, Model } from "@core/types";
import * as g from "@core/lib/graph";
import * as styles from "@styles";
import { SmallLoader } from "@images";
import { Link } from "react-router-dom";
import { logAndAlertError } from "@ui_lib/errors";

export const NewTeam: OrgComponent = (props) => {
  const { dispatch, core, history, orgRoute } = props;
  const { graph } = core;
  const currentUserId = props.ui.loadedAccountId!;

  const { license } = g.graphTypes(graph);
  const licenseExpired =
    license.expiresAt != -1 && props.ui.now > license.expiresAt;

  const [name, setName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string>();

  const canSubmit = name.trim();

  const created = createdId
    ? (graph[createdId] as Model.Group | undefined)
    : undefined;

  useEffect(() => {
    if (created) {
      history.push(orgRoute(`/teams/${created.id}/members`));
    }
  }, [Boolean(created)]);

  const onSubmit = async () => {
    if (!canSubmit || submitting || Boolean(createdId)) {
      return;
    }

    setSubmitting(true);

    const res = await dispatch({
      type: Api.ActionType.CREATE_GROUP,
      payload: {
        objectType: "orgUser",
        name,
      },
    });

    if (res.success) {
      const { groups } = g.graphTypes(res.state.graph);
      const createdGroup = groups.find(
        ({ createdAt }) => createdAt === res.state.graphUpdatedAt
      );
      setCreatedId(createdGroup!.id);
    } else {
      logAndAlertError(
        "There was a problem creating the team.",
        (res.resultAction as any)?.payload
      );
    }
  };

  if (licenseExpired || license.plan != "paid" || license.isCloudEssentials) {
    const blockStatement = licenseExpired ? (
      <p>
        {`Your organization's ${
          license.provisional ? "provisional " : ""
        }license has `}
        <strong>expired.</strong>
      </p>
    ) : (
      ""
    );

    const canManageBilling = g.authz.hasOrgPermission(
      graph,
      currentUserId,
      "org_manage_billing"
    );

    return (
      <div className={styles.OrgContainer}>
        <h3>
          {licenseExpired ? "Renew" : "Upgrade"} <strong>License</strong>
        </h3>
        {blockStatement}
        {canManageBilling ? (
          <p>
            To enable Teams, {licenseExpired ? "renew" : "upgrade"} your org's
            license.
          </p>
        ) : (
          <p>
            To enable Teams, ask an admin to{" "}
            {licenseExpired ? "renew" : "upgrade"} your org's license.
          </p>
        )}
        {canManageBilling ? (
          <div className="buttons">
            {canManageBilling ? (
              <Link className="primary" to={props.orgRoute("/my-org/billing")}>
                Go To Billing →
              </Link>
            ) : (
              ""
            )}
          </div>
        ) : (
          ""
        )}
      </div>
    );
  }

  return (
    <div
      className={styles.OrgContainer}
      onKeyPress={(e) => {
        if (e.key == "Enter") {
          onSubmit();
        }
      }}
    >
      <div className="field">
        <label>Team Name</label>
        <input
          type="text"
          value={name}
          placeholder={"Enter team name..."}
          disabled={Boolean(submitting || createdId)}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>

      <div className="buttons">
        <button
          className="primary"
          disabled={!canSubmit || submitting || Boolean(createdId)}
          onClick={onSubmit}
        >
          {submitting ? <SmallLoader /> : "Create Team"}
        </button>
      </div>
    </div>
  );
};

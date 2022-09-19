import React, { useState, useMemo } from "react";
import { OrgComponent } from "@ui_types";
import { Api } from "@core/types";
import * as g from "@core/lib/graph";

export const SelfHostedLicense: OrgComponent = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const { org } = useMemo(
    () => g.graphTypes(graph),
    [graphUpdatedAt, currentUserId]
  );

  const [newLicense, setNewLicense] = useState("");
  const [isUpdatingLicense, setIsUpdatingLicense] = useState(false);

  return (
    <div className="upgrade-license">
      <h3>
        Upgrade Or Renew <strong>License</strong>
      </h3>

      <p>
        To upgrade or renew your license, email{" "}
        <strong>sales@envkey.com</strong>
        <br />
        Please include your <strong>Billing Id.</strong>
      </p>

      <div className="field billing-id">
        <label>Billing ID</label> <span>{org.billingId!}</span>
      </div>

      <div className="field new-license">
        <label>Set New License</label>
        <textarea
          value={newLicense}
          disabled={isUpdatingLicense}
          onChange={(e) => setNewLicense(e.target.value)}
          placeholder="Paste license here"
        />
        <button
          className="primary"
          disabled={!newLicense || isUpdatingLicense}
          onClick={async () => {
            setIsUpdatingLicense(true);

            const res = await props.dispatch({
              type: Api.ActionType.UPDATE_LICENSE,
              payload: { signedLicense: newLicense },
            });

            setIsUpdatingLicense(false);
            setNewLicense("");

            if (res.success) {
              alert("Your org's license was updated successfully");
              window.scrollTo(0, 0);
            } else {
              alert(
                "Your license is invalid, expired, or could not be updated. Please make sure you've copied it correctly and try again. Contact sales@envkey.com if the problem persists."
              );
              console.log(
                "Update license failed",
                (res.resultAction as any)?.payload
              );
            }
          }}
        >
          {isUpdatingLicense ? "Updating..." : "Update License"}
        </button>
      </div>
    </div>
  );
};

import React, { useState, useMemo, useEffect } from "react";
import { OrgComponent } from "@ui_types";
import { capitalize } from "@core/lib/utils/string";
import { Api, Billing } from "@core/types";
import moment from "moment";
import * as g from "@core/lib/graph";
import * as styles from "@styles";
import { SvgImage } from "@images";
import { logAndAlertError } from "@ui_lib/errors";

export const BillingUI: OrgComponent = (props) => {
  const { graph, graphUpdatedAt, orgStats } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const { org, license, numPendingDevices, numActiveCliUsers } = useMemo(() => {
    const { org, license } = g.graphTypes(graph);

    const numActiveInvites = g.getActiveInvites(graph, props.ui.now).length;
    const numActiveGrants = g.getActiveDeviceGrants(graph, props.ui.now).length;

    return {
      org,
      orgStats,
      license,
      numPendingDevices: numActiveInvites + numActiveGrants,
      numActiveCliUsers: g.getActiveCliUsers(graph).length,
    };
  }, [graphUpdatedAt, currentUserId]);

  const expiresMoment = useMemo(
    () => (license.expiresAt == -1 ? undefined : moment(license.expiresAt)),
    [JSON.stringify(license)]
  );

  const [newLicense, setNewLicense] = useState("");
  const [isUpdatingLicense, setIsUpdatingLicense] = useState(false);

  useEffect(() => {
    if (
      license.hostType == "cloud" &&
      !orgStats &&
      !props.core.isFetchingOrgStats
    ) {
      props
        .dispatch({
          type: Api.ActionType.FETCH_ORG_STATS,
          payload: {},
        })
        .then((res) => {
          if (!res.success) {
            logAndAlertError(
              "There was a problem fetching your org's resource usage.",
              res.resultAction
            );
          }
        });
    }
  }, [Boolean(license.hostType == "cloud" && orgStats)]);

  const refreshStatsIcon =
    props.core.isFetchingOrgStats || !orgStats ? (
      ""
    ) : (
      <span
        className="refresh"
        onClick={() =>
          props
            .dispatch({
              type: Api.ActionType.FETCH_ORG_STATS,
              payload: {},
            })
            .then((res) => {
              if (!res.success) {
                logAndAlertError(
                  "There was a problem fetching your org's resource usage.",
                  res.resultAction
                );
              }
            })
        }
      >
        <SvgImage type="restore" />
      </span>
    );

  return (
    <div className={styles.Billing}>
      <div className="current-license">
        <h3>
          Current <strong>License</strong>
        </h3>
        <div className="field">
          <label>Type</label>
          <span>
            {capitalize(license.plan)}
            {license.provisional ? " (provisional)" : ""}
          </span>
        </div>
        <div className="field">
          <label>Expires</label>
          <span>
            {license.expiresAt == -1
              ? "Never"
              : expiresMoment!.format("MMMM Do, YYYY") +
                ` (${expiresMoment!.startOf("day").fromNow()})`}
          </span>
        </div>
        <div className="field">
          <label>Devices</label>

          <span>
            using {org.deviceLikeCount}/{license.maxDevices}{" "}
            {numPendingDevices > 0 ? (
              <small>
                {" "}
                {org.deviceLikeCount -
                  (numPendingDevices + numActiveCliUsers)}{" "}
                active, {numPendingDevices} pending, {numActiveCliUsers} CLI
                keys
              </small>
            ) : (
              ""
            )}
          </span>
        </div>
        <div className="field">
          <label>Server ENVKEYs</label>
          <span>
            using {org.serverEnvkeyCount}/{license.maxServerEnvkeys}
          </span>
        </div>

        {license.hostType == "cloud" && orgStats
          ? [
              <div className="field">
                <label>
                  Api Calls
                  {refreshStatsIcon}
                </label>
                <span>
                  last hour: {orgStats.apiCallsThisHour}/
                  {license.maxCloudApiCallsPerHour}
                  <br />
                  last 30d: {orgStats.apiCallsThisMonth}/
                  {license.maxCloudApiCallsPerMonth}
                </span>
              </div>,
              <div className="field">
                <label>Data Transfer {refreshStatsIcon}</label>
                <span>
                  last hour:{" "}
                  {(orgStats.dataTransferBytesThisHour / 1000000).toFixed(2)}mb/
                  {license.maxCloudDataTransferPerHourMb}mb
                  <br />
                  last 30d:{" "}
                  {(orgStats.dataTransferBytesThisMonth / 1000000).toFixed(2)}
                  mb/
                  {license.maxCloudDataTransferPerMonthMb}mb
                </span>
              </div>,
              <div className="field">
                <label>Storage {refreshStatsIcon}</label>
                <span>
                  {(orgStats.blobStorageBytes / 1000000).toFixed(2)}mb/
                  {license.maxCloudStorageMb}mb
                </span>
              </div>,
              <div className="field">
                <label>Active Socket Connections {refreshStatsIcon}</label>
                <span>
                  {orgStats.activeSocketConnections}/
                  {license.maxCloudActiveSocketConnections}
                </span>
              </div>,
            ]
          : ""}
      </div>

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
                console.log("Update license failed", res.resultAction);
              }
            }}
          >
            {isUpdatingLicense ? "Updating..." : "Update License"}
          </button>
        </div>
      </div>
    </div>
  );
};

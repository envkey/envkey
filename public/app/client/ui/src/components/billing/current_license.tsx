import React, { useState, useMemo, useEffect } from "react";
import { OrgComponent } from "@ui_types";
import { capitalize } from "@core/lib/utils/string";
import { Api, Billing } from "@core/types";
import moment from "moment";
import * as g from "@core/lib/graph";
import { SvgImage } from "@images";
import { logAndAlertError } from "@ui_lib/errors";

export const CurrentLicense: OrgComponent = (props) => {
  const { graph, graphUpdatedAt, orgStats } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const { org, license, subscription, numPendingDevices, numActiveInvites } =
    useMemo(() => {
      const { org, license, subscription } = g.graphTypes(graph);

      const numActiveInvites = g.getActiveInvites(graph, props.ui.now).length;
      const numActiveGrants = g.getActiveDeviceGrants(
        graph,
        props.ui.now
      ).length;

      return {
        org,
        orgStats,
        license,
        subscription,
        numPendingDevices: numActiveInvites + numActiveGrants,
        numActiveInvites,
      };
    }, [graphUpdatedAt, currentUserId]);

  const currentProduct = subscription
    ? (graph[subscription.productId] as Billing.Product)
    : undefined;
  const currentPrice = subscription
    ? (graph[subscription.priceId] as Billing.Price)
    : undefined;

  const expiresMoment = useMemo(
    () => (license.expiresAt == -1 ? undefined : moment(license.expiresAt)),
    [JSON.stringify(license)]
  );

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
              (res.resultAction as any)?.payload
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
                  (res.resultAction as any)?.payload
                );
              }
            })
        }
      >
        <SvgImage type="restore" />
      </span>
    );

  return (
    <div className="current-license">
      <h3>
        Current{" "}
        <strong>
          {license.hostType == "cloud" &&
          !license.provisional &&
          !org.customLicense
            ? "Subscription"
            : "License"}
        </strong>
      </h3>
      <div className="field">
        <label>
          {(subscription && currentProduct) ||
          (license.hostType == "cloud" &&
            !license.provisional &&
            !org.customLicense)
            ? "Plan"
            : "Type"}
        </label>
        <span>
          {subscription && currentProduct
            ? currentProduct.name.replace("v2 ", "")
            : license.hostType == "cloud" && license.plan == "free"
            ? "Community Cloud"
            : [
                capitalize(license.plan),
                license.provisional ? " (provisional)" : "",
              ]}
        </span>
      </div>
      {subscription && currentPrice ? (
        <div className="field">
          <label>Billing Period</label>
          <span>
            {{ month: "Monthly", year: "Annual" }[currentPrice.interval]}
          </span>
        </div>
      ) : (
        ""
      )}
      {license.hostType != "cloud" && license.plan != "free" ? (
        <div className="field">
          <label>Expires</label>
          <span>
            {license.expiresAt == -1
              ? "Never"
              : expiresMoment!.format("MMMM Do, YYYY") +
                ` (${expiresMoment!.startOf("day").fromNow()})`}
          </span>
        </div>
      ) : (
        ""
      )}

      {!license.maxUsers ||
      !org.activeUserOrInviteCount ||
      license.maxUsers == -1 ? (
        ""
      ) : (
        <div className="field">
          <label>Users</label>

          <span>
            using {org.activeUserOrInviteCount}/{license.maxUsers}{" "}
            {numActiveInvites > 0 ? (
              <small>
                {" "}
                {org.activeUserOrInviteCount - numActiveInvites} active,{" "}
                {numActiveInvites} pending
              </small>
            ) : (
              ""
            )}
          </span>
        </div>
      )}

      {license.maxDevices == -1 ? (
        ""
      ) : (
        <div className="field">
          <label>Devices/CLI Keys</label>

          <span>
            using {org.deviceLikeCount}/{license.maxDevices}{" "}
            {numPendingDevices > 0 ? (
              <small>
                {" "}
                {org.deviceLikeCount - numPendingDevices} active,{" "}
                {numPendingDevices} pending
              </small>
            ) : (
              ""
            )}
          </span>
        </div>
      )}

      {license.maxServerEnvkeys == -1 ? (
        ""
      ) : (
        <div className="field">
          <label>Server ENVKEYs</label>
          <span>
            using {org.serverEnvkeyCount}/{license.maxServerEnvkeys}
          </span>
        </div>
      )}

      {license.hostType == "cloud" && orgStats
        ? [
            <div className="field">
              <label>ENVKEY watchers {refreshStatsIcon}</label>
              <span>
                {orgStats.activeSocketConnections}/
                {license.maxCloudActiveSocketConnections}
              </span>
            </div>,
            // license.maxCloudApiCallsPerHour == -1 &&
            // license.maxCloudApiCallsPerMonth == -1 ? (
            //   ""
            // ) : (
            //   <div className="field">
            //     <label>
            //       Api Calls
            //       {refreshStatsIcon}
            //     </label>
            //     <span>
            //       last hour: {orgStats.apiCallsThisHour}/
            //       {license.maxCloudApiCallsPerHour}
            //       <br />
            //       last 30d: {orgStats.apiCallsThisMonth}/
            //       {license.maxCloudApiCallsPerMonth}
            //     </span>
            //   </div>
            // ),

            <div className="field">
              <label>Data Transfer {refreshStatsIcon}</label>
              <span>
                last hour:{" "}
                {(orgStats.dataTransferBytesThisHour / 1000000).toFixed(2)}mb/
                {license.maxCloudDataTransferPerHourMb}mb
                {license.maxCloudDataTransferPerDayMb &&
                license.maxCloudDataTransferPerDayMb != -1
                  ? [
                      <br />,
                      "last 24h: ",
                      `${(orgStats.dataTransferBytesThisDay / 1000000).toFixed(
                        2
                      )}mb/${license.maxCloudDataTransferPerDayMb}mb`,
                    ]
                  : ""}
              </span>
            </div>,

            license.maxCloudStorageMb == -1 ? (
              ""
            ) : (
              <div className="field">
                <label>Storage {refreshStatsIcon}</label>
                <span>
                  {(orgStats.blobStorageBytes / 1000000).toFixed(2)}mb/
                  {license.maxCloudStorageMb}mb
                </span>
              </div>
            ),
          ]
        : ""}
    </div>
  );
};

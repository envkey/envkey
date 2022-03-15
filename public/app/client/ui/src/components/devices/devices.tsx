import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { OrgComponent } from "@ui_types";
import { Client, Model, Api } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { simpleDurationString, twitterShortTs } from "@core/lib/utils/date";
import * as styles from "@styles";
import { SvgImage } from "@images";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { wait } from "@core/lib/utils/wait";
import copy from "copy-text-to-clipboard";
import { logAndAlertError } from "@ui_lib/errors";

const getDevicesComponent = (isTopLevel?: true) => {
  const Devices: OrgComponent<{ userId?: string }> = (props) => {
    const now = props.ui.now;
    const { graph, graphUpdatedAt } = props.core;
    const currentUserId = props.ui.loadedAccountId!;

    const dispatchClearGenerated = () =>
      props.dispatch({ type: Client.ActionType.CLEAR_GENERATED_DEVICE_GRANTS });

    const [users, userId, devices] = useMemo(() => {
      const users = g.authz.getDeviceApprovableUsers(graph, currentUserId);
      const userIds = new Set(users.map(R.prop("id")));

      const revokableDevices = g.authz.getRevokableDevices(
        graph,
        currentUserId
      );
      for (let { userId } of revokableDevices) {
        if (!userIds.has(userId)) {
          users.push(graph[userId] as Model.OrgUser);
          userIds.add(userId);
        }
      }

      const revokableDeviceGrants = g.authz.getRevokableDeviceGrants(
        graph,
        currentUserId
      );
      for (let { granteeId } of revokableDeviceGrants) {
        if (!userIds.has(granteeId)) {
          users.push(graph[granteeId] as Model.OrgUser);
          userIds.add(granteeId);
        }
      }

      let userId = props.routeParams.userId ?? currentUserId;
      if (!userIds.has(userId)) {
        userId = users[0].id;
      }

      const devices = (
        g.getActiveOrgUserDevicesByUserId(graph)[userId] ?? []
      ).filter(({ approvedAt }) => approvedAt);

      return [users, userId, devices];
    }, [graphUpdatedAt, currentUserId, props.routeParams.userId]);

    const generatedGrants = useMemo(
      () =>
        Object.values(props.core.generatedDeviceGrants).filter(
          (generated) => generated.granteeId == userId
        ),
      [props.core, userId]
    );

    const [pendingGrants, expiredGrants] = useMemo(() => {
      const generatedCreatedAtSet = new Set(
        generatedGrants.map(R.prop("createdAt"))
      );

      const pendingOrExpired = (
        g.getActiveOrExpiredDeviceGrantsByGranteeId(graph)[userId] ?? []
      ).filter(({ createdAt }) => !generatedCreatedAtSet.has(createdAt));

      const [expiredGrants, pendingGrants] = R.partition(
        ({ expiresAt }) => now > expiresAt,
        pendingOrExpired
      );

      return [pendingGrants, expiredGrants];
    }, [graphUpdatedAt, currentUserId, generatedGrants]);

    const [license, numActive] = useMemo(() => {
      const { license, org } = g.graphTypes(graph);
      return [license, org.deviceLikeCount];
    }, [graphUpdatedAt, currentUserId, props.ui.now]);

    useEffect(() => {
      if (props.core.generatedDeviceGrants.length > 0) {
        dispatchClearGenerated();
      }
    }, [userId]);

    useEffect(() => {
      return () => {
        if (props.core.generatedDeviceGrants.length > 0) {
          dispatchClearGenerated();
        }
      };
    }, []);

    const [copiedIndex, setCopiedIndex] = useState<number>();

    const [generatedGrant, setGeneratedGrant] = useState(false);
    const [generatingGrant, setGeneratingGrant] = useState(false);

    const [revokingId, setRevokingId] = useState<string>();

    const [awaitingMinDelay, setAwaitingMinDelay] = useState(false);

    useEffect(() => {
      if (generatingGrant && generatedGrants.length > 0 && !awaitingMinDelay) {
        setGeneratingGrant(false);
        setGeneratedGrant(true);
      }
    }, [generatedGrants.length > 0, awaitingMinDelay]);

    useEffect(() => {
      if (revokingId && !awaitingMinDelay) {
        const pendingGrantIds = new Set(pendingGrants.map(R.prop("id")));

        if (!pendingGrantIds.has(revokingId)) {
          setRevokingId(undefined);
        }
      }
    }, [pendingGrants.length, awaitingMinDelay]);

    const user = graph[userId] as Model.OrgUser;
    const org = g.getOrg(graph);

    let cancelBtn: React.ReactNode;
    if (generatedGrant || (generatedGrants.length > 0 && !generatingGrant)) {
      cancelBtn = (
        <button
          className="secondary"
          onClick={() => {
            setGeneratedGrant(false);
            dispatchClearGenerated();
          }}
        >
          Done
        </button>
      );
    }

    const renderUserSelect = () => {
      if (!isTopLevel) {
        return;
      }
      return [
        <h3>
          Manage <strong>Devices</strong>
        </h3>,
        <div className="field">
          <label>Person</label>
          <div className="select">
            <select
              value={userId}
              onChange={(e) => {
                props.history.push(
                  props.orgRoute(`/devices/${e.target.value}`)
                );
              }}
            >
              {users.map((user) => (
                <option value={user.id}>{g.getUserName(graph, user.id)}</option>
              ))}
            </select>
            <SvgImage type="down-caret" />
          </div>
        </div>,
      ];
    };

    const renderRevokeDevice = (device: Model.OrgUserDevice) => {
      const revoking = revokingId == device.id;
      const label = revoking ? "Revoking..." : "Revoke";

      return (
        <span
          className={
            "delete" + (generatingGrant || revokingId ? " disabled" : "")
          }
          onClick={() => {
            setRevokingId(device.id);
            setAwaitingMinDelay(true);
            wait(MIN_ACTION_DELAY_MS).then(() => setAwaitingMinDelay(false));

            props
              .dispatch({
                type: Api.ActionType.REVOKE_DEVICE,
                payload: { id: device.id },
              })
              .then((res) => {
                if (!res.success) {
                  logAndAlertError(
                    "There was a problem revoking the device.",
                    (res.resultAction as any)?.payload
                  );
                }
              });
          }}
        >
          <SvgImage type="x" />
          <span>{label}</span>
        </span>
      );
    };

    const renderAuthorizedDevices = () => {
      if (devices.length == 0) {
        return;
      }
      return [
        <h4>Authorized Devices</h4>,
        <div className="authorized-devices">
          {devices.map((device) => {
            return (
              <div>
                <div>
                  <span className="title">{device.name}</span>
                  <span className="subtitle">
                    {twitterShortTs(device.approvedAt!, now)}
                  </span>
                </div>

                {g.authz.canRevokeDevice(graph, currentUserId, device.id) ? (
                  <div>
                    <div
                      className={"actions" + (revokingId ? " disabled" : "")}
                    >
                      {renderRevokeDevice(device)}
                    </div>
                  </div>
                ) : (
                  ""
                )}
              </div>
            );
          })}
        </div>,
      ];
    };

    const renderRevokeDeviceGrant = (grant: Model.DeviceGrant) => {
      const revoking = revokingId == grant.id;
      let label: string;

      if (props.ui.now > grant.expiresAt) {
        label = revoking ? "Removing..." : "Remove";
      } else {
        label = revoking ? "Revoking..." : "Revoke";
      }

      return (
        <span
          className={
            "delete" + (generatingGrant || revokingId ? " disabled" : "")
          }
          onClick={() => {
            if (revokingId) {
              return;
            }

            setRevokingId(grant.id);
            setAwaitingMinDelay(true);
            wait(MIN_ACTION_DELAY_MS).then(() => setAwaitingMinDelay(false));

            props
              .dispatch({
                type: Api.ActionType.REVOKE_DEVICE_GRANT,
                payload: { id: grant.id },
              })
              .then((res) => {
                if (!res.success) {
                  logAndAlertError(
                    "There was a problem revoking the device invitation.",
                    (res.resultAction as any)?.payload
                  );
                }
              });
          }}
        >
          <SvgImage type="x" />
          <span>{label}</span>
        </span>
      );
    };

    const renderPendingGrants = () => {
      if (pendingGrants.length == 0) {
        return;
      }

      return [
        <h4>Pending Device Invitations</h4>,
        <div className="pending-device-grants">
          {pendingGrants.map((pending, i) => (
            <div>
              <div>
                <span className="title">
                  Pending Device Invitation{" "}
                  {pendingGrants.length > 1 ? i + 1 : ""}
                </span>
                <span className="subtitle">
                  {twitterShortTs(pending.createdAt, now)}
                </span>
              </div>
              <div>
                <div className={"actions" + (revokingId ? " disabled" : "")}>
                  {renderRevokeDeviceGrant(pending)}
                </div>
              </div>
            </div>
          ))}
        </div>,
      ];
    };

    const renderExpiredGrants = () => {
      if (expiredGrants.length == 0) {
        return;
      }

      return [
        <h4>Expired Device Invitations</h4>,
        <div className="expired-device-grants">
          {expiredGrants.map((expired, i) => (
            <div>
              <div>
                <span className="title">
                  Expired Device Invitation{" "}
                  {expiredGrants.length > 1 ? i + 1 : ""}
                </span>
                <span className="subtitle">
                  {twitterShortTs(expired.expiresAt, now)}
                </span>
              </div>
              <div>
                <div className={"actions" + (revokingId ? " disabled" : "")}>
                  {renderRevokeDeviceGrant(expired)}
                </div>
              </div>
            </div>
          ))}
        </div>,
      ];
    };

    const renderGeneratedGrants = () => {
      const numGrants = generatedGrants.length;

      return (
        <div>
          <h3>
            {numGrants > 1
              ? `${numGrants} Device Invitations `
              : "Device Invitation "}
            <strong>Generated</strong>
          </h3>

          <p>
            {`${numGrants > 1 ? `${numGrants} ` : "A "}device invitation${
              numGrants > 1 ? "s have" : " has"
            } been sent to ${
              user.id == currentUserId ? "you" : user.firstName
            } by `}
            <strong>email.</strong>
          </p>

          <p>
            {[
              `You also need to send ${
                user.id == currentUserId ? "yourself" : user.firstName
              } an `,
              <em>Encryption Token</em>,
              ` by any reasonably private channel (like Slack, Twitter, LinkedIn, or Facebook).`,
            ]}
          </p>

          <p>
            {numGrants > 1 ? "These invitations" : "This invitation"} will
            expire in{" "}
            <strong>
              {simpleDurationString(org.settings.auth.inviteExpirationMs)}
            </strong>
            . {numGrants > 1 ? "Encryption Tokens" : "The Encryption Token"}{" "}
            can't be retrieved after you leave this screen, but you can always
            generate
            {numGrants > 1 ? " new invitations" : " a new invitation"}.
          </p>

          <div className="generated-invites">
            {generatedGrants.map(({ identityHash, encryptionKey }, i) => {
              const encryptionToken = [identityHash, encryptionKey].join("_");

              return (
                <div>
                  <div className="token">
                    <div>
                      <span>
                        <label>Encryption Token</label>
                        {encryptionToken.substr(0, 20)}…
                      </span>

                      <button
                        onClick={() => {
                          setCopiedIndex(i);
                          copy(encryptionToken);
                        }}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  {copiedIndex === i ? <small>Copied.</small> : ""}
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    const renderAuthorizeNewDevice = () => {
      if (!g.authz.canCreateDeviceGrant(graph, currentUserId, userId)) {
        return;
      }

      const licenseExpired =
        license.expiresAt != -1 && props.ui.now > license.expiresAt;
      if (
        (license.maxDevices != -1 && numActive >= license.maxDevices) ||
        licenseExpired
      ) {
        const blockStatement = licenseExpired
          ? `Your organization's ${
              license.provisional ? "provisional " : ""
            }license has expired.`
          : `Your organization has reached its limit of ${
              license.maxDevices
            } device${license.maxDevices == 1 ? "" : "s"}.`;

        const canManageBilling = g.authz.hasOrgPermission(
          graph,
          currentUserId,
          "org_manage_billing"
        );

        return (
          <div className="billing-wall">
            {g.authz.hasOrgPermission(
              graph,
              currentUserId,
              "org_manage_billing"
            ) ? (
              <p>
                {blockStatement}
                To authorize another device,{" "}
                {licenseExpired ? "renew" : "upgrade"} your org's license.
              </p>
            ) : (
              <p>
                {blockStatement}
                To authorize another device, ask an admin to{" "}
                {licenseExpired ? "renew" : "upgrade"} your org's license.
              </p>
            )}
            {cancelBtn || canManageBilling ? (
              <div className="buttons">
                {cancelBtn}
                {canManageBilling ? (
                  <Link
                    className="primary"
                    to={props.orgRoute("/my-org/billing")}
                  >
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
        <div className="buttons">
          {cancelBtn}
          <button
            className="primary"
            disabled={Boolean(generatingGrant || revokingId)}
            onClick={() => {
              setGeneratingGrant(true);
              setAwaitingMinDelay(true);
              setCopiedIndex(undefined);

              wait(MIN_ACTION_DELAY_MS).then(() => setAwaitingMinDelay(false));

              dispatchClearGenerated().then(() =>
                props
                  .dispatch({
                    type: Client.ActionType.APPROVE_DEVICES,
                    payload: [{ granteeId: userId }],
                  })
                  .then((res) => {
                    if (!res.success) {
                      logAndAlertError(
                        "There was a problem authorizing a device.",
                        (res.resultAction as any)?.payload
                      );
                    }
                  })
              );
            }}
          >
            {generatingGrant
              ? `Authorizing Device...`
              : `Authorize ${
                  generatedGrants.length > 0 ? " Another" : " A New"
                } Device`}
          </button>
        </div>
      );
    };

    return (
      <div className={styles.Devices}>
        {generatedGrant || (generatedGrants.length > 0 && !generatingGrant)
          ? [renderGeneratedGrants(), renderAuthorizeNewDevice()]
          : [
              renderUserSelect(),
              renderAuthorizedDevices(),
              renderPendingGrants(),
              renderExpiredGrants(),
              renderAuthorizeNewDevice(),
            ]}
      </div>
    );
  };

  return Devices;
};

export const OrgDevices = getDevicesComponent(true);
export const UserDevices = getDevicesComponent();

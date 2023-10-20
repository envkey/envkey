import React, { useState, useEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Client, Api } from "@core/types";
import * as g from "@core/lib/graph";
import * as ui from "@ui";
import * as styles from "@styles";
import { SmallLoader, SvgImage } from "@images";
import { logAndAlertError } from "@ui_lib/errors";
import { twitterShortTs } from "@core/lib/utils/date";
import { wait } from "@core/lib/utils/wait";
import { CopyableDisplay } from "../../settings/copyable_display";
import { Link } from "react-router-dom";

let _runningAuthLoop = false;

export const VantaIntegration: OrgComponent = (props) => {
  const { graph, vantaConnectingAccount } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const { vantaConnectedAccount, license } = g.graphTypes(graph);

  const [isConnecting, setIsConnecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>("");

  const [runningAuthLoop, _setRunningAuthLoop] = useState(false);
  const setRunningAuthLoop = (val: boolean) => {
    _runningAuthLoop = val;
    _setRunningAuthLoop(val);
  };

  const licenseExpired =
    license.expiresAt != -1 && props.ui.now > license.expiresAt;

  useEffect(() => {
    _runningAuthLoop = false;

    props.dispatch({
      type: Client.ActionType.INTEGRATIONS_VANTA_RESET_EXTERNAL_AUTH,
    });

    props.dispatch({
      type: Client.ActionType.REFRESH_SESSION,
    });

    return () => {
      _runningAuthLoop = false;
    };
  }, []);

  useEffect(() => {
    if ((!vantaConnectingAccount || vantaConnectedAccount) && isConnecting) {
      setIsConnecting(false);
      setRunningAuthLoop(false);
    }
  }, [vantaConnectingAccount, vantaConnectedAccount]);

  useEffect(() => {
    if (deleting && !vantaConnectedAccount) {
      setDeleting(false);
    }
  }, [vantaConnectedAccount]);

  // Capture errors
  useEffect(() => {
    const e =
      props.core.vantaStartingExternalAuthSessionError ||
      props.core.vantaExternalAuthSessionCreationError ||
      props.core.vantaAuthorizingExternallyErrorMessage;
    if (!e) {
      return;
    }
    setRunningAuthLoop(false);

    setErrorMessage(
      typeof e === "string" ? e : "errorReason" in e ? e.errorReason : e.type
    );
    setIsConnecting(false);
  }, [
    props.core.vantaStartingExternalAuthSessionError,
    props.core.vantaExternalAuthSessionCreationError,
    props.core.vantaAuthorizingExternallyErrorMessage,
  ]);

  useEffect(() => {
    (async () => {
      if (!props.core.vantaStartingExternalAuthSession) {
        return;
      }
      if (_runningAuthLoop) {
        console.log("runningLoop already started");
        return;
      }
      console.log("starting runningLoop");
      setRunningAuthLoop(true);
      await props.refreshCoreState();
      while (_runningAuthLoop) {
        console.log("runningLoop waiting for saml auth");
        await wait(500);
        await props.refreshCoreState();
      }
    })();
  }, [props.core.vantaStartingExternalAuthSession]);

  const canManageBilling = g.authz.hasOrgPermission(
    graph,
    currentUserId,
    "org_manage_billing"
  );
  let licenseShouldBlock = false;
  let blockStatement: React.ReactNode = "";
  let licenseBlockSection: React.ReactNode | undefined;
  if (licenseExpired) {
    licenseShouldBlock = true;
    blockStatement = [
      `Your organization's ${
        license.provisional ? "provisional " : ""
      }license has `,
      <strong>expired.</strong>,
    ];
  } else if (license.plan != "paid" || license.isCloudBasics) {
    licenseShouldBlock = true;
    blockStatement = "";
  }

  console.log({ license, licenseShouldBlock });

  if (licenseShouldBlock) {
    licenseBlockSection = [
      blockStatement,
      canManageBilling ? (
        <p>
          To enable EnvKey's Vanta integration,{" "}
          {licenseExpired ? "renew" : "upgrade"} your org's license.
        </p>
      ) : (
        <p>
          To enable EnvKey's Vanta integeration, ask an admin to{" "}
          {licenseExpired ? "renew" : "upgrade"} your org's license.
        </p>
      ),
      canManageBilling ? (
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
      ),
    ];
  }

  return (
    <div className={styles.SSOSettings}>
      <h3>
        <strong>Vanta</strong> Connection
      </h3>

      {vantaConnectedAccount ? (
        <div className="providers">
          <div>
            <div>
              <span className="title">Vanta Connection Active</span>
              <span className="subtitle">
                {" "}
                {vantaConnectedAccount.lastSyncAt
                  ? [
                      "Synced ",
                      twitterShortTs(
                        vantaConnectedAccount.lastSyncAt,
                        props.ui.now
                      ),
                    ]
                  : "Not Synced"}
              </span>
            </div>
            <div>
              <div className="actions">
                {deleting ? (
                  <SmallLoader />
                ) : (
                  [
                    <span
                      className="delete"
                      onClick={async () => {
                        if (
                          confirm(
                            "Are you sure you want to delete your org's Vanta connection?"
                          )
                        ) {
                          setDeleting(true);

                          const res = await props.dispatch({
                            type: Api.ActionType
                              .INTEGRATIONS_VANTA_REMOVE_CONNECTION,
                            payload: {},
                          });

                          if (!res.success) {
                            logAndAlertError(
                              "There was a problem deleting your org's Vanta connection.",
                              (res.resultAction as any)?.payload
                            );
                            setDeleting(false);
                          }
                        }
                      }}
                    >
                      <SvgImage type="x" />
                      <span>Remove Connection</span>
                    </span>,
                  ]
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        [
          <p>
            Sync your organization's users with{" "}
            <ui.ExternalLink {...props} to={"https://www.vanta.com"}>
              Vanta
            </ui.ExternalLink>{" "}
            to help automate and simplify security and compliance.
          </p>,

          licenseShouldBlock ? (
            licenseBlockSection
          ) : (
            <div className="buttons">
              <button
                className="primary"
                disabled={isConnecting}
                onClick={(e) => {
                  setIsConnecting(true);
                  props.dispatch({
                    type: Client.ActionType
                      .INTEGRATIONS_VANTA_CREATE_EXTERNAL_AUTH_SESSION_FOR_CONNECTION,
                    payload: {
                      waitOpenMs: 0,
                    },
                  });
                }}
              >
                {isConnecting
                  ? "Authenticating With Vanta..."
                  : "Connect Vanta"}
              </button>
            </div>
          ),

          isConnecting && props.core.vantaPendingExternalAuthSession
            ? [
                <p className="important">
                  Your system's default browser should now pop up so you can
                  authenticate with Vanta. You can also paste the URL into a
                  browser manually:
                </p>,
                <CopyableDisplay
                  {...props}
                  label="SSO Authentication Url"
                  value={props.core.vantaPendingExternalAuthSession.authUrl}
                />,
              ]
            : "",

          errorMessage ? <p className="error">{errorMessage}</p> : "",
        ]
      )}
    </div>
  );
};

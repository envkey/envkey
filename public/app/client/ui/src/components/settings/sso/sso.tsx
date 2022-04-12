import React from "react";
import { OrgComponent } from "@ui_types";
import * as g from "@core/lib/graph";
import * as styles from "@styles";
import { SamlList } from "./saml_list";
import { ScimList } from "./scim_list";
import { Link } from "react-router-dom";

export const SSOSettings: OrgComponent = (props) => {
  const { graph } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const { scimProvisioningProviders, license } = g.graphTypes(graph);
  const licenseExpired =
    license.expiresAt != -1 && props.ui.now > license.expiresAt;

  const samlProviders = g
    .graphTypes(graph)
    .externalAuthProviders.filter((p) => p.provider === "saml");

  const searchParams = new URLSearchParams(props.location.search);
  const inviteBackPath = searchParams.get("inviteBackPath");

  const renderBackLink = () => {
    if (inviteBackPath) {
      return (
        <div className="back-link">
          <a
            onClick={() => {
              props.history.replace(decodeURIComponent(inviteBackPath));
            }}
          >
            ← Back To Invitation
          </a>
        </div>
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
        {renderBackLink()}
        <h3>
          {licenseExpired ? "Renew" : "Upgrade"} <strong>License</strong>
        </h3>
        {blockStatement}
        {canManageBilling ? (
          <p>
            To enable SSO, {licenseExpired ? "renew" : "upgrade"} your org's
            license.
          </p>
        ) : (
          <p>
            To enable SSO, ask an admin to{" "}
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
    <div className={styles.SSOSettings}>
      {renderBackLink()}
      <div className="saml">
        <h3>
          <strong>SAML</strong> Connections
        </h3>
        <p>
          Authenticate through your organization's identity provider with SAML
          2.0.
        </p>

        <SamlList {...props} />

        <div className="buttons">
          <button
            className="primary"
            onClick={(e) => {
              props.history.push(
                props.orgRoute(
                  `/my-org/sso/new-saml/create${
                    inviteBackPath ? `?inviteBackPath=${inviteBackPath}` : ""
                  }`
                )
              );
            }}
          >
            {samlProviders.length == 0
              ? "Connect A SAML Provider"
              : "Connect Another SAML Provider"}
          </button>
        </div>
      </div>

      <div className="scim">
        <h3>
          <strong>SCIM</strong> Connections
        </h3>
        <p>
          Sync your organization's user directory with SCIM to streamline
          onboarding and offboarding.
        </p>

        <ScimList {...props} />

        <div className="buttons">
          <button
            className="primary"
            onClick={(e) => {
              props.history.push(
                props.orgRoute(
                  `/my-org/sso/scim${
                    inviteBackPath ? `?inviteBackPath=${inviteBackPath}` : ""
                  }`
                )
              );
            }}
          >
            {scimProvisioningProviders.length == 0
              ? "Connect A SCIM Provider"
              : "Connect Another SCIM Provider"}
          </button>
        </div>
      </div>
    </div>
  );
};

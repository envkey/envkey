import React, { useEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Api } from "@core/types";
import * as styles from "@styles";
import { SmallLoader } from "@images";
import { CopyableDisplay } from "../copyable_display";
import { logAndAlertError } from "@ui_lib/errors";

export const SamlSPStep: OrgComponent<{ providerId: string }> = (props) => {
  const { graph, samlSettingsByProviderId } = props.core;
  const searchParams = new URLSearchParams(props.location.search);
  const inviteBackPath = searchParams.get("inviteBackPath");

  const provider = graph[
    props.routeParams.providerId
  ] as Model.ExternalAuthProvider;

  const samlSettings = samlSettingsByProviderId[provider.id];

  useEffect(() => {
    // scroll to top on mount
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!provider || !samlSettings) {
      props
        .dispatch({
          type: Api.ActionType.GET_EXTERNAL_AUTH_PROVIDERS,
          payload: {
            provider: "saml",
          },
        })
        .then((res) => {
          if (!res.success) {
            logAndAlertError(
              `There was a problem fetching external auth providers.`,
              (res.resultAction as any).payload
            );
          }
        });
    }
  }, [provider && samlSettings]);

  if (!provider || !samlSettings) {
    return (
      <div className={styles.SSOSettings}>
        <SmallLoader />
      </div>
    );
  }

  return (
    <div className={styles.SSOSettings}>
      <div className="back-link">
        <a
          onClick={() => {
            props.history.replace(
              props.orgRoute(
                `/my-org/sso${
                  inviteBackPath ? `?inviteBackPath=${inviteBackPath}` : ""
                }`
              )
            );
          }}
        >
          ← Back
        </a>
      </div>
      <h3>
        <strong>Service Provider</strong> Settings
      </h3>

      <p className="copy">
        Now head over to your SAML provider's portal and add a new{" "}
        <strong>Service Provider</strong>. All the settings you'll need are
        listed below.
      </p>

      <SamlSPFields {...props} samlSettings={samlSettings} />

      <div className="buttons">
        <button
          className="secondary"
          onClick={() =>
            props.history.push(
              props.orgRoute(
                `/my-org/sso${
                  inviteBackPath ? `?inviteBackPath=${inviteBackPath}` : ""
                }`
              )
            )
          }
        >
          ← Back
        </button>
        <button
          className="primary"
          onClick={() => {
            props.history.push(
              props.orgRoute(
                `/my-org/sso/new-saml/idp/${provider.id}${
                  inviteBackPath ? `?inviteBackPath=${inviteBackPath}` : ""
                }`
              )
            );
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export const SamlSPFields: OrgComponent<
  {},
  {
    samlSettings: Partial<Model.SamlProviderSettings>;
  }
> = (props) => {
  const { samlSettings } = props;

  return (
    <div>
      <CopyableDisplay
        {...props}
        label="Entity ID / XML Metadata URL"
        value={samlSettings.serviceProviderEntityId}
      />

      <CopyableDisplay
        {...props}
        label="Assert URL / ACS URL / Callback URL"
        value={samlSettings.serviceProviderAcsUrl}
      />

      <CopyableDisplay
        {...props}
        label="Name ID"
        value={samlSettings.serviceProviderNameIdFormat}
      />

      <div className="field">
        <label>Signature Algorithm</label>
        <span>
          <strong>SHA256</strong>
        </span>
      </div>

      <CopyableDisplay
        {...props}
        className="cert"
        label="PEM Certificate"
        value={samlSettings.serviceProviderX509Cert}
      />

      <CopyableDisplay
        {...props}
        label="SHA256 Fingerprint"
        value={samlSettings.serviceProviderX509CertSha256}
      />

      <CopyableDisplay
        {...props}
        label="SHA1 Fingerprint"
        value={samlSettings.serviceProviderX509CertSha1}
      />

      <CopyableDisplay
        {...props}
        label="Email Attribute Mapping"
        value={samlSettings.serviceProviderAttributeMappings?.emailAddress}
      />

      {/* <CopyableDisplay
        {...props}
        label="First Name Attribute Mapping"
        value={samlSettings.serviceProviderAttributeMappings?.firstName}
      />

      <CopyableDisplay
        {...props}
        label="Last Name Attribute Mapping"
        value={samlSettings.serviceProviderAttributeMappings?.lastName}
      /> */}
    </div>
  );
};

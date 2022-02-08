import React, { useState, useLayoutEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Model } from "@core/types";
import * as styles from "@styles";

export const SamlSuccess: OrgComponent<{ providerId: string }> = (props) => {
  const { graph, samlSettingsByProviderId } = props.core;
  const searchParams = new URLSearchParams(props.location.search);
  const inviteBackPath = searchParams.get("inviteBackPath");

  const provider = graph[
    props.routeParams.providerId
  ] as Model.ExternalAuthProvider;

  const samlSettings = samlSettingsByProviderId[provider.id];

  useLayoutEffect(() => {
    if (!provider || !samlSettings) {
      props.history.replace(
        props.orgRoute(
          `/my-org/sso${
            inviteBackPath ? `?inviteBackPath=${inviteBackPath}` : ""
          }`
        )
      );
    }
  }, [provider && samlSettings]);

  if (!provider || !samlSettings) {
    return <div />;
  }

  return (
    <div className={styles.SSOSettings}>
      <h3>
        <strong>SAML Connection</strong> Success
      </h3>

      <p className="copy">
        <strong>Your new SAML provider has been successfully connected.</strong>
        When you invite new users to your organization, you can now require them
        to authenticate through this provider before gaining access.
      </p>

      <p className="copy">
        If your provider supports it, it's a good idea to setup a{" "}
        <strong>SCIM connection</strong> as well to automatically sync users
        between the provider and EnvKey.
      </p>

      <div className="buttons">
        <button
          className="primary"
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
          Done
        </button>
      </div>
    </div>
  );
};

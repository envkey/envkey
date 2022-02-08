import React, { useEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Model } from "@core/types";
import { CopyableDisplay } from "../copyable_display";
import * as styles from "@styles";

export const ScimSuccess: OrgComponent<{
  providerId: string;
  authSecret?: string;
}> = (props) => {
  const { graph } = props.core;
  const provider = graph[
    props.routeParams.providerId
  ] as Model.ScimProvisioningProvider;

  const searchParams = new URLSearchParams(props.location.search);
  const inviteBackPath = searchParams.get("inviteBackPath");

  useEffect(() => {
    // scroll to top on mount
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className={styles.SSOSettings}>
      <h3>
        <strong>SCIM</strong> Portal Settings
      </h3>

      <p className="copy">
        <strong>Ok, almost done.</strong> Now copy over the settings below into
        the app you created for EnvKey in your SCIM provider's portal and give
        any users you want to invite access.
      </p>

      <CopyableDisplay
        {...props}
        label="Endpoint URL"
        value={provider.endpointBaseUrl}
      />

      {props.routeParams.authSecret ? (
        <CopyableDisplay
          {...props}
          label="Authentication Secret"
          value={props.routeParams.authSecret}
        />
      ) : (
        ""
      )}

      <p className="copy">
        Once your SCIM provider syncs with EnvKey, you'll be able to invite
        users from the directory. If these users are later removed from the
        directory, they'll also be automatically removed from your EnvKey
        organization.
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

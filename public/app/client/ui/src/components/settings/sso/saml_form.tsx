import React, { useEffect, useState } from "react";
import { OrgComponent } from "@ui_types";
import { Api, Auth, Model } from "@core/types";
import * as styles from "@styles";
import { SmallLoader } from "@images";
import { samlIdpHasMinimumSettings } from "@core/lib/auth/saml";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { SamlBaseFields } from "./saml_base";
import { SamlSPFields } from "./saml_sp";
import { SamlIDPFields } from "./saml_idp";
import { logAndAlertError } from "@ui_lib/errors";

export const SamlForm: OrgComponent<{
  providerId: string;
}> = (props) => {
  const { graph, samlSettingsByProviderId } = props.core;
  const { externalAuthProviders } = g.graphTypes(graph);

  const searchParams = new URLSearchParams(props.location.search);
  const inviteBackPath = searchParams.get("inviteBackPath");

  const provider = graph[
    props.routeParams.providerId
  ] as Model.ExternalAuthProvider;

  const samlSettings = samlSettingsByProviderId[provider.id];

  const [nickname, setNickname] = useState(provider?.nickname ?? "");
  const [identityProviderKnownService, setIdentityProviderKnownService] =
    useState<Auth.SamlKnownIDP | undefined>();

  const [idpSettings, setIDPSettings] = useState<Model.SamlMinimalIdpSettings>({
    identityProviderEntityId: samlSettings?.identityProviderEntityId ?? "",
    identityProviderLoginUrl: samlSettings?.identityProviderLoginUrl ?? "",
    identityProviderX509Certs: samlSettings?.identityProviderX509Certs ?? [],
  });

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // scroll to top on mount
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (samlSettings) {
      setIdentityProviderKnownService(
        samlSettings.identityProviderKnownService
      );
      setIDPSettings({
        identityProviderEntityId: samlSettings.identityProviderEntityId ?? "",
        identityProviderLoginUrl: samlSettings.identityProviderLoginUrl ?? "",
        identityProviderX509Certs: samlSettings.identityProviderX509Certs ?? [],
      });
    } else {
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
  }, [samlSettings]);

  if (!samlSettings) {
    return (
      <div className={styles.SSOSettings}>
        <SmallLoader />
      </div>
    );
  }

  const nicknameDuplicate = Boolean(
    !submitting &&
      nickname &&
      externalAuthProviders.find(
        (p) =>
          p.id != provider.id && p.provider == "saml" && p.nickname == nickname
      )
  );

  const valid = Boolean(
    nickname &&
      !nicknameDuplicate &&
      identityProviderKnownService &&
      samlIdpHasMinimumSettings(idpSettings)
  );

  const previous = {
    id: provider.id,
    nickname: provider.nickname,
    samlSettings: {
      identityProviderKnownService: samlSettings.identityProviderKnownService,
      identityProviderEntityId: samlSettings.identityProviderEntityId ?? "",
      identityProviderLoginUrl: samlSettings.identityProviderLoginUrl ?? "",
      identityProviderX509Certs: samlSettings.identityProviderX509Certs ?? [],
    },
  };

  const updated = {
    id: provider.id,
    nickname,
    samlSettings: {
      identityProviderKnownService,
      ...idpSettings,
    },
  };

  const hasChange = !R.equals<any>(previous, updated);

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
        SAML Connection <strong>Settings</strong>
      </h3>

      {hasChange ? (
        <span className="unsaved-changes">Unsaved changes</span>
      ) : (
        ""
      )}

      <SamlBaseFields
        {...props}
        submitting={submitting}
        nickname={nickname}
        nicknameDuplicate={nicknameDuplicate}
        identityProviderKnownService={identityProviderKnownService}
        onChange={({ nickname, identityProviderKnownService }) => {
          setNickname(nickname);
          setIdentityProviderKnownService(identityProviderKnownService);
        }}
      />

      <h4>Service Provider Settings</h4>

      <p className="copy">
        These should be set in your SAML provider's portal under the{" "}
        <strong>Service Provider</strong> you've created for EnvKey.
      </p>

      <SamlSPFields {...props} samlSettings={samlSettings} />

      <h4>Identity Provider Settings</h4>

      <p className="copy">Find these in your SAML provider's portal.</p>

      <SamlIDPFields
        {...props}
        submitting={submitting}
        idpSettings={idpSettings}
        onChange={(updated) => {
          setIDPSettings(updated);
        }}
      />

      <div className="buttons">
        {submitting ? (
          <SmallLoader />
        ) : (
          [
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
            </button>,
            <button
              className="primary"
              disabled={!valid || !hasChange}
              onClick={async () => {
                setSubmitting(true);

                let res = await props.dispatch({
                  type: Api.ActionType.UPDATE_ORG_SAML_SETTINGS,
                  payload: updated,
                });

                if (res.success) {
                  res = await props.dispatch({
                    type: Api.ActionType.GET_EXTERNAL_AUTH_PROVIDERS,
                    payload: {
                      provider: "saml",
                    },
                  });
                } else {
                  logAndAlertError(
                    "There was a problem updating the SAML connection.",
                    (res.resultAction as any).payload
                  );
                }
              }}
            >
              Save
            </button>,
          ]
        )}
      </div>
    </div>
  );
};

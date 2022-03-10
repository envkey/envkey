import React, { useState, useEffect, useRef } from "react";
import { OrgComponent } from "@ui_types";
import { Auth, Model, Api } from "@core/types";
import { SvgImage, SmallLoader } from "@images";
import { samlIdpHasMinimumSettings } from "@core/lib/auth/saml";
import * as styles from "@styles";
import * as R from "ramda";
import { logAndAlertError } from "@ui_lib/errors";

export const SamlIDPStep: OrgComponent<{ providerId: string }> = (props) => {
  const { graph, samlSettingsByProviderId } = props.core;
  const searchParams = new URLSearchParams(props.location.search);
  const inviteBackPath = searchParams.get("inviteBackPath");

  const provider = graph[
    props.routeParams.providerId
  ] as Model.ExternalAuthProvider;

  const samlSettings = samlSettingsByProviderId[provider.id];

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
    if (!samlSettings) {
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
              res.resultAction
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

  const valid = samlIdpHasMinimumSettings(idpSettings);

  return (
    <div className={styles.SSOSettings}>
      <div className="back-link">
        <a
          onClick={() => {
            props.history.replace(
              props.orgRoute(
                `/my-org/sso/new-saml/sp/${provider.id}${
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
        <strong>Identity Provider</strong> Settings
      </h3>

      <p className="copy">
        <strong>One more step:</strong> find the following settings in your SAML
        provider's portal and set them below.
      </p>

      <SamlIDPFields
        {...props}
        autoFocus={true}
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
                    `/my-org/sso/new-saml/sp/${provider.id}${
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
              disabled={!valid}
              onClick={async () => {
                setSubmitting(true);

                let res = await props.dispatch({
                  type: Api.ActionType.UPDATE_ORG_SAML_SETTINGS,
                  payload: {
                    id: provider.id,
                    samlSettings: idpSettings,
                  },
                });

                if (res.success) {
                  await props.dispatch({
                    type: Api.ActionType.GET_EXTERNAL_AUTH_PROVIDERS,
                    payload: {
                      provider: "saml",
                    },
                  });

                  props.history.push(
                    props.orgRoute(
                      `/my-org/sso${
                        inviteBackPath
                          ? `?inviteBackPath=${inviteBackPath}`
                          : ""
                      }`
                    )
                  );
                } else {
                  logAndAlertError(
                    "There was a problem updating your SAML Identity Provider Settings.",
                    res.resultAction
                  );
                }
              }}
            >
              Save And Finish
            </button>,
          ]
        )}
      </div>
    </div>
  );
};

export const SamlIDPFields: React.FC<{
  submitting: boolean;
  autoFocus?: boolean;
  idpSettings: Model.SamlMinimalIdpSettings;
  onChange: (settings: Model.SamlMinimalIdpSettings) => any;
}> = (props) => {
  const {
    submitting,
    autoFocus,
    onChange,
    idpSettings: {
      identityProviderEntityId,
      identityProviderLoginUrl,
      identityProviderX509Certs,
    },
  } = props;

  console.log({
    identityProviderEntityId,
    identityProviderLoginUrl,
    identityProviderX509Certs,
  });

  const [addingCert, setAddingCert] = useState(
    identityProviderX509Certs.length == 0
  );
  const [pendingNewCert, setPendingNewCert] = useState("");
  const [editingCert, setEditingCert] = useState<number>();

  const certTextArea = useRef<HTMLTextAreaElement>(null);

  return (
    <div>
      <div className="field">
        <label>Entity ID</label>
        <textarea
          autoFocus={autoFocus}
          value={identityProviderEntityId}
          disabled={submitting}
          placeholder="Enter Entity ID..."
          onChange={(e) =>
            onChange({
              identityProviderEntityId: e.target.value.trim(),
              identityProviderLoginUrl,
              identityProviderX509Certs,
            })
          }
        />
      </div>

      <div className="field">
        <label>Login URL</label>
        <textarea
          value={identityProviderLoginUrl}
          disabled={submitting}
          placeholder="Enter Login URL..."
          onChange={(e) =>
            onChange({
              identityProviderEntityId,
              identityProviderLoginUrl: e.target.value.trim(),
              identityProviderX509Certs,
            })
          }
        />
      </div>

      <div className="field cert">
        <label>Certificates</label>

        {identityProviderX509Certs.length == 0 ? (
          <p className="error">No certificates have been added.</p>
        ) : (
          <div className="certs">
            {identityProviderX509Certs.map((cert, i) => (
              <h4 className={i == editingCert ? "editing" : ""}>
                Certificate #{i + 1}
                <div className="actions">
                  <span
                    className="delete"
                    onClick={() => {
                      onChange({
                        identityProviderEntityId,
                        identityProviderLoginUrl,
                        identityProviderX509Certs: R.remove(
                          i,
                          1,
                          identityProviderX509Certs
                        ),
                      });
                      setEditingCert(undefined);
                      setAddingCert(false);
                      setPendingNewCert("");
                    }}
                  >
                    <SvgImage type="x" />
                    <span>Delete</span>
                  </span>

                  <span
                    className="edit"
                    onClick={() => {
                      setEditingCert(i);
                      setAddingCert(true);
                      setPendingNewCert(identityProviderX509Certs[i]);

                      certTextArea.current?.focus();
                    }}
                  >
                    <SvgImage type="edit" />
                    <span>Edit</span>
                  </span>
                </div>
              </h4>
            ))}
          </div>
        )}

        {addingCert ? (
          [
            <textarea
              ref={certTextArea}
              autoFocus={identityProviderX509Certs.length > 0}
              placeholder="Paste a certificate here..."
              value={pendingNewCert}
              onChange={(e) => setPendingNewCert(e.target.value)}
            />,
            <div className="buttons">
              {identityProviderX509Certs.length > 0 ? (
                <button
                  className="secondary"
                  onClick={() => {
                    setAddingCert(false);
                    setPendingNewCert("");
                    setEditingCert(undefined);
                  }}
                >
                  Cancel
                </button>
              ) : (
                ""
              )}
              <button
                className="tertiary"
                onClick={() => {
                  onChange({
                    identityProviderEntityId,
                    identityProviderLoginUrl,
                    identityProviderX509Certs:
                      typeof editingCert == "number"
                        ? R.update(
                            editingCert,
                            pendingNewCert.trim(),
                            identityProviderX509Certs
                          )
                        : [...identityProviderX509Certs, pendingNewCert.trim()],
                  });
                  setAddingCert(false);
                  setPendingNewCert("");
                  setEditingCert(undefined);
                }}
                disabled={!pendingNewCert}
              >
                {typeof editingCert == "number"
                  ? `Update Cert #${editingCert + 1}`
                  : "Add Certificate"}
              </button>
            </div>,
          ]
        ) : (
          <div className="buttons">
            <button className="tertiary" onClick={() => setAddingCert(true)}>
              Add Another Certificate
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

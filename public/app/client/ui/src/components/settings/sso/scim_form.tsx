import React, { useEffect, useState } from "react";
import { OrgComponent } from "@ui_types";
import { Api, Model } from "@core/types";
import * as styles from "@styles";
import { SvgImage, SmallLoader } from "@images";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { secureRandomAlphanumeric } from "@core/lib/crypto/utils";
import { CopyableDisplay } from "../copyable_display";

export const ScimForm: OrgComponent<{ providerId?: string }> = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const { scimProvisioningProviders } = g.graphTypes(graph);

  const provider = props.routeParams.providerId
    ? (graph[props.routeParams.providerId] as Model.ScimProvisioningProvider)
    : undefined;

  const searchParams = new URLSearchParams(props.location.search);
  const inviteBackPath = searchParams.get("inviteBackPath");

  const [submitting, setSubmitting] = useState(false);
  const [submittingSecret, setSubmittingSecret] = useState(false);

  const [willInputSecret, setWillInputSecret] = useState(false);
  const [secret, setSecret] = useState<string>();

  const [nickname, setNickname] = useState<string>(
    provider || scimProvisioningProviders.length > 0
      ? provider?.nickname ?? ""
      : "Default SCIM Connection"
  );

  const [createdTs, setCreatedTs] = useState<number>();

  const [showUpdateAuthSecret, setShowUpdateAuthSecret] = useState(false);
  const [regeneratedSecret, setRegeneratedSecret] = useState(false);

  useEffect(() => {
    // scroll to top on mount
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (createdTs) {
      const created = scimProvisioningProviders.find(
        R.propEq("createdAt", createdTs)
      );

      if (created) {
        props.history.push(
          props.orgRoute(
            `/my-org/sso/scim/success/${created.id}${
              willInputSecret ? "" : `/${secret}`
            }${inviteBackPath ? `?inviteBackPath=${inviteBackPath}` : ""}`
          )
        );
      }
    }
  }, [createdTs, graphUpdatedAt]);

  const nicknameDuplicate = Boolean(
    !submitting &&
      nickname &&
      scimProvisioningProviders.find(
        (p) => (!provider || provider.id != p.id) && p.nickname == nickname
      )
  );

  const mainValid = Boolean(
    nickname && !nicknameDuplicate && (provider || !willInputSecret || secret)
  );

  const mainButtons = (
    <div className="buttons">
      {submitting ? (
        <SmallLoader />
      ) : (
        [
          provider ? (
            ""
          ) : (
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
          ),
          <button
            className="primary"
            disabled={
              !mainValid ||
              submitting ||
              (provider && nickname == provider.nickname)
            }
            onClick={async () => {
              setSubmitting(true);

              if (provider) {
                const res = await props.dispatch({
                  type: Api.ActionType.UPDATE_SCIM_PROVISIONING_PROVIDER,
                  payload: {
                    id: provider.id,
                    authScheme: "bearer",
                    nickname,
                  },
                });

                if (res.success) {
                  setSubmitting(false);
                } else {
                  const msg = `There was a problem updating '${provider.nickname!}'.`;
                  alert(msg);
                  console.log(msg, res.resultAction);
                }
              } else {
                const authSecret =
                  willInputSecret && secret
                    ? secret
                    : ["ekb", secureRandomAlphanumeric(26)].join("_");
                setSecret(authSecret);

                const res = await props.dispatch({
                  type: Api.ActionType.CREATE_SCIM_PROVISIONING_PROVIDER,
                  payload: {
                    nickname,
                    authScheme: "bearer",
                    secret: authSecret,
                  },
                });

                if (res.success) {
                  const ts = (
                    res.resultAction as {
                      payload: Api.Net.ApiResultTypes["CreateScimProvisioningProvider"];
                    }
                  ).payload.timestamp;

                  setCreatedTs(ts);
                } else {
                  const msg =
                    "There was a problem creating the SCIM connection.";
                  alert(msg);
                  console.log(msg, res.resultAction);
                }
              }
            }}
          >
            {provider ? "Rename" : "Next"}
          </button>,
        ]
      )}
    </div>
  );

  const authSecretFields = [
    <div className="field">
      <label>Type of authentication secret</label>

      <div className="select">
        <select
          value={willInputSecret ? "scim-generated" : "envkey-generated"}
          disabled={submitting}
          onChange={(e) => {
            setWillInputSecret(e.target.value == "scim-generated");
          }}
        >
          <option key="envkey-generated" value="envkey-generated">
            Generated By EnvKey, Set In SCIM Portal
          </option>
          ,
          <option key="scim-generated" value="scim-generated">
            Generated By SCIM Portal, Set In EnvKey
          </option>
          ,
        </select>
        <SvgImage type="down-caret" />
      </div>
    </div>,

    willInputSecret ? (
      <div className="field">
        <label>Secret</label>

        <input
          autoFocus={true}
          disabled={submitting}
          type="password"
          value={secret}
          placeholder="Enter a secret..."
          onChange={(e) => setSecret(e.target.value)}
        />
      </div>
    ) : (
      ""
    ),
  ];

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

      {provider ? (
        <h3>
          <strong>SCIM</strong> Provider Settings
        </h3>
      ) : (
        <h3>
          Connect <strong>SCIM</strong> Provider
        </h3>
      )}

      {provider ? (
        ""
      ) : (
        <p className="copy">
          <strong>First,</strong> create a new app for EnvKey in your SCIM
          provider's portal, then complete the form below.
        </p>
      )}

      <div className="field">
        <label>Connection Name</label>
        <input
          autoFocus={!provider}
          disabled={submitting}
          type="text"
          value={nickname}
          placeholder="Enter a name..."
          onChange={(e) => setNickname(e.target.value)}
        />

        {nicknameDuplicate ? (
          <p className="error">
            A SAML connection with this name already exists.
          </p>
        ) : (
          ""
        )}

        {provider ? mainButtons : ""}
      </div>

      {provider ? (
        <CopyableDisplay
          {...props}
          label="Endpoint URL"
          value={provider.endpointBaseUrl}
        />
      ) : (
        ""
      )}

      {provider ? (
        <h3>
          <strong>Authentication</strong> Secret
        </h3>
      ) : (
        <h4>Authentication Secret</h4>
      )}

      {provider
        ? showUpdateAuthSecret
          ? [
              ...authSecretFields,

              <div className="buttons">
                {submittingSecret ? (
                  <SmallLoader />
                ) : (
                  [
                    <button
                      className="secondary"
                      onClick={() => {
                        setWillInputSecret(false);
                        setSecret(undefined);
                        setShowUpdateAuthSecret(false);
                      }}
                    >
                      Cancel
                    </button>,
                    <button
                      className={willInputSecret ? "primary" : "tertiary"}
                      disabled={willInputSecret && !secret}
                      onClick={async () => {
                        setSubmittingSecret(true);

                        const authSecret =
                          willInputSecret && secret
                            ? secret
                            : ["ekb", secureRandomAlphanumeric(26)].join("_");

                        const res = await props.dispatch({
                          type: Api.ActionType
                            .UPDATE_SCIM_PROVISIONING_PROVIDER,
                          payload: {
                            id: provider.id,
                            authScheme: "bearer",
                            nickname,
                            secret: authSecret,
                          },
                        });

                        setSubmittingSecret(false);
                        if (res.success) {
                          if (!willInputSecret) {
                            setSecret(authSecret);
                            setRegeneratedSecret(true);
                          }
                          setShowUpdateAuthSecret(false);
                        } else {
                          const msg = `There was a problem updating '${provider.nickname!}'.`;
                          alert(msg);
                          console.log(msg, res.resultAction);
                        }
                      }}
                    >
                      {willInputSecret ? "Save" : "Regenerate"}
                    </button>,
                  ]
                )}
              </div>,
            ]
          : [
              ...(regeneratedSecret
                ? [
                    <p>
                      Authentication secret has been{" "}
                      <strong>re-generated</strong>. Set it in your SCIM
                      provider's portal.
                    </p>,
                    <CopyableDisplay
                      {...props}
                      label="New Authentication Secret"
                      value={secret}
                    />,
                  ]
                : [
                    <p>
                      <strong>Authentication secret</strong> has been set.
                    </p>,
                  ]),

              <div className="buttons">
                <button
                  className="tertiary"
                  onClick={() => {
                    setShowUpdateAuthSecret(true);
                    setWillInputSecret(false);
                    setSecret(undefined);
                    setRegeneratedSecret(false);
                  }}
                >
                  Reset Secret
                </button>
              </div>,
            ]
        : [
            <p>
              An <strong>authentication secret</strong> is required to verify
              requests from your SCIM provider.
            </p>,

            <p>
              Some providers ask you to set this secret in the SCIM portal,
              while others generate it for you.
            </p>,

            <p>
              If you have a choice, it's best to have EnvKey generate the
              secret, then set it in your provider's portal.
            </p>,

            ...authSecretFields,
          ]}

      {provider ? "" : mainButtons}
    </div>
  );
};

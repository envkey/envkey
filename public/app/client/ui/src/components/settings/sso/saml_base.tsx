import React, { useState, useEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Auth, Api } from "@core/types";
import { SvgImage, SmallLoader } from "@images";
import * as styles from "@styles";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { logAndAlertError } from "@ui_lib/errors";

export const SamlCreateStep: OrgComponent = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const { externalAuthProviders } = g.graphTypes(graph);

  const searchParams = new URLSearchParams(props.location.search);
  const inviteBackPath = searchParams.get("inviteBackPath");

  const [submitting, setSubmitting] = useState(false);
  const [nickname, setNickname] = useState(
    externalAuthProviders.filter(R.propEq("provider", "saml")).length > 0
      ? ""
      : "Default SAML Connection"
  );
  const [identityProviderKnownService, setIdentityProviderKnownService] =
    useState<Auth.SamlKnownIDP | undefined>();

  const [createdTs, setCreatedTs] = useState<number>();

  useEffect(() => {
    if (createdTs) {
      const created = externalAuthProviders.find(
        R.propEq("createdAt", createdTs)
      );

      if (created && props.core.samlSettingsByProviderId[created.id]) {
        props.history.push(
          props.orgRoute(
            `/my-org/sso/new-saml/sp/${created.id}${
              inviteBackPath ? `?inviteBackPath=${inviteBackPath}` : ""
            }`
          )
        );
      }
    }
  }, [
    createdTs,
    JSON.stringify(Object.keys(props.core.samlSettingsByProviderId)),
    graphUpdatedAt,
  ]);

  const nicknameDuplicate = Boolean(
    !submitting &&
      nickname &&
      externalAuthProviders.find(
        (p) => p.provider == "saml" && p.nickname == nickname
      )
  );

  const valid = Boolean(
    nickname && !nicknameDuplicate && identityProviderKnownService
  );

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
        Connect <strong>SAML</strong> Provider
      </h3>

      <SamlBaseFields
        {...props}
        autoFocus={true}
        submitting={submitting}
        nickname={nickname}
        nicknameDuplicate={nicknameDuplicate}
        identityProviderKnownService={identityProviderKnownService}
        onChange={({ nickname, identityProviderKnownService }) => {
          setNickname(nickname);
          setIdentityProviderKnownService(identityProviderKnownService);
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
              disabled={!valid || submitting}
              onClick={async () => {
                setSubmitting(true);

                const res = await props.dispatch({
                  type: Api.ActionType.CREATE_ORG_SAML_PROVIDER,
                  payload: {
                    nickname,
                    identityProviderKnownService,
                  },
                });

                if (res.success) {
                  const ts = (
                    res.resultAction as {
                      payload: Api.Net.ApiResultTypes["CreateOrgSamlProvider"];
                    }
                  ).payload.timestamp;

                  setCreatedTs(ts);

                  props
                    .dispatch({
                      type: Api.ActionType.GET_EXTERNAL_AUTH_PROVIDERS,
                      payload: { provider: "saml" },
                    })
                    .then((res) => {
                      if (!res.success) {
                        logAndAlertError(
                          `There was a problem listing external auth providers.`,
                          (res.resultAction as any).payload
                        );
                      }
                    });
                } else {
                  logAndAlertError(
                    "There was a problem creating the SAML connection.",
                    (res.resultAction as any).payload
                  );
                }
              }}
            >
              Next
            </button>,
          ]
        )}
      </div>
    </div>
  );
};

export const SamlBaseFields: React.FC<{
  nickname: string;
  nicknameDuplicate?: boolean;
  submitting: boolean;
  identityProviderKnownService: Auth.SamlKnownIDP | undefined;
  autoFocus?: boolean;
  onChange: (res: {
    nickname: string;
    identityProviderKnownService: Auth.SamlKnownIDP | undefined;
  }) => any;
}> = (props) => {
  const {
    nickname,
    nicknameDuplicate,
    submitting,
    autoFocus,
    identityProviderKnownService,
    onChange,
  } = props;

  return (
    <div>
      <div className="field">
        <label>Connection Name</label>
        <input
          type="text"
          autoFocus={autoFocus}
          placeholder="Enter a name..."
          value={nickname}
          disabled={submitting}
          onChange={(e) => {
            onChange({
              nickname: e.target.value,
              identityProviderKnownService,
            });
          }}
        />

        {nicknameDuplicate ? (
          <p className="error">
            A SAML connection with this name already exists.
          </p>
        ) : (
          ""
        )}
      </div>
      <div className="field">
        <label>Provider</label>
        <div className="select">
          <select
            value={identityProviderKnownService ?? "choose"}
            disabled={submitting}
            onChange={(e) => {
              onChange({
                nickname,
                identityProviderKnownService: e.target
                  .value as Auth.SamlKnownIDP,
              });
            }}
          >
            <option key="choose" value="choose" disabled={true}>
              Choose a provider...
            </option>

            {(
              Object.keys(
                Auth.SAML_KNOWN_IDENTITY_PROVIDERS
              ) as Auth.SamlKnownIDP[]
            ).map((provider) => (
              <option key={provider} value={provider}>
                {Auth.SAML_KNOWN_IDENTITY_PROVIDERS[provider]}
              </option>
            ))}
          </select>
          <SvgImage type="down-caret" />
        </div>
      </div>
    </div>
  );
};

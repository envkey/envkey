import React, { useState, useEffect, useLayoutEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Api } from "@core/types";
import * as g from "@core/lib/graph";
import { SmallLoader, SvgImage } from "@images";
import { samlIdpHasMinimumSettings } from "@core/lib/auth/saml";
import * as R from "ramda";

export const SamlList: OrgComponent = (props) => {
  const { graph } = props.core;

  const samlProviders = g
    .graphTypes(graph)
    .externalAuthProviders.filter((p) => p.provider === "saml");

  const [refreshing, setRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);

  const [deleting, setDeleting] = useState<Record<string, true>>({});

  useEffect(() => {
    if (
      refreshing ||
      samlProviders.length == 0 ||
      !samlProviders.some(({ id }) => !props.core.samlSettingsByProviderId[id])
    ) {
      return;
    }

    setRefreshing(true);

    props
      .dispatch({
        type: Api.ActionType.GET_EXTERNAL_AUTH_PROVIDERS,
        payload: {
          provider: "saml",
        },
      })
      .then(() => setJustRefreshed(true))
      .catch((err) => {
        const msg = "There was a problem loading your org's SAML connections.";
        alert(msg);
        console.log(msg, err);
      });
  }, [
    samlProviders
      .map((s) => [s.id, s.updatedAt].join(","))
      .sort()
      .join("|"),
  ]);

  useLayoutEffect(() => {
    if (refreshing && justRefreshed && !props.core.isFetchingAuthProviders) {
      setRefreshing(false);
      setJustRefreshed(false);

      const providerIds = new Set(samlProviders.map(R.prop("id")));
      const toClearDeleted: string[] = [];
      for (let deletingId in deleting) {
        if (!providerIds.has(deletingId)) {
          toClearDeleted.push(deletingId);
        }
        setDeleting(R.omit(toClearDeleted, deleting));
      }
    }
  }, [refreshing, props.core.isFetchingAuthProviders, justRefreshed]);

  return (
    <div className="providers">
      {refreshing && R.isEmpty(deleting) && samlProviders.length > 0 ? (
        <SmallLoader />
      ) : (
        ""
      )}

      {samlProviders.map((provider) => {
        const samlSettings = props.core.samlSettingsByProviderId[provider.id];

        if (!samlSettings) {
          return "";
        }

        return (
          <div>
            <div>
              <span className="title">{provider.nickname}</span>
              {samlIdpHasMinimumSettings(samlSettings) ? (
                ""
              ) : (
                <span className="subtitle error">Missing IDP Settings</span>
              )}
            </div>
            <div>
              <div className="actions">
                {deleting[provider.id] ? (
                  <SmallLoader />
                ) : (
                  [
                    <span
                      className="delete"
                      onClick={async () => {
                        if (
                          confirm(
                            `Are you sure you want to delete SAML Connection '${provider.nickname}'?
                              
Any users invited through it will be converted to email authentication.`
                          )
                        ) {
                          setDeleting({ ...deleting, [provider.id]: true });

                          const res = await props.dispatch({
                            type: Api.ActionType.DELETE_EXTERNAL_AUTH_PROVIDER,
                            payload: {
                              id: provider.id,
                            },
                          });

                          if (!res.success) {
                            alert(
                              `There was a problem deleting ${provider.nickname}.`
                            );
                            setDeleting(R.omit([provider.id], deleting));
                          }
                        }
                      }}
                    >
                      <SvgImage type="x" />
                      <span>Remove</span>
                    </span>,

                    <span
                      className="edit"
                      onClick={() =>
                        props.history.push(
                          props.orgRoute(`/my-org/sso/saml/${provider.id}`)
                        )
                      }
                    >
                      <SvgImage type="gear" />
                      <span>Settings</span>
                    </span>,
                  ]
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

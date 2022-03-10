import React, { useState, useLayoutEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Api, Auth } from "@core/types";
import * as g from "@core/lib/graph";
import { SmallLoader, SvgImage } from "@images";
import * as R from "ramda";
import { logAndAlertError } from "@ui_lib/errors";

export const ScimList: OrgComponent = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const { scimProvisioningProviders } = g.graphTypes(graph);

  const [deleting, setDeleting] = useState<Record<string, true>>({});

  useLayoutEffect(() => {
    const providerIds = new Set(scimProvisioningProviders.map(R.prop("id")));
    const toClearDeleted: string[] = [];
    for (let deletingId in deleting) {
      if (!providerIds.has(deletingId)) {
        toClearDeleted.push(deletingId);
      }
      setDeleting(R.omit(toClearDeleted, deleting));
    }
  }, [graph, graphUpdatedAt]);

  return (
    <div className="providers">
      {scimProvisioningProviders.map((provider) => {
        return (
          <div>
            <div>
              <span className="title">{provider.nickname}</span>
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
                            `Are you sure you want to delete SCIM Connection '${provider.nickname}'?

                            No users will be removed.`
                          )
                        ) {
                          setDeleting({ ...deleting, [provider.id]: true });

                          const res = await props.dispatch({
                            type: Api.ActionType
                              .DELETE_SCIM_PROVISIONING_PROVIDER,
                            payload: {
                              id: provider.id,
                            },
                          });

                          if (!res.success) {
                            logAndAlertError(
                              `There was a problem deleting ${provider.nickname}.`,
                              res.resultAction
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
                          props.orgRoute(`/my-org/sso/scim/${provider.id}`)
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

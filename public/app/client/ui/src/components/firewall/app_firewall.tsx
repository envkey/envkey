import React, { useState, useLayoutEffect, useEffect } from "react";
import { OrgComponent, ReactSelectOption } from "@ui_types";
import * as g from "@core/lib/graph";
import { Model, Api } from "@core/types";
import * as R from "ramda";
import * as ui from "@ui";
import * as styles from "@styles";
import { isValidIPOrCIDR } from "@core/lib/utils/ip";
import { SmallLoader, SvgImage } from "@images";
import { Link } from "react-router-dom";
import { logAndAlertError } from "@ui_lib/errors";

const MERGE_STRATEGY_LABELS = {
  inherit: "Inherit From Org Trusted IPs",
  extend: "Extend Org Trusted IPs",
  override: "Override Org Trusted IPs",
};

export const AppFirewall: OrgComponent<{ appId: string }> = (props) => {
  const { graph } = props.core;
  const appId = props.routeParams.appId;
  const org = g.getOrg(graph);
  const app = graph[appId] as Model.App;
  const currentUserId = props.ui.loadedAccountId!;

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [updating, setUpdating] = useState(false);

  const [environmentRoleIpsAllowed, setEnvironmentRolesIpsAllowed] = useState(
    app.environmentRoleIpsAllowed ?? {}
  );

  const [
    environmentRoleIpsMergeStrategies,
    setEnvironmentRoleIpsMergeStrategies,
  ] = useState(app.environmentRoleIpsMergeStrategies ?? {});

  useEffect(() => {
    if (updating && !props.core.isUpdatingFirewall[appId]) {
      setUpdating(false);
    }
  }, [props.core.isUpdatingFirewall[appId]]);

  const hasUpdate = !(
    R.equals(
      environmentRoleIpsMergeStrategies,
      app.environmentRoleIpsMergeStrategies ?? {}
    ) &&
    R.equals(environmentRoleIpsAllowed, app.environmentRoleIpsAllowed ?? {})
  );

  console.log({
    hasUpdate,
    updating,
    environmentRoleIpsMergeStrategies,
    "app.environmentRoleIpsMergeStrategies":
      app.environmentRoleIpsMergeStrategies,
    environmentRoleIpsAllowed,
    "app.environmentRoleIpsAllowed": app.environmentRoleIpsAllowed,
  });

  const onSubmit = async () => {
    if (!hasUpdate) {
      return;
    }
    setUpdating(true);
    await props
      .dispatch({
        type: Api.ActionType.SET_APP_ALLOWED_IPS,
        payload: {
          id: app.id,
          environmentRoleIpsMergeStrategies,
          environmentRoleIpsAllowed,
        },
      })
      .then((res) => {
        if (!res.success) {
          logAndAlertError(
            "There was a problem updating app firewall settings",
            (res.resultAction as any)?.payload
          );
        }
      });
  };

  return (
    <div className={styles.OrgContainer}>
      <h3>
        {updating ? <SmallLoader /> : ""}
        App <strong>Firewall</strong>
      </h3>

      {hasUpdate && !updating ? (
        <span className="unsaved-changes">Unsaved changes</span>
      ) : (
        ""
      )}

      <p>Determines which IPs can access this app's config.</p>

      <p>
        Add any number of valid IPV4/IPV6 IPs and/or CIDR ranges (example:
        '192.12.24.123' or '172.18.0.0/24').
      </p>

      {g.authz.hasOrgPermission(graph, currentUserId, "org_manage_firewall") ? (
        <div className="field buttons">
          <Link className="tertiary" to={props.orgRoute("/my-org/firewall")}>
            Org Firewall Settings→
          </Link>
        </div>
      ) : (
        ""
      )}

      {g
        .graphTypes(props.core.graph)
        .environmentRoles.map(({ id: environmentRoleId, name }) => {
          const mergeStrategy =
            environmentRoleIpsMergeStrategies[environmentRoleId];

          return (
            <div>
              <h4>{name} Trusted IPs</h4>

              <div className="field">
                <p>
                  Controls which IPs can load this app's {name} server ENVKEYs.
                </p>
                <div className="select">
                  <select
                    value={mergeStrategy ?? "inherit"}
                    onChange={(e) => {
                      const val = e.target.value as
                        | "inherit"
                        | "extend"
                        | "override";
                      setEnvironmentRoleIpsMergeStrategies(
                        val == "inherit"
                          ? R.omit(
                              [environmentRoleId],
                              environmentRoleIpsMergeStrategies
                            )
                          : {
                              ...environmentRoleIpsMergeStrategies,
                              [environmentRoleId]: val,
                            }
                      );

                      if (val == "inherit") {
                        setEnvironmentRolesIpsAllowed(
                          R.omit([environmentRoleId], environmentRoleIpsAllowed)
                        );
                      }
                    }}
                  >
                    {R.toPairs(MERGE_STRATEGY_LABELS).map(
                      ([strategy, label]) => (
                        <option value={strategy}>{label}</option>
                      )
                    )}
                  </select>
                  <SvgImage type="down-caret" />
                </div>
              </div>

              {mergeStrategy != "override" ? (
                <div className="field">
                  <label>Org Trusted IPs</label>
                  <ui.ReactSelect
                    isMulti
                    noBorder={true}
                    noBg={true}
                    isDisabled={true}
                    hideIndicatorContainer={true}
                    noOptionsMessage={() => null}
                    value={(
                      org.environmentRoleIpsAllowed?.[environmentRoleId] ?? []
                    ).map((value) => ({
                      value,
                      label: value,
                      isFixed: true,
                    }))}
                    placeholder="Any IP"
                  />
                </div>
              ) : (
                ""
              )}

              {mergeStrategy ? (
                <div className="field">
                  <label>App Trusted IPs</label>
                  <ui.ReactSelect
                    creatable={true}
                    isMulti
                    bgStyle="light"
                    hideIndicatorContainer={true}
                    noOptionsMessage={() => null}
                    onChange={(selectedArg) => {
                      const selected = (selectedArg ??
                        []) as ReactSelectOption[];

                      let ips = R.uniq(
                        selected.map(R.prop("value")).filter(isValidIPOrCIDR)
                      );

                      if (
                        !R.equals(
                          R.sortBy(
                            R.identity,
                            environmentRoleIpsAllowed?.[environmentRoleId] ?? []
                          ),
                          R.sortBy(R.identity, ips)
                        )
                      ) {
                        setEnvironmentRolesIpsAllowed(
                          ips.length > 0
                            ? {
                                ...environmentRoleIpsAllowed,
                                [environmentRoleId]: ips,
                              }
                            : R.omit(
                                [environmentRoleId],
                                environmentRoleIpsAllowed
                              )
                        );
                      }
                    }}
                    value={(
                      environmentRoleIpsAllowed?.[environmentRoleId] ?? []
                    ).map((value) => ({
                      value,
                      label: value,
                    }))}
                    placeholder="Any IP"
                    formatCreateLabel={(s: string) => s}
                    isValidNewOption={(s) => isValidIPOrCIDR(s)}
                  />
                </div>
              ) : (
                ""
              )}

              {mergeStrategy == "extend" &&
              !org.environmentRoleIpsAllowed?.[environmentRoleId] ? (
                <p className="error">
                  Because this org's firewall settings allow any IP to access{" "}
                  {name}, extending Org Trusted IPs will have no effect. Any IP
                  will be able to access this app's {name} environment.
                </p>
              ) : (
                ""
              )}
            </div>
          );
        })}

      <div className="buttons">
        {updating ? (
          <SmallLoader />
        ) : (
          <button className="primary" disabled={!hasUpdate} onClick={onSubmit}>
            Update
          </button>
        )}
      </div>
    </div>
  );
};

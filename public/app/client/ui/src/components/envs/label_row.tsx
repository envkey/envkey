import React, { useState, useEffect, useMemo } from "react";
import {
  defaultLogManagerState,
  EnvManagerComponent,
  LogManagerState,
} from "@ui_types";
import { Link } from "react-router-dom";
import { Model, Rbac } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { style } from "typestyle";
import { getEnvParentPath, getLocalsPath } from "@ui_lib/paths";
import * as styles from "@styles";
import { color } from "csx";
import { SvgImage } from "@images";
import { CLEARED_EDIT_STATE } from "./entry_form";
import { getEnvsUiPermissions } from "@ui_lib/envs";
import { getPendingEnvWithMeta } from "@core/lib/client";
import * as bs58 from "bs58";

export const LabelRow: EnvManagerComponent = (props) => {
  const { showLeftNav, showRightNav } = props;
  const { graph } = props.core;
  const currentUserId = props.ui.loadedAccountId!;
  const envParent = graph[props.envParentId] as Model.EnvParent;

  const envParentPath = getEnvParentPath(envParent);

  let numSubEnvironments =
    props.isSub && props.parentEnvironmentId
      ? (
          g.getSubEnvironmentsByParentEnvironmentId(graph)[
            props.parentEnvironmentId
          ] ?? []
        ).length
      : 0;
  const selectedNewSub = props.routeParams.subEnvironmentId == "new";
  let fullWidthSelectedNewSub = false;
  let selectedLocals = false;
  let isDevEnvironment = false;

  if (props.isSub && props.parentEnvironmentId) {
    const parentEnvironment = graph[
      props.parentEnvironmentId
    ] as Model.Environment;
    const environmentRole = graph[
      parentEnvironment.environmentRoleId
    ] as Rbac.EnvironmentRole;

    isDevEnvironment = environmentRole.hasLocalKeys;

    const maybeSubEnvironment = props.routeParams.subEnvironmentId
      ? (graph[props.routeParams.subEnvironmentId] as
          | Model.Environment
          | undefined)
      : undefined;

    selectedLocals = Boolean(
      !maybeSubEnvironment &&
        props.routeParams.subEnvironmentId &&
        isDevEnvironment &&
        !selectedNewSub
    );

    if (numSubEnvironments == 0 && !isDevEnvironment) {
      fullWidthSelectedNewSub = true;
    }
  }

  const [showingMenu, setShowingMenu] = useState<string>();

  const envsUiPermissions = useMemo(
    () =>
      getEnvsUiPermissions(
        props.core.graph,
        props.ui.loadedAccountId!,
        props.envParentId,
        props.visibleEnvironmentIds,
        props.localsUserId
      ),
    [
      props.ui.loadedAccountId,
      JSON.stringify(props.visibleEnvironmentIds),
      props.core.graphUpdatedAt,
    ]
  );

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      const environmentMenu = (e.target as HTMLElement).closest(
        ".environment-menu"
      );
      if (environmentMenu) {
        return;
      }
      setShowingMenu(undefined);
    };

    document.documentElement.addEventListener("click", fn);
    return () => {
      document.documentElement.removeEventListener("click", fn);
    };
  }, []);

  const renderBackLink = () => {
    if (props.routeParams.environmentId) {
      return (
        <Link
          className={styles.EnvLabelArrowButton + " has-tooltip"}
          to={props.orgRoute(envParentPath + `/environments`)}
        >
          {"←"}
          <span className="tooltip">Go back</span>
        </Link>
      );
    }
  };

  const renderLocalsOption = (user: Model.OrgUser | Model.CliUser) => {
    const numLocals = Object.keys(
      getPendingEnvWithMeta(props.core, {
        envParentId: envParent.id,
        environmentId: [envParent.id, user.id].join("|"),
      }).variables
    ).length;

    return (
      <option value={user.id}>
        {g.getUserName(graph, user.id, false, true)} ({numLocals} locals)
      </option>
    );
  };

  const renderLocalsSelect = (
    orgUserCollaborators: Model.OrgUser[],
    cliKeyCollaborators: Model.CliUser[],
    localsUserId: string
  ) => {
    const orgUserOpts = orgUserCollaborators.map(renderLocalsOption);
    const cliKeyOpts = cliKeyCollaborators.map(renderLocalsOption);

    let opts: React.ReactNode;

    if (cliKeyCollaborators.length > 0) {
      opts = [
        <optgroup label="Users">{orgUserOpts}</optgroup>,
        <optgroup label="CLI Keys">{cliKeyOpts}</optgroup>,
      ];
    } else {
      opts = orgUserOpts;
    }

    return [
      <select
        value={localsUserId}
        onChange={(e) => {
          const selectedUserId = e.target.value;

          props.history.push(
            props.orgRoute(
              getLocalsPath(
                envParent,
                props.parentEnvironmentId!,
                selectedUserId
              )
            )
          );
        }}
      >
        {opts}
      </select>,

      <SvgImage type="down-caret" />,
    ];
  };

  const renderSubLink = (environmentId: string, i: number) => {
    const environment = graph[environmentId] as Model.Environment | undefined;
    const environmentRole = environment
      ? (graph[environment.environmentRoleId] as Rbac.EnvironmentRole)
      : undefined;

    const isLocals = !environment;

    const subEnvironments =
      g.getSubEnvironmentsByParentEnvironmentId(graph)[environmentId] ?? [];

    if (
      !isLocals &&
      !environmentRole?.hasLocalKeys &&
      (!(
        g.authz.canReadSubEnvs(graph, currentUserId, environmentId) ||
        g.authz.canReadSubEnvsMeta(graph, currentUserId, environmentId)
      ) ||
        (subEnvironments.length == 0 &&
          !g.authz.canCreateSubEnvironment(
            graph,
            currentUserId,
            environmentId
          )))
    ) {
      return props.routeParams.environmentId ? (
        ""
      ) : (
        <span className="subenvs spacer" />
      );
    }

    return props.isSub || isLocals ? (
      ""
    ) : (
      <Link
        className="subenvs has-tooltip"
        to={props.orgRoute(
          envParentPath + `/environments/${environmentId}/sub-environments`
        )}
      >
        <span className="tooltip">
          {"Branches" +
            (environmentRole?.hasLocalKeys ? " And Local Overrides" : "")}
        </span>

        <SvgImage type="subenvs" />

        {environmentRole?.hasLocalKeys || subEnvironments.length > 0 ? (
          <span
            className={
              "num " +
              style({
                background: color(styles.colors.DARKER_BLUE)
                  .lighten(0.075 * i)
                  .darken(0.09)
                  .fadeOut(0.2)
                  .toString(),
                borderLeft: `1px solid ${color(styles.colors.DARKER_BLUE)
                  .lighten(0.075 * i)
                  .toString()}`,
                borderBottom: `1px solid ${color(styles.colors.DARKER_BLUE)
                  .lighten(0.075 * i)
                  .toString()}`,
              })
            }
          >
            {subEnvironments.length + (environmentRole?.hasLocalKeys ? 1 : 0)}
          </span>
        ) : (
          ""
        )}
      </Link>
    );
  };

  const renderLabelCell = (environmentId: string, i: number) => {
    const environment = graph[environmentId] as Model.Environment | undefined;
    const toRenderId = environment ? environment.id : environmentId;

    if (!environment) {
      const [envParentId, localsUserId] = environmentId.split("|");
      if (
        !envParentId ||
        envParentId != props.envParentId ||
        !localsUserId ||
        !(graph[envParentId] && graph[localsUserId])
      ) {
        return <div className="cell" key={i}></div>;
      }
    }

    let canUpdate: boolean;
    let canRead: boolean;
    let canReadVersions: boolean;
    let localsUserId: string | undefined;

    if (environment) {
      ({ canUpdate, canRead, canReadVersions } =
        envsUiPermissions[environmentId]);
    } else {
      const split = environmentId.split("|");
      localsUserId = split[1];

      canRead = g.authz.canReadLocals(
        graph,
        currentUserId,
        props.envParentId,
        localsUserId!
      );
      canUpdate = g.authz.canUpdateLocals(
        graph,
        currentUserId,
        props.envParentId,
        localsUserId!
      );
      canReadVersions = g.authz.canReadLocalsVersions(
        graph,
        currentUserId,
        props.envParentId,
        localsUserId!
      );
    }

    const canReadLogs =
      envParent.type == "app"
        ? g.authz.hasAppPermission(
            graph,
            currentUserId,
            envParent.id,
            "app_read_logs"
          )
        : g.authz.hasOrgPermission(graph, currentUserId, "org_read_logs");

    const lockImg = canUpdate && canRead ? "" : <SvgImage type="lock" />;

    let title: React.ReactNode;

    if (props.visibleEnvironmentIds.length > 1) {
      title = (
        <Link
          className="title"
          to={props.orgRoute(envParentPath + `/environments/${toRenderId}`)}
        >
          <span>
            {lockImg}
            {g.getEnvironmentName(props.core.graph, toRenderId)}
          </span>
        </Link>
      );
    } else {
      let localsSelect: React.ReactNode;

      if (localsUserId) {
        const orgUserCollaborators =
          props.envParentType == "app"
            ? g.authz.getLocalsReadableAppCollaborators(
                graph,
                currentUserId,
                props.envParentId,
                "orgUser"
              )
            : g.authz.getLocalsReadableBlockCollaborators(
                graph,
                currentUserId,
                props.envParentId,
                "orgUser"
              );

        const cliKeyCollaborators =
          props.envParentType == "app"
            ? g.authz.getLocalsReadableAppCollaborators(
                graph,
                currentUserId,
                props.envParentId,
                "cliUser"
              )
            : g.authz.getLocalsReadableBlockCollaborators(
                graph,
                currentUserId,
                props.envParentId,
                "cliUser"
              );

        if (orgUserCollaborators.length + cliKeyCollaborators.length > 1) {
          localsSelect = renderLocalsSelect(
            orgUserCollaborators,
            cliKeyCollaborators,
            localsUserId
          );
        }
      }

      const environmentName = g.getEnvironmentName(
        props.core.graph,
        toRenderId
      );
      const label = selectedNewSub
        ? `New ${environmentName} Branch`
        : environmentName;

      title = (
        <span className={"title" + (localsSelect ? " locals-select" : "")}>
          <span>
            {lockImg}
            {label}
            {localsSelect}
          </span>
        </span>
      );
    }

    return (
      <div
        className={
          "cell" +
          (showingMenu == environmentId ? " menu-open" : "") +
          " " +
          style({
            width: `${(1 / props.visibleEnvironmentIds.length) * 100}%`,
            background: color(styles.colors.DARKER_BLUE)
              .lighten(0.075 * i)
              .toHexString(),
          })
        }
        key={i}
      >
        {localsUserId ||
        (selectedNewSub && (isDevEnvironment || numSubEnvironments > 0)) ||
        environment?.isSub ? (
          <span className="subenvs spacer" />
        ) : (
          renderBackLink()
        )}

        {renderSubLink(toRenderId, i)}

        {title}

        {props.routeParams.environmentId && !props.isSub ? (
          <span className="subenvs spacer" />
        ) : (
          ""
        )}

        {canRead &&
        !selectedNewSub &&
        !(props.isSub && numSubEnvironments == 0 && !localsUserId) ? (
          <button
            className="menu"
            onClick={(e) => {
              e.stopPropagation();
              setShowingMenu(showingMenu ? undefined : environmentId);
            }}
          >
            <span>…</span>
          </button>
        ) : (
          <span className="menu spacer" />
        )}

        {showingMenu == environmentId ? (
          <div className="environment-menu">
            {canUpdate ? (
              <div
                onClick={() => {
                  setShowingMenu(undefined);
                  props.history.push(
                    props.location.pathname +
                      `?importEnvironmentId=${environmentId}`
                  );
                }}
              >
                Import
              </div>
            ) : (
              ""
            )}
            {canRead ? (
              <div
                onClick={() => {
                  setShowingMenu(undefined);
                  props.history.push(
                    props.location.pathname +
                      `?exportEnvironmentId=${environmentId}`
                  );
                }}
              >
                Export
              </div>
            ) : (
              ""
            )}

            {canReadVersions ? (
              <div
                onClick={() => {
                  props.history.push(
                    props.orgRoute(
                      envParentPath +
                        `/versions/${R.last(environmentId.split("|"))}`
                    )
                  );
                }}
              >
                Versions
              </div>
            ) : (
              ""
            )}

            {canReadLogs ? (
              <div
                onClick={() => {
                  props.history.push(
                    props.orgRoute(
                      envParentPath +
                        `/logs/${bs58.encode(
                          Buffer.from(
                            JSON.stringify({
                              ...defaultLogManagerState,
                              ...(localsUserId
                                ? {
                                    environmentRoleOrCompositeIds: ["locals"],
                                    userIds: [localsUserId],
                                  }
                                : {
                                    environmentRoleOrCompositeIds: [
                                      g.environmentCompositeId(environment!),
                                    ],
                                  }),
                            } as LogManagerState),
                            "utf8"
                          )
                        )}`
                    )
                  );
                }}
              >
                Logs
              </div>
            ) : (
              ""
            )}
          </div>
        ) : (
          ""
        )}
      </div>
    );
  };

  const renderAdd = () => {
    let canAdd = false;
    for (let environmentId of props.isSub
      ? props.visibleEnvironmentIds
      : props.allEnvironmentIds) {
      const environment = graph[environmentId] as Model.Environment | undefined;
      if (environment) {
        if (g.authz.canUpdateEnv(graph, currentUserId, environmentId)) {
          canAdd = true;
          break;
        }
      } else {
        const [envParentId, localsUserId] = environmentId.split("|");
        canAdd = g.authz.canUpdateLocals(
          graph,
          currentUserId,
          envParentId,
          localsUserId
        );
      }
    }

    if (!canAdd) {
      return "";
    }

    return (
      <button
        className={
          "add has-tooltip" +
          (props.ui.envManager.showAddForm ? " selected" : "")
        }
        onClick={(e) => {
          e.stopPropagation();
          if (props.ui.envManager.showAddForm) {
            props.setEnvManagerState({
              showAddForm: undefined,
              entryForm: CLEARED_EDIT_STATE,
            });
          } else {
            props.setEnvManagerState({
              showAddForm: true,
              entryForm: CLEARED_EDIT_STATE,
              confirmingDeleteEntryKeyComposite: undefined,
              editingEntryKey: undefined,
              editingEnvParentId: undefined,
              editingEnvironmentId: undefined,
              editingInputVal: undefined,
              clickedToEdit: undefined,
            });
          }
        }}
      >
        <SvgImage type="add" />
        <span className="tooltip">
          {props.envParentType == "app"
            ? "Add variable or connect blocks"
            : "Add variable"}
        </span>
      </button>
    );
  };

  const renderActionCell = () => {
    if (
      props.isSub &&
      ((numSubEnvironments == 0 && !selectedLocals) || selectedNewSub)
    ) {
      return "";
    }

    if (props.ui.envManager.showFilter) {
      return (
        <div
          className={
            "entry-col " +
            "filtering " +
            style({
              width: `${styles.layout.ENTRY_COL_PCT * 100}%`,
              minWidth: styles.layout.ENTRY_COL_MIN_WIDTH,
              maxWidth: styles.layout.ENTRY_COL_MAX_WIDTH,
            })
          }
        >
          <div>
            <span className="search">
              <SvgImage type="search" />
            </span>

            <input
              type="text"
              autoFocus={true}
              value={props.ui.envManager.filter ?? ""}
              placeholder="Filter vars..."
              onChange={(e) => {
                if (!props.ui.envManager && e.target.value.trim()) {
                  props.setEnvManagerState({
                    filter: e.target.value,
                    showBlocks: true,
                  });
                } else if (props.ui.envManager.filter && e.target.value == "") {
                  props.setEnvManagerState({
                    filter: e.target.value,
                    showBlocks: props.ui.envManager.userSetShowBlocks ?? false,
                  });
                } else {
                  props.setEnvManagerState({
                    filter: e.target.value,
                  });
                }
              }}
            />

            <button
              className="close"
              onClick={(e) => {
                props.setEnvManagerState({
                  filter: undefined,
                  showFilter: false,
                  showBlocks: props.ui.envManager.userSetShowBlocks ?? false,
                });
              }}
            >
              <SvgImage type="x" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        className={
          "entry-col " +
          style({
            width: `${styles.layout.ENTRY_COL_PCT * 100}%`,
            minWidth: styles.layout.ENTRY_COL_MIN_WIDTH,
            maxWidth: styles.layout.ENTRY_COL_MAX_WIDTH,
          })
        }
      >
        <div>
          <label>Vars</label>
          <div className="actions">
            <button
              className="search has-tooltip"
              onClick={(e) => {
                props.setEnvManagerState({ showFilter: true });
              }}
            >
              <SvgImage type="search" />
              <span className="tooltip">Filter variables</span>
            </button>

            <span
              className={
                "toggle mask-toggle has-tooltip" +
                (props.ui.envManager.hideValues ? " checked" : "")
              }
              onClick={() =>
                props.setEnvManagerState({
                  hideValues: props.ui.envManager.hideValues ? undefined : true,
                })
              }
            >
              <span className="tooltip">
                {props.ui.envManager.hideValues ? "Show values" : "Hide values"}
              </span>
              <input
                type="checkbox"
                checked={props.ui.envManager.hideValues ?? false}
              />
              <SvgImage type="hide" />
            </span>

            {renderAdd()}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={
        styles.EnvLabelRow +
        " " +
        style({
          width: `calc(100% - ${
            props.ui.sidebarWidth +
            (props.isSub && !fullWidthSelectedNewSub
              ? props.entryColWidth * 1.1666
              : 0)
          }px)`,
          height: props.labelRowHeight,
        })
      }
    >
      {renderActionCell()}

      {showLeftNav ? (
        <span
          className={styles.EnvLabelArrowButton + " envs-nav left"}
          onClick={() =>
            props.setEnvManagerState({
              environmentStartIndex:
                props.ui.envManager.environmentStartIndex - 1,
            })
          }
        >
          ←
        </span>
      ) : (
        ""
      )}

      <div className="val-cols">
        {props.visibleEnvironmentIds.map(renderLabelCell)}
      </div>

      {showRightNav ? (
        <span
          className={styles.EnvLabelArrowButton + " envs-nav right"}
          onClick={() =>
            props.setEnvManagerState({
              environmentStartIndex:
                props.ui.envManager.environmentStartIndex + 1,
            })
          }
        >
          →
        </span>
      ) : (
        ""
      )}
    </div>
  );
};

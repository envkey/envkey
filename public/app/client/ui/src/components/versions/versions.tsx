import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { OrgComponent, ReactSelectOption } from "@ui_types";
import { Model, Client } from "@core/types";
import * as ui from "@ui";
import * as styles from "@styles";
import { style } from "typestyle";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import moment from "moment";
import { SvgImage, SmallLoader } from "@images";
import {
  changesetsNeedFetch,
  getChangesets,
  getEntryKeysForAllVersions,
  getDiffsByKey,
  getEnvWithMetaForVersion,
  getEnvWithMeta,
  getPendingEnvWithMeta,
} from "@core/lib/client";
import { v4 as uuid } from "uuid";
import { Link } from "react-router-dom";
import { getUserPath } from "@ui_lib/paths";
import { pick } from "@core/lib/utils/pick";
import { TZ_ABBREV } from "@constants";

type RouteProps = {
  appId?: string;
  blockId?: string;
  environmentOrLocalsUserId: string;
  filterEntryKeys?: string;
  jumpToTimestamp?: number;
};

const MAX_DIFF_LINES_COLLAPSED = 999999; // don't implement expanding/collapsing diffs yet--show 'em all

// use a uuid for 'All Variables' select option value to avoid any possible collisions with user-defined keys
const ALL_ENTRY_KEYS_FILTER_ID = uuid();
const ALL_ENTRY_KEYS_OPTION: ReactSelectOption = {
  value: ALL_ENTRY_KEYS_FILTER_ID,
  label: "All Variables",
};

export const Versions: OrgComponent<RouteProps> = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const envParentId = (props.routeParams.appId ?? props.routeParams.blockId)!;
  const envParent = graph[envParentId] as Model.EnvParent;
  const currentUserId = props.ui.loadedAccountId!;
  const environmentOrLocalsUserId = props.routeParams.environmentOrLocalsUserId;
  const filterEntryKeys = props.routeParams.filterEntryKeys?.split(",");
  const filterEntryKeysSet = new Set(filterEntryKeys);
  let environment = graph[environmentOrLocalsUserId] as
    | Model.Environment
    | undefined;
  if (environment && environment.type != "environment") {
    environment = undefined;
  }

  const isLocals = !environment;
  const localsUserId = isLocals ? environmentOrLocalsUserId : undefined;

  const environmentId = isLocals
    ? [envParentId, localsUserId].join("|")
    : environment!.id;

  const listVersionParams: Client.Env.ListVersionsParams = {
    envParentId,
    environmentId,
    entryKeys: filterEntryKeys,
  };

  const {
    willFetchChangesets,
    localsVersionReadableUsers,
    versionReadableBaseEnvironments,
    versionReadableSubEnvironments,
    allEntryKeys,
    currentEnv,
  } = useMemo(() => {
    const { orgUsers, cliUsers } = g.graphTypes(graph);

    const environments =
      g.getEnvironmentsByEnvParentId(graph)[envParentId] ?? [];
    const subEnvironments = environment
      ? g.getSubEnvironmentsByParentEnvironmentId(graph)[
          environment.isSub ? environment.parentEnvironmentId : environment.id
        ] ?? []
      : [];

    let users = [...orgUsers, ...cliUsers].filter(({ id }) =>
      g.authz.canReadLocalsVersions(graph, currentUserId, envParentId, id)
    );
    const currentUser = users.find(R.propEq("id", currentUserId));
    if (currentUser) {
      users = [currentUser, ...R.without([currentUser], users)];
    }

    return {
      willFetchChangesets: changesetsNeedFetch(props.core, envParentId),

      localsVersionReadableUsers: users,

      versionReadableBaseEnvironments: environments.filter(
        ({ id, isSub }) =>
          !isSub && g.authz.canReadVersions(graph, currentUserId, id)
      ),

      versionReadableSubEnvironments: subEnvironments.filter(({ id }) =>
        g.authz.canReadVersions(graph, currentUserId, id)
      ),

      allEntryKeys: getEntryKeysForAllVersions(
        props.core,
        R.omit(["entryKeys"], listVersionParams)
      ),

      currentEnv: getEnvWithMeta(props.core, { envParentId, environmentId }),
    };
  }, [
    envParentId,
    currentUserId,
    props.core,
    JSON.stringify(listVersionParams),
  ]);

  const willClearLogs = useMemo(
    () =>
      props.core.loggedActionsWithTransactionIds.length > 0 &&
      !R.isEmpty(props.core.deletedGraph),
    [props.core.loggedActionsWithTransactionIds.length == 0]
  );

  const { hasPending, pendingEnv } = useMemo(() => {
    const pendingForEnvironmentId = props.core.pendingEnvUpdates.filter(
      ({ meta }) => meta.environmentId == environmentId
    );

    return {
      hasPending: pendingForEnvironmentId.length > 0,
      pendingEnv:
        pendingForEnvironmentId.length > 0
          ? getPendingEnvWithMeta(props.core, { envParentId, environmentId })
          : undefined,
    };
  }, [currentEnv, props.core.pendingEnvUpdates.length]);

  useEffect(() => {
    if (willFetchChangesets) {
      props.dispatch({
        type: Client.ActionType.FETCH_ENVS,
        payload: {
          byEnvParentId: {
            [envParentId]: { changesets: true },
          },
        },
      });
    }
  }, [willFetchChangesets]);

  useEffect(() => {
    if (willClearLogs) {
      props.dispatch({
        type: Client.ActionType.CLEAR_LOGS,
      });
    }
  }, [willClearLogs]);

  useLayoutEffect(() => {
    if (!environmentOrLocalsUserId) {
      props.history.replace(
        props.match.url + `/${versionReadableBaseEnvironments[0].id}`
      );
    }
  }, [environmentOrLocalsUserId]);

  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, true>>({});

  const [sortDesc, setSortDesc] = useState(true);

  const { changesets, initialStartVersionIndex } = useMemo(() => {
    let changesets = getChangesets(props.core, listVersionParams);

    if (sortDesc) {
      changesets = R.reverse(changesets);
    }

    let initialStartVersionIndex = 0;
    if (sortDesc && changesets.length > 0) {
      initialStartVersionIndex =
        R.sum(changesets.map(({ actions }) => actions.length)) - 1;
    }

    return { changesets, initialStartVersionIndex };
  }, [
    envParentId,
    currentUserId,
    props.core,
    JSON.stringify(listVersionParams),
    sortDesc,
  ]);

  const renderParentEnvironmentSelect = () => {
    let selectedParentEnvironmentId: string | undefined;
    if (localsUserId) {
      selectedParentEnvironmentId = "locals";
    } else if (environment && environment.isSub) {
      selectedParentEnvironmentId = environment.parentEnvironmentId;
    } else if (environment) {
      selectedParentEnvironmentId = environment.id;
    }

    return (
      <div className="field">
        <label>Environment</label>
        <div className="select">
          <select
            value={selectedParentEnvironmentId}
            onChange={(e) => {
              let environmentId: string;
              if (e.target.value == "locals") {
                if (
                  g.authz.canReadLocalsVersions(
                    graph,
                    currentUserId,
                    envParentId,
                    currentUserId
                  )
                ) {
                  environmentId = currentUserId;
                } else {
                  environmentId = localsVersionReadableUsers[0].id;
                }
              } else {
                environmentId = e.target.value;
              }

              props.history.push(
                props.match.url.replace(
                  new RegExp(`/${environmentOrLocalsUserId}`),
                  `/${environmentId}`
                )
              );
            }}
          >
            {localsVersionReadableUsers.length > 0 ? (
              <option value="locals">Locals</option>
            ) : (
              ""
            )}
            {versionReadableBaseEnvironments.map(({ id }) => (
              <option value={id}>{g.getEnvironmentName(graph, id)}</option>
            ))}
          </select>
          <SvgImage type="down-caret" />
        </div>
      </div>
    );
  };

  const renderSubEnvironmentSelect = () => {
    if (versionReadableSubEnvironments.length == 0) {
      return;
    }

    return (
      <div className="field">
        <label>Branch</label>
        <div className="select">
          <select
            value={environment?.isSub ? environment.id : "base"}
            onChange={(e) => {
              let environmentId: string | undefined;
              if (e.target.value == "base") {
                if (environment?.isSub) {
                  environmentId = environment.parentEnvironmentId;
                }
              } else {
                environmentId = e.target.value;
              }

              props.history.push(
                props.match.url.replace(
                  new RegExp(`/${environmentOrLocalsUserId}`),
                  `/${environmentId}`
                )
              );
            }}
          >
            <option value="base">None</option>
            {versionReadableSubEnvironments.map(({ id }) => (
              <option value={id}>{g.getEnvironmentName(graph, id)}</option>
            ))}
          </select>
          <SvgImage type="down-caret" />
        </div>
      </div>
    );
  };

  const renderUserSelect = () => {
    if (!localsUserId) {
      return;
    }

    return (
      <div className="field">
        <label>Person</label>
        <div className="select">
          <select
            value={localsUserId}
            onChange={(e) => {
              props.history.push(
                props.match.url.replace(
                  new RegExp(`/${environmentOrLocalsUserId}`),
                  `/${e.target.value}`
                )
              );
            }}
          >
            {localsVersionReadableUsers.map(({ id }) => {
              let name: string;
              if (id == currentUserId) {
                name = "Your";
              } else {
                name = g.getUserName(graph, id);
                if (R.last(name) == "s") {
                  name += "'";
                } else {
                  name += "'s";
                }
              }

              return <option value={id}>{name} Locals</option>;
            })}
          </select>
          <SvgImage type="down-caret" />
        </div>
      </div>
    );
  };

  const renderEntryKeysSelect = () => {
    const options = [
      ...(filterEntryKeys ? [ALL_ENTRY_KEYS_OPTION] : []),
      ...allEntryKeys
        .filter((key) => !filterEntryKeysSet.has(key))
        .map((key) => ({ label: key, value: key })),
    ];

    return (
      <div className="field">
        <label>Variables</label>
        <ui.ReactSelect
          value={
            filterEntryKeys?.map((key) => ({ label: key, value: key })) ?? []
          }
          isMulti
          options={options}
          isClearable={typeof filterEntryKeys != "undefined"}
          onChange={(selectedArg) => {
            const selected = (selectedArg ?? []) as ReactSelectOption[];

            let keys = selected.map(R.prop("value"));

            if (keys.includes(ALL_ENTRY_KEYS_FILTER_ID)) {
              keys = [];
            }

            const url = props.match.url.replace(
              new RegExp(`/${environmentOrLocalsUserId}.*$`),
              `/${environmentOrLocalsUserId}${
                keys.length > 0 ? "/" + keys.join(",") : ""
              }`
            );

            props.history.push(url);
          }}
          placeholder="All Variables"
        />
      </div>
    );
  };

  const renderSort = () => {
    return (
      <div className="field">
        <label>Order</label>
        <div className="select">
          <select
            value={sortDesc ? "desc" : "asc"}
            onChange={(e) => setSortDesc(e.target.value == "desc")}
          >
            <option value="desc">Most recent first</option>
            <option value="asc">Oldest first</option>
          </select>
          <SvgImage type="down-caret" />
        </div>
      </div>
    );
  };

  const renderVersion = (versionNum: number, isCurrent?: boolean) => {
    const prevVersionIndex = versionNum - 1;

    const prevParams = {
      ...listVersionParams,
      version: prevVersionIndex,
    };
    const prevVersionEnv =
      prevVersionIndex > 0
        ? getEnvWithMetaForVersion(props.core, prevParams)
        : undefined;

    const versionEnv = getEnvWithMetaForVersion(props.core, {
      ...listVersionParams,
      version: versionNum,
    });

    const diffs = getDiffsByKey(
      prevVersionEnv?.variables || {},
      versionEnv.variables,
      filterEntryKeys ? filterEntryKeysSet : undefined
    );

    let pairs = R.toPairs(diffs);
    const expanded = expandedDiffs[versionNum.toString()];
    const collapsed = !expanded && pairs.length > MAX_DIFF_LINES_COLLAPSED;
    const extraDiffs = collapsed ? pairs.length - MAX_DIFF_LINES_COLLAPSED : 0;

    if (collapsed) {
      pairs = pairs.slice(0, MAX_DIFF_LINES_COLLAPSED);
    }

    let equalsCurrent = false;
    let equalsPending = false;
    let canRevert = false;

    let versionVars = versionEnv.variables;
    if (filterEntryKeys) {
      versionVars = pick(filterEntryKeys, versionVars);
    }

    if (hasPending && pendingEnv) {
      let pendingVars = pendingEnv.variables;
      if (filterEntryKeys) {
        pendingVars = pick(filterEntryKeys, pendingVars);
      }
      equalsPending = R.equals(versionVars, pendingVars);
      canRevert = !equalsPending;
    }

    if (!isCurrent && !equalsPending) {
      let currentVars = currentEnv.variables;
      if (filterEntryKeys) {
        currentVars = pick(filterEntryKeys, currentVars);
      }
      equalsCurrent = R.equals(versionVars, currentVars);
      canRevert = !equalsCurrent || (equalsCurrent && hasPending);
    }

    return (
      <div className="version">
        <div className="title-row">
          <label className="num">Version {versionNum}</label>

          <div className="actions-tags">
            {isCurrent ? (
              <span className="version-tag current-version">
                Latest Version
              </span>
            ) : (
              ""
            )}

            {equalsPending ? (
              <span className="version-tag equals-pending">
                Equal To Latest With Pending Changes
              </span>
            ) : (
              ""
            )}

            {equalsCurrent ? (
              <span className="version-tag equals-current">
                Equal To Latest {hasPending ? "Without Pending Changes" : ""}
              </span>
            ) : (
              ""
            )}

            {canRevert ? (
              <button
                className="revert"
                onClick={() => {
                  props.dispatch({
                    type: Client.ActionType.REVERT_ENVIRONMENT,
                    payload: {
                      ...listVersionParams,
                      version: versionNum,
                    },
                  });
                }}
              >
                <SvgImage type="revert" />
                <strong>Revert</strong>{" "}
                {isCurrent ? "Pending Changes" : `To Version ${versionNum}`}
              </button>
            ) : (
              ""
            )}
          </div>
        </div>
        <div className="changes">
          {pairs.map(([key, diff]) => {
            return (
              <div className={styles.KeyChange + " key-change"}>
                <h4>
                  <label>{key}</label>
                </h4>
                <div className="change">
                  <div>
                    <label>From</label>
                    <span>
                      <ui.DiffCell
                        {...props}
                        cell={diff.fromValue}
                        strikethrough={true}
                      />
                    </span>
                  </div>

                  <div className="update">
                    <label>To</label>
                    <span>
                      <ui.DiffCell {...props} cell={diff.toValue} />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {collapsed ? (
          <div>
            <button
              onClick={() =>
                setExpandedDiffs({
                  ...expandedDiffs,
                  [versionNum.toString()]: true,
                })
              }
            >
              Show {extraDiffs} more diff{extraDiffs > 1 ? "s" : ""}
            </button>
          </div>
        ) : (
          ""
        )}
        {expanded ? (
          <div>
            <button
              onClick={() =>
                setExpandedDiffs(R.omit([versionNum.toString()], expandedDiffs))
              }
            >
              Collapse
            </button>
          </div>
        ) : (
          ""
        )}
      </div>
    );
  };

  const renderChangeset = (
    changeset: Client.Env.Changeset,
    commitIndex: number,
    startVersionIndex: number,
    isCurrent?: boolean
  ) => {
    let creatorGraph: Client.Graph.UserGraph;
    let deviceOrCliUser = graph[
      changeset.createdById ?? changeset.encryptedById
    ] as Model.OrgUserDevice | Model.CliUser | undefined;

    if (deviceOrCliUser) {
      creatorGraph = graph;
    } else {
      creatorGraph = props.core.deletedGraph;
      deviceOrCliUser = props.core.deletedGraph[
        changeset.createdById ?? changeset.encryptedById
      ] as Model.OrgUserDevice | Model.CliUser | undefined;
    }

    let userName: string;

    if (deviceOrCliUser) {
      userName = g.getUserName(creatorGraph, deviceOrCliUser.id);
    } else {
      userName = "Unknown";
    }

    const numActions = changeset.actions.length;

    return (
      <div className="changeset">
        <div className="commit-info">
          <div>
            <label className="num">Commit {commitIndex + 1}</label>

            <div>
              {g.authz.canListOrgUsers(graph, currentUserId) &&
              deviceOrCliUser &&
              !deviceOrCliUser.deletedAt &&
              !deviceOrCliUser.deactivatedAt ? (
                <Link
                  className="user"
                  to={props.orgRoute(getUserPath(deviceOrCliUser))}
                >
                  {userName}
                </Link>
              ) : (
                <label className="user">{userName}</label>
              )}

              <span className="sep">{"●"}</span>

              <label className="created-at">
                {moment(changeset.createdAt).format(`YYYY-MM-DD HH:mm:ss.SSS`) +
                  ` ${TZ_ABBREV}`}
              </label>
            </div>
          </div>

          {changeset.message ? (
            <p className="message">{changeset.message}</p>
          ) : (
            ""
          )}
        </div>

        <div className="versions">
          {changeset.actions.map((action, i) =>
            renderVersion(
              startVersionIndex + ((sortDesc ? -1 : 1) * i + 1),
              isCurrent && (sortDesc ? i == 0 : i == numActions - 1)
            )
          )}
        </div>
      </div>
    );
  };

  const renderChangesets = () => {
    const initialCommitIndex = sortDesc ? changesets.length - 1 : 0;
    let currentStartVersionIndex = initialStartVersionIndex;

    return changesets.length > 0 ? (
      changesets.map((changeset, i) => {
        const commitNum = sortDesc ? initialCommitIndex - i : i;
        const startVersionIndex = currentStartVersionIndex;
        currentStartVersionIndex = sortDesc
          ? currentStartVersionIndex - changeset.actions.length
          : currentStartVersionIndex + changeset.actions.length;

        return renderChangeset(
          changeset,
          commitNum,
          startVersionIndex,
          sortDesc ? i == 0 : i == changesets.length - 1
        );
      })
    ) : (
      <div>
        <p>No versions have been saved yet.</p>
      </div>
    );
  };

  if (!environmentOrLocalsUserId) {
    return <div></div>;
  }

  return (
    <div className={styles.Versions}>
      <div
        className={
          "filters " +
          styles.FilterSidebar +
          " " +
          style({
            left: props.ui.sidebarWidth,
            height: `calc(100% - ${
              styles.layout.MAIN_HEADER_HEIGHT + props.ui.pendingFooterHeight
            }px)`,
            transition: "height",
            transitionDuration: "0.2s",
          })
        }
      >
        {renderParentEnvironmentSelect()}
        {renderSubEnvironmentSelect()}
        {renderUserSelect()}
        {renderEntryKeysSelect()}
        {renderSort()}
      </div>

      <div className="list">
        {willFetchChangesets || willClearLogs ? (
          <SmallLoader />
        ) : (
          renderChangesets()
        )}
      </div>
    </div>
  );
};

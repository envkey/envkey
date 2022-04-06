import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  OrgComponent,
  ReactSelectOption,
  BASE_LOG_TYPE_OPTIONS,
  FilterLogType,
  LogManagerState,
  defaultLogManagerState,
} from "@ui_types";
import { Model, Api, Client, Logs, Rbac } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import * as bs58 from "bs58";
import * as styles from "@styles";
import * as ui from "@ui";
import { style } from "typestyle";
import moment from "moment";
import "moment-timezone";
import { pick } from "@core/lib/utils/pick";
import { isValidIP } from "@core/lib/utils/ip";
import { getPastTense } from "@core/lib/utils/grammar";
import Datetime from "react-datetime";
import { SvgImage, SmallLoader } from "@images";
import { Link } from "react-router-dom";
import { getEnvParentPath, getUserPath } from "@ui_lib/paths";
import { TZ_ABBREV } from "@constants";
import { logAndAlertError } from "@ui_lib/errors";

const PAGE_SIZE = 25;

const LOG_TYPE_OPTIONS_BY_VALUE = R.indexBy(
  R.prop("value"),
  BASE_LOG_TYPE_OPTIONS
);

const LOG_TYPE_CONFLICTING_FILTERS: [FilterLogType, FilterLogType[]][] = [
  ["org_updates", ["user_env_updates", "firewall_updates"]],
  [
    "all_access",
    [
      "all_env_access",
      "user_env_access",
      "envkey_env_access",
      "meta_access",
      "log_access",
    ],
  ],
  ["all_env_access", ["user_env_access", "envkey_env_access"]],
];

type RouteProps = {
  appId?: string;
  blockId?: string;
  userId?: string;
  logManagerStateBs58?: string;
};

export const LogManager: OrgComponent<RouteProps> = (props) => {
  const { graph, deletedGraph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const license = useMemo(
    () => g.graphTypes(graph).license,
    [graphUpdatedAt, currentUserId]
  );
  const licenseExpired =
    license.expiresAt != -1 && props.ui.now > license.expiresAt;

  const logParentId =
    props.routeParams.appId ??
    props.routeParams.blockId ??
    props.routeParams.userId;

  let logParent = logParentId
    ? (graph[logParentId] as Model.EnvParent | Model.OrgUser | Model.CliUser)
    : g.getOrg(graph);

  const [lastPageFetched, setLastPageFetched] = useState(0);
  const [fetchingFirstPage, setFetchingFirstPage] = useState(true);
  const [fetchingNextPage, setFetchingNextPage] = useState(false);
  const [lastResetDateFilters, setLastResetDateFilters] = useState(Date.now());

  const {
    byType,
    deletedByType,
    graphWithDeleted,
    byTypeWithDeleted,
    orgUsers,
    deletedOrgUsers,
    cliUsers,
    deletedCliUsers,
  } = useMemo(() => {
    const graphWithDeleted = { ...graph, ...deletedGraph };

    const byType = g.graphTypes(graph);
    const deletedByType = g.graphTypes(deletedGraph);
    const byTypeWithDeleted = g.graphTypes(graphWithDeleted);

    const userPartitionFn = (user: Model.OrgUser | Model.CliUser) =>
      Boolean(user.deletedAt ?? user.deactivatedAt);

    const [[deletedOrgUsers, orgUsers], [deletedCliUsers, cliUsers]] = [
      R.partition(userPartitionFn, byTypeWithDeleted.orgUsers),
      R.partition(userPartitionFn, byTypeWithDeleted.cliUsers),
    ];

    return {
      byType,
      deletedByType,
      graphWithDeleted,
      byTypeWithDeleted,
      orgUsers,
      deletedOrgUsers,
      cliUsers,
      deletedCliUsers,
    };
  }, [
    graphUpdatedAt,
    Object.keys(deletedGraph).length,
    props.core.logsTotalCount,
  ]);

  const clearLogs = () =>
    props.dispatch({
      type: Client.ActionType.CLEAR_LOGS,
    });

  const fetchLogs = async () => {
    setFetchingFirstPage(true);
    await clearLogs();
    await dispatchFetch(0);
    setFetchingFirstPage(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [props.routeParams.logManagerStateBs58, lastResetDateFilters]);

  useEffect(() => {
    return () => {
      clearLogs();
    };
  }, []);

  const onScroll = useCallback(async () => {
    if (
      fetchingNextPage ||
      typeof props.core.logsTotalCount != "number" ||
      props.core.loggedActionsWithTransactionIds.length >=
        props.core.logsTotalCount
    ) {
      return;
    }

    const h = document.documentElement,
      b = document.body,
      st = "scrollTop",
      sh = "scrollHeight";

    const percent =
      ((h[st] || b[st]) / ((h[sh] || b[sh]) - h.clientHeight)) * 100;

    if (percent > 99.9) {
      setFetchingNextPage(true);
      await dispatchFetch(lastPageFetched + 1);
      setFetchingNextPage(false);
    }
  }, [
    fetchingNextPage,
    props.core.logsTotalCount,
    props.core.loggedActionsWithTransactionIds.length,
  ]);

  useEffect(() => {
    window.addEventListener("scroll", onScroll, {
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, [onScroll]);

  const logManagerState = useMemo(() => {
    let state: LogManagerState;
    if (props.routeParams.logManagerStateBs58) {
      state = JSON.parse(
        bs58.decode(props.routeParams.logManagerStateBs58).toString("utf8")
      ) as LogManagerState;
    } else {
      state = defaultLogManagerState;
    }

    return state;
  }, [props.routeParams.logManagerStateBs58]);

  const dateOpts = useMemo(() => {
    if (logManagerState.dateOpt == "custom") {
      return pick(["startsAt", "endsAt"], logManagerState);
    } else {
      const [intervalStr, unit] = logManagerState.dateOpt.split(".");
      const startsAt = moment()
        .add(parseInt(intervalStr) * -1, unit as "m" | "h" | "d" | "y")
        .valueOf();
      return {
        startsAt,
        endsAt: Date.now(),
      };
    }
  }, [logManagerState, lastResetDateFilters]);

  const {
    environmentRoles,
    subEnvironments,
    deletedEnvironmentRoles,
    deletedSubEnvironments,
    subEnvironmentsByCompositeWithDeleted,
    devices,
    deletedDevices,
    dispatchPayload,
  } = useMemo(() => {
    let envParentIdsSet: Set<string> | undefined;
    if (logParent.type == "app" || logParent.type == "block") {
      envParentIdsSet = new Set([logParent.id]);
    } else if (logManagerState.envParentIds) {
      new Set(logManagerState.envParentIds);
    }

    let { environments, orgUserDevices } = byType;
    let {
      environments: deletedEnvironments,
      orgUserDevices: deletedOrgUserDevices,
    } = deletedByType;

    const envFilterFn = ({ isSub, envParentId }: Model.Environment) =>
      !isSub && (!envParentIdsSet || envParentIdsSet.has(envParentId));
    const envRoleFn = (environments: Model.Environment[]) =>
      R.uniqBy(
        R.prop("environmentRoleId"),
        environments.filter(envFilterFn)
      ).map(
        ({ environmentRoleId }) =>
          graphWithDeleted[environmentRoleId] as Rbac.EnvironmentRole
      );

    const subFilterFn = ({ isSub, envParentId }: Model.Environment) =>
      isSub && (!envParentIdsSet || envParentIdsSet.has(envParentId));
    const subFn = (environments: Model.Environment[]) =>
      R.uniqBy(g.environmentCompositeId, environments.filter(subFilterFn));

    const subEnvironments = subFn(environments);
    const deletedSubEnvironments = subFn(deletedEnvironments);
    const subEnvironmentsByCompositeWithDeleted = R.groupBy(
      g.environmentCompositeId,
      [...subEnvironments, ...deletedSubEnvironments]
    );

    const environmentRoles = envRoleFn(environments);
    const deletedEnvironmentRoles = R.without(
      environmentRoles,
      envRoleFn(deletedEnvironments)
    );

    const environmentsByRoleIdWithDeleted = R.groupBy(
      R.prop("environmentRoleId"),
      [...environments, ...deletedEnvironments].filter(envFilterFn)
    );

    let actionTypes: Logs.FetchLogParams["actionTypes"] = [];
    let targetIds: Logs.FetchLogParams["targetIds"] = [];
    let userIds: Logs.FetchLogParams["targetIds"] = [];
    let deviceIds: Logs.FetchLogParams["targetIds"] = [];

    let loggableTypes = getBaseLoggableTypes(logManagerState.filterLogTypes);

    if (logManagerState.envParentIds) {
      targetIds = targetIds.concat(logManagerState.envParentIds);
    }

    let devices: Model.OrgUserDevice[] | undefined;
    let deletedDevices: Model.OrgUserDevice[] | undefined;

    if (logManagerState.deviceIds) {
      deviceIds = logManagerState.deviceIds;
      const [deviceId] = deviceIds;
      const device = graphWithDeleted[deviceId] as Model.OrgUserDevice;
      devices = orgUserDevices.filter(R.propEq("userId", device.userId));
      deletedDevices = deletedOrgUserDevices.filter(
        R.propEq("userId", device.userId)
      );
    }

    if (logManagerState.userIds) {
      if (!logManagerState.deviceIds) {
        userIds = userIds.concat(logManagerState.userIds);
      }

      if (userIds.length == 1) {
        const [userId] = userIds;
        const user = graphWithDeleted[userId] as
          | Model.OrgUser
          | Model.CliUser
          | undefined;

        if (user?.type == "orgUser") {
          devices = orgUserDevices.filter(R.propEq("userId", user.id));
          deletedDevices = deletedOrgUserDevices.filter(
            R.propEq("userId", user.id)
          );
        }
      }
    } else if (["orgUser", "cliUser"].includes(logParent.type)) {
      if (!logManagerState.deviceIds) {
        userIds = [logParent.id];
      }

      if (logParent.type == "orgUser") {
        devices = orgUserDevices.filter(R.propEq("userId", logParent.id));
        deletedDevices = deletedOrgUserDevices.filter(
          R.propEq("userId", logParent.id)
        );
      }
    }

    if (logManagerState.environmentRoleOrCompositeIds) {
      let localsSelected = false;
      for (let id of logManagerState.environmentRoleOrCompositeIds) {
        if (id == "locals") {
          localsSelected = true;
          continue;
        }
        targetIds.push(id);
      }

      if (localsSelected) {
        targetIds.push("locals");
      }
    } else if (["app", "block"].includes(logParent.type)) {
      targetIds = [logParent.id];
    }

    const dispatchPayload: Logs.FetchLogParams = {
      pageSize: PAGE_SIZE,
      pageNum: 0,
      scope: "org",
      loggableTypes,
      actionTypes: actionTypes.length > 0 ? actionTypes : undefined,
      targetIds: targetIds.length > 0 ? targetIds : undefined,
      userIds: userIds.length > 0 ? userIds : undefined,
      deviceIds: deviceIds.length > 0 ? deviceIds : undefined,
      ...pick(["ips", "sortDesc"], logManagerState),
      ...dateOpts,
    };

    return {
      environmentRoles,
      subEnvironments,
      deletedEnvironmentRoles,
      deletedSubEnvironments,
      subEnvironmentsByCompositeWithDeleted,
      devices,
      deletedDevices,
      dispatchPayload,
    };
  }, [graphUpdatedAt, props.core.logsTotalCount, logManagerState, dateOpts]);

  const canFilterEnvironments =
    !logManagerState.filterLogTypes ||
    R.intersection(
      [
        "all_access",
        "org_updates",
        "user_env_updates",
        "all_env_access",
        "user_env_access",
        "envkey_env_access",
      ],
      logManagerState.filterLogTypes ?? []
    ).length > 0;

  useEffect(() => {
    if (
      !canFilterEnvironments &&
      logManagerState.environmentRoleOrCompositeIds
    ) {
      updateLogManagerState({ environmentRoleOrCompositeIds: undefined });
    }
  }, [canFilterEnvironments]);

  const updateLogManagerState = (update: Partial<LogManagerState>) => {
    const updated = { ...logManagerState, ...update };

    if (R.equals(updated, logManagerState)) {
      return;
    }

    const stateBs58 = bs58.encode(Buffer.from(JSON.stringify(updated), "utf8"));

    const url = props.routeParams.logManagerStateBs58
      ? props.match.url.replace(/\/[a-zA-Z0-9]+$/, "/" + stateBs58)
      : props.match.url + "/" + stateBs58;

    props.history.push(url);
  };

  const dispatchFetch = (pageNum: number) => {
    setLastPageFetched(pageNum);

    return props
      .dispatch({
        type: Api.ActionType.FETCH_LOGS,
        payload: { ...dispatchPayload, pageNum },
      })
      .then((res) => {
        if (!res.success) {
          logAndAlertError(
            `There was a problem fetching logs.`,
            (res.resultAction as any)?.payload
          );
        }

        return res;
      });
  };

  const renderActionSummary = (
    summary: string,
    actor: Logs.Actor | undefined,
    pastTense?: true
  ) => {
    const verbMatches = summary.match(/\+.*?\+/g);
    const idMatches = summary.match(/%.*?%/g);
    const boldMatches = summary.match(/\*.*?\*/g);

    let res = summary;

    let actorName: string;
    if (actor) {
      if (actor.type == "orgUser") {
        actorName = `<span class="actor">${actor.firstName}</span>`;
      } else {
        actorName = `<span class="actor">${g.getObjectName(
          graphWithDeleted,
          actor.id
        )}</span>`;
      }
    } else {
      actorName = `<span class="actor">unknown</span>`;
    }

    for (let verbMatch of verbMatches || []) {
      const verb = verbMatch.replaceAll("+", "");
      res = res.replace(
        verbMatch,
        `<span class="verb">${pastTense ? getPastTense(verb) : verb}</span>`
      );
    }

    for (let idMatch of idMatches || []) {
      const id = idMatch.replaceAll("%", "");

      let name: string = `<span class="unknown">unknown</span>`;

      if (graph[id]) {
        const object = graph[id];

        if (
          (object.type == "orgUser" || object.type == "cliUser") &&
          g.authz.canListOrgUsers(graph, currentUserId) &&
          !object.deletedAt &&
          !object.deactivatedAt
        ) {
          name = `<a class="object" href="#${props.orgRoute(
            getUserPath(object)
          )}">${g.getObjectName(graph, id)}</a>`;
        } else if (
          object.type == "app" ||
          (object.type == "block" && !object.deletedAt)
        ) {
          name = `<a class="object" href="#${props.orgRoute(
            getEnvParentPath(object)
          )}">${g.getObjectName(graph, id)}</a>`;
        } else {
          name = `<span class="object">${g.getObjectName(graph, id)}</span>`;
        }
      } else if (deletedGraph[id]) {
        name = `<span class="object">${
          g.getObjectName(deletedGraph, id) + " (inactive)"
        }</span>`;
      }

      res = res.replace(idMatch, name);
    }

    for (let boldMatch of boldMatches || []) {
      const bold = boldMatch.replaceAll("*", "");
      res = res.replace(boldMatch, `<strong>${bold}</strong>`);
    }

    res = actorName + " " + res + ".";

    return (
      <p className="action-summary" dangerouslySetInnerHTML={{ __html: res }} />
    );
  };

  const renderDateFilter = () => {
    return [
      <div className="field">
        <label>Date Range</label>
        <div className="select">
          <select
            value={logManagerState.dateOpt}
            onChange={(e) => {
              const dateOpt = e.target.value as LogManagerState["dateOpt"];
              if (dateOpt == "custom") {
                updateLogManagerState({
                  dateOpt,
                  startsAt: moment().add(-30, "d").valueOf(),
                  endsAt: Date.now(),
                });
              } else {
                updateLogManagerState({
                  dateOpt,
                });
              }
            }}
          >
            {[
              <option value={"15.m"}>Last 15 minutes</option>,
              <option value={"1.h"}>Last hour</option>,
              <option value={"4.h"}>Last 4 hours</option>,
              <option value={"24.h"}>Last 24 hours</option>,
              <option value={"7.d"}>Last 7 days</option>,
              <option value={"30.d"}>Last 30 days</option>,
              ...(license.hostType != "cloud" ||
              (!licenseExpired &&
                license.cloudLogRetentionDays &&
                license.cloudLogRetentionDays > 30)
                ? [<option value={"90.d"}>Last 90 days</option>]
                : []),
              ...(license.hostType != "cloud" ||
              (!licenseExpired &&
                license.cloudLogRetentionDays &&
                license.cloudLogRetentionDays > 90)
                ? [
                    <option value={"365.d"}>Last 365 days</option>,
                    <option value={"36500000.d"}>All time</option>,
                  ]
                : []),
              <option value={"custom"}>Custom</option>,
            ]}
          </select>

          <SvgImage type="down-caret" />
        </div>
      </div>,

      logManagerState.dateOpt == "custom" ? (
        <div className="field">
          <label>Between </label>
          <Datetime
            value={moment.utc(logManagerState.startsAt)}
            isValidDate={(dt) => {
              const ts = dt.valueOf();
              let earliestAllowed = 0;
              let daysBack: number | undefined;

              if (license.hostType == "cloud") {
                if (licenseExpired || !license.cloudLogRetentionDays) {
                  daysBack = 30;
                } else {
                  daysBack = license.cloudLogRetentionDays;
                }
              }

              if (daysBack) {
                earliestAllowed = props.ui.now - daysBack * 24 * 60 * 60 * 1000;
              }

              return ts < logManagerState.endsAt && ts > earliestAllowed;
            }}
            onChange={(dt) =>
              updateLogManagerState({
                startsAt: dt.valueOf() as number,
              })
            }
          />
          <label>and</label>
          <Datetime
            value={moment.utc(logManagerState.endsAt)}
            isValidDate={(dt) =>
              dt.valueOf() < Date.now() &&
              dt.isAfter(moment(logManagerState.startsAt).add(-1, "d"))
            }
            onChange={(dt) =>
              updateLogManagerState({
                endsAt: dt.valueOf() as number,
              })
            }
          />
        </div>
      ) : (
        ""
      ),
    ];
  };

  const renderLogTypeFilter = () => {
    return (
      <div className="field">
        <label>Log Types</label>

        <ui.ReactSelect
          value={
            logManagerState.filterLogTypes?.map((value) => ({
              label: LOG_TYPE_OPTIONS_BY_VALUE[value].label,
              value,
            })) ?? []
          }
          isMulti
          options={[
            LOG_TYPE_OPTIONS_BY_VALUE["all"] as any, // ReactSelect doesn't typecheck mixed options / option groups correctly
            {
              label: "Updates",
              options: Object.values(
                pick(
                  ["org_updates", "user_env_updates", "firewall_updates"],
                  LOG_TYPE_OPTIONS_BY_VALUE
                )
              ),
            },
            {
              label: "Fetches",
              options: Object.values(
                pick(
                  [
                    "all_access",
                    "all_env_access",
                    "user_env_access",
                    "envkey_env_access",
                    "meta_access",
                    "log_access",
                  ],
                  LOG_TYPE_OPTIONS_BY_VALUE
                )
              ),
            },
            ...(logParent.type == "app" || logParent.type == "block"
              ? []
              : [
                  {
                    label: "Auth",
                    options: [LOG_TYPE_OPTIONS_BY_VALUE.auth],
                  },
                ]),
          ]}
          isClearable={typeof logManagerState.filterLogTypes != "undefined"}
          onChange={(selectedArg) => {
            const selected = (selectedArg ?? []) as ReactSelectOption[];

            let selectedTypes = selected.map(
              R.prop("value")
            ) as FilterLogType[];
            const selectedTypesSet = new Set(selectedTypes);
            const stateSelected = new Set(logManagerState.filterLogTypes ?? []);

            if (selectedTypesSet.has("all")) {
              selectedTypes = [];
            }

            for (let [filterType, conflicts] of LOG_TYPE_CONFLICTING_FILTERS) {
              if (
                stateSelected.has(filterType) &&
                R.any(
                  (conflictType) => selectedTypesSet.has(conflictType),
                  conflicts
                )
              ) {
                selectedTypes = R.without([filterType], selectedTypes);
              }

              if (
                R.any(
                  (conflictType) => stateSelected.has(conflictType),
                  conflicts
                ) &&
                selectedTypesSet.has(filterType)
              ) {
                selectedTypes = R.without(conflicts, selectedTypes);
              }
            }

            updateLogManagerState({
              filterLogTypes:
                selectedTypes.length > 0 ? selectedTypes : undefined,
            });
          }}
          placeholder="All Log Types"
        />
      </div>
    );
  };

  const renderEnvParentFilter = () => {
    const { apps, blocks } = byType;
    const { apps: deletedApps, blocks: deletedBlocks } = deletedByType;

    if (
      (props.routeParams.appId ?? props.routeParams.blockId) ||
      apps.length + blocks.length + deletedApps.length + deletedBlocks.length <
        1
    ) {
      return;
    }

    const allLabel = "All Apps And Blocks";

    return (
      <div className="field">
        <label>Apps And Blocks</label>
        <ui.ReactSelect
          value={
            logManagerState.envParentIds?.map((id) => {
              let label: string = "...";
              if (graph[id]) {
                label = (graph[id] as Model.EnvParent).name;
              } else if (deletedGraph[id]) {
                label = (deletedGraph[id] as Model.EnvParent)?.name;
              }

              return { label, value: id };
            }) ?? []
          }
          isMulti
          options={[
            {
              label: allLabel,
              value: "all",
            } as any, // ReactSelect doesn't typecheck mixed options / option groups correctly
            ...(apps.length > 0
              ? [
                  {
                    label: "Apps",
                    options: apps.map((app) => ({
                      label: app.name,
                      value: app.id,
                    })),
                  },
                ]
              : []),
            ...(deletedApps.length > 0
              ? [
                  {
                    label: "Deleted Apps",
                    options: deletedApps.map((app) => ({
                      label: app.name,
                      value: app.id,
                    })),
                  },
                ]
              : []),
            ...(blocks.length > 0
              ? [
                  {
                    label: "Blocks",
                    options: blocks.map((block) => ({
                      label: block.name,
                      value: block.id,
                    })),
                  },
                ]
              : []),
            ...(deletedBlocks.length > 0
              ? [
                  {
                    label: "Deleted Blocks",
                    options: deletedBlocks.map((block) => ({
                      label: block.name,
                      value: block.id,
                    })),
                  },
                ]
              : []),
          ]}
          isClearable={typeof logManagerState.envParentIds != "undefined"}
          onChange={(selectedArg) => {
            const selected = (selectedArg ?? []) as ReactSelectOption[];

            let selectedIds = selected.map(R.prop("value")) as FilterLogType[];
            const selectedIdsSet = new Set(selectedIds);

            if (selectedIdsSet.has("all")) {
              selectedIds = [];
            }

            updateLogManagerState({
              envParentIds: selectedIds.length > 0 ? selectedIds : undefined,
            });
          }}
          placeholder={allLabel}
        />
      </div>
    );
  };

  const renderUserFilter = () => {
    if (
      props.routeParams.userId ||
      orgUsers.length +
        cliUsers.length +
        deletedOrgUsers.length +
        deletedCliUsers.length <
        1
    ) {
      return;
    }
    const allLabel = `All ${[
      orgUsers.length + deletedOrgUsers.length > 0 ? "People" : null,
      cliUsers.length + deletedCliUsers.length > 0 ? "CLI Keys" : null,
    ]
      .filter(Boolean)
      .join(" And ")}`;

    return (
      <div className="field">
        <label>People and CLI Keys</label>

        <ui.ReactSelect
          value={
            logManagerState.userIds?.map((id) => {
              const user = graphWithDeleted[id] as
                | Model.OrgUser
                | Model.CliUser
                | undefined;
              let label = "...";
              if (user?.deletedAt ?? user?.deactivatedAt) {
                label = g.getUserName(graphWithDeleted, id);
              } else if (user) {
                label = g.getUserName(graphWithDeleted, id);
              }
              return { label, value: id };
            }) ?? []
          }
          isMulti
          options={[
            {
              label: allLabel,
              value: "all",
            } as any, // ReactSelect doesn't typecheck mixed options / option groups correctly
            ...(orgUsers.length > 0
              ? [
                  {
                    label: "People",
                    options: orgUsers.map((orgUser) => ({
                      label: g.getUserName(graph, orgUser.id),
                      value: orgUser.id,
                    })),
                  },
                ]
              : []),
            ...(deletedOrgUsers.length > 0
              ? [
                  {
                    label: "Inactive People",
                    options: deletedOrgUsers.map((orgUser) => {
                      return {
                        label: g.getUserName(deletedGraph, orgUser.id),
                        value: orgUser.id,
                      };
                    }),
                  },
                ]
              : []),
            ...(cliUsers.length > 0
              ? [
                  {
                    label: "CLI Keys",
                    options: cliUsers.map((cliUser) => ({
                      label: cliUser.name,
                      value: cliUser.id,
                    })),
                  },
                ]
              : []),
            ...(deletedCliUsers.length > 0
              ? [
                  {
                    label: "Inactive CLI Keys",
                    options: deletedCliUsers.map((cliUser) => ({
                      label: cliUser.name,
                      value: cliUser.id,
                    })),
                  },
                ]
              : []),
          ]}
          isClearable={typeof logManagerState.userIds != "undefined"}
          onChange={(selectedArg) => {
            const selected = (selectedArg ?? []) as ReactSelectOption[];

            let selectedIds = selected.map(R.prop("value")) as FilterLogType[];
            const selectedIdsSet = new Set(selectedIds);

            if (selectedIdsSet.has("all")) {
              selectedIds = [];
            }

            updateLogManagerState({
              userIds: selectedIds.length > 0 ? selectedIds : undefined,
            });
          }}
          placeholder={allLabel}
        />
      </div>
    );
  };

  const renderDeviceFilter = () => {
    if (
      !(devices && deletedDevices) ||
      devices.length + deletedDevices.length < 1
    ) {
      return;
    }

    return (
      <div className="field">
        <label>Devices</label>

        <ui.ReactSelect
          value={
            logManagerState.deviceIds?.map((id) => {
              const device = graphWithDeleted[id] as
                | Model.OrgUserDevice
                | undefined;
              let label = "...";
              if (device?.deletedAt ?? device?.deactivatedAt) {
                label = device.name;
              } else if (device) {
                label = device.name;
              }
              return { label, value: id };
            }) ?? []
          }
          isMulti
          options={[
            {
              label: "All Devices",
              value: "all",
            } as any, // ReactSelect doesn't typecheck mixed options / option groups correctly
            ...(devices.length > 0
              ? [
                  {
                    label: "Devices",
                    options: devices.map((device) => ({
                      label: device.name,
                      value: device.id,
                    })),
                  },
                ]
              : []),
            ...(deletedDevices.length > 0
              ? [
                  {
                    label: "Inactive Devices",
                    options: deletedDevices.map((device) => {
                      return {
                        label: device.name,
                        value: device.id,
                      };
                    }),
                  },
                ]
              : []),
          ]}
          isClearable={typeof logManagerState.userIds != "undefined"}
          onChange={(selectedArg) => {
            const selected = (selectedArg ?? []) as ReactSelectOption[];

            let selectedIds = selected.map(R.prop("value")) as FilterLogType[];
            const selectedIdsSet = new Set(selectedIds);

            if (selectedIdsSet.has("all")) {
              selectedIds = [];
            }

            updateLogManagerState({
              deviceIds: selectedIds.length > 0 ? selectedIds : undefined,
            });
          }}
          placeholder="All Devices"
        />
      </div>
    );
  };

  const environmentRoleOptionFn = (environmentRole: Rbac.EnvironmentRole) => {
    return {
      label: environmentRole.name,
      value: environmentRole.id,
    };
  };

  const environmentRoleOptionsFn = (
    environmentRoles: Rbac.EnvironmentRole[],
    deleted?: true
  ) =>
    environmentRoles.length > 0 || !deleted
      ? [
          {
            label: (deleted ? "Deleted " : "") + "Environments",
            options: [
              ...(deleted
                ? []
                : [
                    {
                      label: "Locals",
                      value: "locals",
                    },
                  ]),
              ...environmentRoles.map(environmentRoleOptionFn),
            ],
          },
        ]
      : [];

  const subEnvironmentOptionFn = (subEnvironment: Model.Environment) => {
    const role = graphWithDeleted[
      subEnvironment.environmentRoleId
    ] as Rbac.EnvironmentRole;
    const [id, name] = subEnvironment.isSub
      ? [
          g.environmentCompositeId(subEnvironment),
          [role.name, subEnvironment.subName].join(" > "),
        ]
      : ["", ""];
    return {
      label: name,
      value: id,
    };
  };

  const subEnvironmentOptionsFn = (
    subEnvironments: Model.Environment[],
    deleted?: true
  ) =>
    subEnvironments.length > 0
      ? [
          {
            label: (deleted ? "Deleted " : "") + "Branches",
            options: subEnvironments.map(subEnvironmentOptionFn),
          },
        ]
      : [];

  const renderEnvironmentFilter = () => {
    if (
      !canFilterEnvironments ||
      environmentRoles.length +
        subEnvironments.length +
        deletedEnvironmentRoles.length +
        deletedSubEnvironments.length <
        1
    ) {
      return;
    }

    const allLabel = "All Environments";

    return (
      <div className="field">
        <label>Environments</label>

        <ui.ReactSelect
          value={
            logManagerState.environmentRoleOrCompositeIds?.map((id) => {
              if (id == "locals") {
                return { label: "Locals", value: "locals" };
              }

              const maybeRole = graphWithDeleted[id] as
                | Rbac.EnvironmentRole
                | undefined;
              if (maybeRole) {
                return environmentRoleOptionFn(maybeRole);
              } else {
                return subEnvironmentOptionFn(
                  subEnvironmentsByCompositeWithDeleted[id][0]
                );
              }
            }) ?? []
          }
          isMulti
          options={[
            {
              label: allLabel,
              value: "all",
            } as any, // ReactSelect doesn't typecheck mixed options / option groups correctly
            ...environmentRoleOptionsFn(environmentRoles),
            ...subEnvironmentOptionsFn(subEnvironments),
            ...environmentRoleOptionsFn(deletedEnvironmentRoles, true),
            ...subEnvironmentOptionsFn(deletedSubEnvironments, true),
          ]}
          isClearable={
            typeof logManagerState.environmentRoleOrCompositeIds != "undefined"
          }
          onChange={(selectedArg) => {
            const selected = (selectedArg ?? []) as ReactSelectOption[];
            let selectedIds = selected.map(R.prop("value")) as FilterLogType[];
            const selectedIdsSet = new Set(selectedIds);

            if (selectedIdsSet.has("all")) {
              selectedIds = [];
            }

            updateLogManagerState({
              environmentRoleOrCompositeIds:
                selectedIds.length > 0 ? selectedIds : undefined,
            });
          }}
          placeholder={allLabel}
        />
      </div>
    );
  };

  const getRenderLoggedAction =
    (actor: Logs.Actor | undefined) => (logged: Logs.LoggedAction) => {
      return (
        <div key={logged.id} className="action">
          <div>
            <label>Action</label>
            <span className="action-type">
              {R.last(logged.actionType.split("/"))}
            </span>
          </div>

          {logged.actionType == Api.ActionType.UPDATE_ENVS ||
          logged.actionType == Api.ActionType.REENCRYPT_ENVS ? (
            <ui.LogsEnvsUpdated
              {...props}
              actor={actor}
              loggedAction={logged}
              graphWithDeleted={graphWithDeleted}
            />
          ) : logged.summary ? (
            renderActionSummary(logged.summary, actor, true)
          ) : (
            ""
          )}
        </div>
      );
    };

  const renderLoggedTransaction = (txn: [string, Logs.LoggedAction[]]) => {
    const [transactionId, loggedActions] = txn;
    const logged = loggedActions[0];
    let performedBy: React.ReactNode = "";
    let deviceOrEnvkeyNode: React.ReactNode = "";

    let actor: Logs.Actor | undefined;

    if (logged.actorId) {
      actor = graphWithDeleted[logged.actorId] as Logs.Actor;

      if (!actor) {
        performedBy = "<unknown>";
      } else {
        let name = g.getObjectName(graphWithDeleted, actor.id);
        let label: string;

        if (actor.type == "cliUser") {
          label = "CLI Key";
        } else if (actor.type == "orgUser") {
          label = "Person";
        } else if (actor.type == "scimProvisioningProvider") {
          label = "SCIM";
        } else if (actor.type == "server") {
          label = "Server";
        } else {
          label = "";
        }

        const content: React.ReactNode[] = [name];

        if (
          actor.deletedAt ||
          ("deactivatedAt" in actor && actor.deactivatedAt)
        ) {
          content.push(<small className="removed">Inactive</small>);
        }

        performedBy = [
          <label>{label}</label>,
          g.authz.canListOrgUsers(graph, currentUserId) &&
          (actor.type == "orgUser" || actor.type == "cliUser") &&
          !actor.deletedAt &&
          !("deactivatedAt" in actor && actor.deactivatedAt) ? (
            <Link className="user" to={props.orgRoute(getUserPath(actor))}>
              {content}
            </Link>
          ) : (
            <span className="user">{content}</span>
          ),
        ];
      }
    }
    if (logged.deviceId) {
      const device = (graph[logged.deviceId] ??
        props.core.deletedGraph[logged.deviceId]) as Model.OrgUserDevice;
      if (device) {
        deviceOrEnvkeyNode = [<label>Device</label>, device.name];
      }
    } else if ("generatedEnvkeyId" in logged && logged.generatedEnvkeyId) {
      const key = graphWithDeleted[logged.generatedEnvkeyId] as
        | Model.GeneratedEnvkey
        | undefined;

      if (key) {
        const keyableParent = graphWithDeleted[key.keyableParentId] as
          | Model.KeyableParent
          | undefined;

        if (keyableParent) {
          if (key.keyableParentType == "localKey") {
            deviceOrEnvkeyNode = [
              <label>ENVKEY</label>,
              keyableParent.name + " - " + key.envkeyShort + "…",
            ];
          } else if (key.keyableParentType == "server") {
            deviceOrEnvkeyNode = [<label>ENVKEY</label>, key.envkeyShort + "…"];
          }
        }
      }
    }

    return (
      <div key={transactionId} className="transaction">
        <div className="transaction-summary">
          <div>
            <span className="actor">{performedBy}</span>
            <span className="date">
              <label>When</label>
              {moment(logged.createdAt).format(`YYYY-MM-DD HH:mm:ss.SSS`) +
                ` ${TZ_ABBREV}`}
            </span>
          </div>

          <div>
            <span className="device-or-envkey">
              {deviceOrEnvkeyNode ? deviceOrEnvkeyNode : ""}
            </span>

            <span className="ip">
              <label>IP</label>
              {logged.ip}
            </span>
          </div>
        </div>
        <div className="actions">
          {loggedActions.map(getRenderLoggedAction(actor))}
        </div>
      </div>
    );
  };

  const renderIpFilter = () => {
    return (
      <div className="field">
        <label>Ip Addresses</label>
        <ui.ReactSelect
          creatable={true}
          isMulti
          onChange={(selectedArg) => {
            const selected = (selectedArg ?? []) as ReactSelectOption[];

            let ips = R.uniq(selected.map(R.prop("value")).filter(isValidIP));

            if (
              !R.equals(
                R.sortBy(R.identity, logManagerState.ips ?? []),
                R.sortBy(R.identity, ips)
              )
            ) {
              updateLogManagerState({ ips: ips.length > 0 ? ips : undefined });
            }
          }}
          value={(logManagerState.ips ?? []).map((value) => ({
            value,
            label: value,
          }))}
          options={(props.core.logIps ?? []).map((value) => ({
            value,
            label: value,
          }))}
          placeholder="All IP Addresses"
          formatCreateLabel={(s: string) => s}
          isValidNewOption={(s) => isValidIP(s)}
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
            value={logManagerState.sortDesc ? "desc" : "asc"}
            onChange={(e) =>
              updateLogManagerState({
                sortDesc: e.target.value == "desc" ? true : undefined,
              })
            }
          >
            <option value="desc">Most recent first</option>
            <option value="asc">Oldest first</option>
          </select>
          <SvgImage type="down-caret" />
        </div>
      </div>
    );
  };

  return (
    <div className={styles.Logs}>
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
        {renderDateFilter()}
        {renderLogTypeFilter()}
        {renderEnvParentFilter()}
        {renderUserFilter()}
        {renderDeviceFilter()}
        {renderEnvironmentFilter()}
        {renderIpFilter()}
        {renderSort()}
      </div>

      <div className="logs">
        {typeof props.core.logsTotalCount == "number" ? (
          <div className="summary">
            <label>
              Showing{" "}
              <strong>
                {Math.min(
                  PAGE_SIZE + lastPageFetched * PAGE_SIZE,
                  props.core.logsTotalCount
                ).toLocaleString()}
              </strong>{" "}
              of{" "}
              <strong>
                {props.core.logsCountReachedLimit
                  ? Logs.TOTAL_COUNT_LIMIT.toLocaleString() + "+"
                  : Math.floor(props.core.logsTotalCount).toLocaleString()}
              </strong>{" "}
              results
            </label>
            <button
              className="reset"
              onClick={() => {
                setLastResetDateFilters(Date.now());
              }}
            >
              Refresh
            </button>
          </div>
        ) : (
          ""
        )}

        <div className="list">
          {!fetchingFirstPage &&
          typeof props.core.logsTotalCount == "number" ? (
            props.core.loggedActionsWithTransactionIds.map(
              renderLoggedTransaction
            )
          ) : (
            <div className="summary">
              <SmallLoader />
            </div>
          )}
        </div>

        {fetchingNextPage ? (
          <div>
            <SmallLoader />
          </div>
        ) : (
          ""
        )}
      </div>
    </div>
  );
};

const getBaseLoggableTypes = (
  stateFilterLogTypes: FilterLogType[] | undefined
) => {
  let loggableTypes: Logs.FetchLogParams["loggableTypes"] = [];

  if (stateFilterLogTypes) {
    const filterLogTypes = new Set(stateFilterLogTypes);

    if (filterLogTypes.has("auth")) {
      loggableTypes.push("authAction");
    }

    if (filterLogTypes.has("org_updates")) {
      loggableTypes.push("orgAction");
    }

    if (filterLogTypes.has("user_env_updates")) {
      loggableTypes.push("updateEnvsAction");
    }

    if (filterLogTypes.has("firewall_updates")) {
      loggableTypes.push("updateFirewallAction");
    }

    if (filterLogTypes.has("all_access")) {
      loggableTypes.push(
        "fetchEnvsAction",
        "fetchEnvkeyAction",
        "fetchMetaAction",
        "fetchLogsAction"
      );
    }

    if (filterLogTypes.has("all_env_access")) {
      loggableTypes.push("fetchEnvsAction", "fetchEnvkeyAction");
    }

    if (filterLogTypes.has("user_env_access")) {
      loggableTypes.push("fetchEnvsAction");
    }

    if (filterLogTypes.has("envkey_env_access")) {
      loggableTypes.push("fetchEnvkeyAction");
    }

    if (filterLogTypes.has("meta_access")) {
      loggableTypes.push("fetchMetaAction");
    }

    if (filterLogTypes.has("log_access")) {
      loggableTypes.push("fetchLogsAction");
    }
  } else {
    loggableTypes = Logs.ORG_LOGGABLE_TYPES;
  }

  return loggableTypes;
};

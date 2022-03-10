import React, { useEffect, useState } from "react";
import { applyPatch } from "rfc6902";
import { OrgComponent } from "@ui_types";
import {
  getPendingUpdateDetails,
  getAllPendingConflicts,
  getEnvWithMeta,
  getPendingEnvWithMeta,
} from "@core/lib/client";
import { Client, Model } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import * as ui from "@ui";
import { twitterShortTs } from "@core/lib/utils/date";
import * as styles from "@styles";
import { SvgImage, SmallLoader } from "@images";
import { wait } from "@core/lib/utils/wait";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { logAndAlertError } from "@ui_lib/errors";

export const ReviewPending: OrgComponent<
  {},
  {
    pendingUpdateDetails: ReturnType<typeof getPendingUpdateDetails>;
    pendingConflicts: ReturnType<typeof getAllPendingConflicts>;
    numPendingConflicts: number;
    back: () => any;
  }
> = (props) => {
  const {
    pendingUpdateDetails,
    pendingConflicts,
    core: { graph },
  } = props;

  const [isCommitting, setIsCommitting] = useState<Record<string, true>>({});
  const [isResetting, setIsResetting] = useState<Record<string, true>>({});

  const pendingEnvironmentIds = Object.keys(
    pendingUpdateDetails.diffsByEnvironmentId
  );

  useEffect(() => {
    if (pendingEnvironmentIds.length == 0) {
      props.back();
    }

    const pendingEnvironmentIdsSet = new Set(pendingEnvironmentIds);
    const pendingEnvParentIdsSet = new Set(
      pendingEnvironmentIds.map((environmentId) => {
        const environment = graph[environmentId] as
          | Model.Environment
          | undefined;
        return environment?.envParentId ?? environmentId.split("|")[0];
      })
    );

    const toRemoveComitting: string[] = [];
    for (let id in isCommitting) {
      if (
        !pendingEnvironmentIdsSet.has(id) &&
        !pendingEnvParentIdsSet.has(id)
      ) {
        toRemoveComitting.push(id);
      }
    }
    if (toRemoveComitting.length > 0) {
      setIsCommitting(R.omit(toRemoveComitting, isCommitting));
    }
  }, [pendingEnvironmentIds]);

  const renderEnvParent = (envParentId: string) => {
    const envParent = graph[envParentId] as Model.EnvParent;
    const environments =
      g.getEnvironmentsByEnvParentId(graph)[envParentId] ?? [];
    const environmentIds = environments.map(R.prop("id"));
    const localsUserIds = Object.keys(envParent.localsUpdatedAtByUserId);
    const localsIds = localsUserIds.map((userId) =>
      [envParent.id, userId].join("|")
    );

    const updatedEnvironmentIds = R.intersection(
      [...environmentIds, ...localsIds],
      pendingEnvironmentIds
    );
    const conflictsByEnvironmentId = pendingConflicts[envParentId] ?? {};
    const conflictEnvironmentIds = Object.keys(conflictsByEnvironmentId);
    const noConflictEnvironmentIds = R.without(
      conflictEnvironmentIds,
      updatedEnvironmentIds
    );

    const renderEnvironment = (environmentId: string) => {
      const environment = graph[environmentId] as Model.Environment | undefined;

      const environmentName = g.getEnvironmentName(graph, environmentId);

      const updatesByKey =
        pendingUpdateDetails.diffsByEnvironmentId[environmentId] ?? {};
      const updatedKeys = Object.keys(updatesByKey);
      const numKeys = updatedKeys.length;
      const conflicts = conflictsByEnvironmentId[environmentId] ?? [];
      const conflictKeys = conflicts.map(R.prop("entryKey"));
      const conflictKeySet = new Set(conflictKeys);
      const noConflictKeys = updatedKeys.filter(
        (key) => !conflictKeySet.has(key)
      );
      const envWithMeta = getEnvWithMeta(props.core, {
        envParentId,
        environmentId,
      });
      const pendingEnvWithMeta = getPendingEnvWithMeta(props.core, {
        envParentId,
        environmentId,
      });

      const environmentPrefix = [
        <span>{envParent.name}</span>,
        <SvgImage type="right-caret" />,
        environment && environment.isSub
          ? [
              <span>
                {g.getEnvironmentName(graph, environment.parentEnvironmentId)}
              </span>,
              <SvgImage type="right-caret" />,
            ]
          : "",
      ];

      return (
        <div className="environment">
          <h4>
            {environmentPrefix}
            {environmentName}

            {isCommitting[environmentId] || isResetting[environmentId] ? (
              <SmallLoader />
            ) : (
              <div className="actions">
                <span
                  onClick={async () => {
                    setIsResetting({ ...isResetting, [environmentId]: true });

                    await Promise.all([
                      props
                        .dispatch({
                          type: Client.ActionType.RESET_ENVS,
                          payload: {
                            pendingEnvironmentIds: [environmentId],
                          },
                        })
                        .then((res) => {
                          if (!res.success) {
                            logAndAlertError(
                              `There was a problem resetting the updates.`,
                              res.resultAction
                            );
                          }
                        }),
                      wait(MIN_ACTION_DELAY_MS),
                    ]);

                    setIsResetting(R.omit([environmentId], isResetting));
                  }}
                >
                  <SvgImage type="x" /> <span>Reset Pending Changes</span>
                </span>

                <span
                  onClick={() => {
                    setIsCommitting({ ...isCommitting, [environmentId]: true });

                    props
                      .dispatch({
                        type: Client.ActionType.COMMIT_ENVS,
                        payload: {
                          pendingEnvironmentIds: [environmentId],
                        },
                      })
                      .then((res) => {
                        if (!res.success) {
                          logAndAlertError(
                            `There was a problem committing the updates.`,
                            res.resultAction
                          );
                        }
                      });
                  }}
                >
                  <SvgImage type="check" />
                  <span>Commit Pending Changes</span>
                </span>
              </div>
            )}
          </h4>

          {conflicts.length > 0 ? (
            <div>
              {conflicts.map((conflict) => {
                const envWithMetaPrevious = R.clone(envWithMeta);
                applyPatch(
                  envWithMetaPrevious,
                  conflict.action.payload.reverse
                );
                const envWithMetaToUpdate = R.clone(envWithMeta);
                applyPatch(envWithMetaToUpdate, conflict.action.payload.diffs);

                return (
                  <div className={styles.KeyChange + " key-change conflict"}>
                    <h4>
                      {environmentPrefix}
                      <span>{environmentName}</span>
                      <SvgImage type="right-caret" />
                      <span>Potential Conflict</span>
                      <SvgImage type="right-caret" />
                      <label>{conflict.entryKey}</label>
                      {isResetting[
                        [environmentId, conflict.entryKey].join("|")
                      ] ? (
                        <SmallLoader />
                      ) : (
                        <div className="actions">
                          <span
                            onClick={async () => {
                              setIsResetting({
                                ...isResetting,
                                [[environmentId, conflict.entryKey].join("|")]:
                                  true,
                              });

                              await props
                                .dispatch({
                                  type: Client.ActionType.RESET_ENVS,
                                  payload: {
                                    pendingEnvironmentIds: [environmentId],
                                    entryKeys: [conflict.entryKey],
                                  },
                                })
                                .then((res) => {
                                  if (!res.success) {
                                    logAndAlertError(
                                      `There was a problem resetting the updates.`,
                                      res.resultAction
                                    );
                                  }
                                });

                              setIsResetting(
                                R.omit(
                                  [
                                    [environmentId, conflict.entryKey].join(
                                      "|"
                                    ),
                                  ],
                                  isResetting
                                )
                              );
                            }}
                          >
                            <SvgImage type="x" />
                            <span>Reset Pending Changes</span>
                          </span>
                        </div>
                      )}
                    </h4>

                    <div className="change">
                      <div className="set-by">
                        <label>Set By</label>
                        <span>
                          <strong>
                            {g.getUserName(
                              graph,
                              conflict.changeset.encryptedById
                            )}
                          </strong>
                          <span className="sep">{" ● "}</span>
                          <span>
                            {twitterShortTs(conflict.changeset.createdAt)}
                          </span>
                        </span>
                      </div>
                      <div>
                        <label>Was</label>
                        <span>
                          <ui.DiffCell
                            {...props}
                            cell={
                              envWithMetaPrevious.variables[conflict.entryKey]
                            }
                            strikethrough={true}
                          />
                        </span>
                      </div>
                      <div>
                        <label>Current</label>
                        <span>
                          <ui.DiffCell
                            {...props}
                            cell={
                              envWithMetaToUpdate.variables[conflict.entryKey]
                            }
                            strikethrough={true}
                          />
                        </span>
                      </div>
                      <div className="update">
                        <label>Pending</label>
                        <span>
                          <ui.DiffCell
                            {...props}
                            cell={
                              pendingEnvWithMeta.variables[conflict.entryKey]
                            }
                          />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            ""
          )}
          {noConflictKeys.length > 0 ? (
            <div>
              {noConflictKeys.map((key) => {
                const currentCell = envWithMeta.variables[key];
                const pendingCell = pendingEnvWithMeta.variables[key];

                return (
                  <div className={styles.KeyChange + " key-change"}>
                    <h4>
                      {environmentPrefix}
                      <span>{environmentName}</span>
                      <SvgImage type="right-caret" />
                      <label>{key}</label>
                      {isResetting[[environmentId, key].join("|")] ? (
                        <SmallLoader />
                      ) : (
                        <div className="actions">
                          <span
                            onClick={async () => {
                              setIsResetting({
                                ...isResetting,
                                [[environmentId, key].join("|")]: true,
                              });

                              await props
                                .dispatch({
                                  type: Client.ActionType.RESET_ENVS,
                                  payload: {
                                    pendingEnvironmentIds: [environmentId],
                                    entryKeys: [key],
                                  },
                                })
                                .then((res) => {
                                  if (!res.success) {
                                    logAndAlertError(
                                      `There was a problem resetting the updates.`,
                                      res.resultAction
                                    );
                                  }
                                });

                              setIsResetting(
                                R.omit(
                                  [[environmentId, key].join("|")],
                                  isResetting
                                )
                              );
                            }}
                          >
                            <SvgImage type="x" />
                            <span>Reset Pending Change</span>
                          </span>
                        </div>
                      )}
                    </h4>
                    <div className="change">
                      <div>
                        <label>Current</label>
                        <span>
                          <ui.DiffCell
                            {...props}
                            cell={currentCell}
                            strikethrough={true}
                          />
                        </span>
                      </div>

                      <div className="pending">
                        <label>Pending</label>
                        <span>
                          <ui.DiffCell {...props} cell={pendingCell} />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            ""
          )}
        </div>
      );
    };

    return (
      <div className="env-parent">
        <div>
          <h4>
            {envParent.name}

            {isResetting[envParent.id] || isCommitting[envParent.id] ? (
              <SmallLoader />
            ) : (
              <div className="actions">
                <span
                  onClick={async () => {
                    setIsResetting({ ...isResetting, [envParent.id]: true });

                    await Promise.all([
                      props
                        .dispatch({
                          type: Client.ActionType.RESET_ENVS,
                          payload: {
                            pendingEnvironmentIds: updatedEnvironmentIds,
                          },
                        })
                        .then((res) => {
                          if (!res.success) {
                            logAndAlertError(
                              `There was a problem resetting the updates.`,
                              res.resultAction
                            );
                          }
                        }),
                      wait(MIN_ACTION_DELAY_MS),
                    ]);

                    setIsResetting(R.omit([envParent.id], isResetting));
                  }}
                >
                  <SvgImage type="x" />
                  <span>Reset Pending Changes</span>
                </span>
                <span
                  onClick={() => {
                    setIsCommitting({ ...isCommitting, [envParent.id]: true });
                    props
                      .dispatch({
                        type: Client.ActionType.COMMIT_ENVS,
                        payload: {
                          pendingEnvironmentIds: updatedEnvironmentIds,
                        },
                      })
                      .then((res) => {
                        if (!res.success) {
                          logAndAlertError(
                            `There was a problem committing the updates.`,
                            res.resultAction
                          );
                        }
                      });
                  }}
                >
                  <SvgImage type="check" />
                  <span>Commit Pending Changes</span>
                </span>
              </div>
            )}
          </h4>
        </div>
        <div>
          {conflictEnvironmentIds
            .concat(noConflictEnvironmentIds)
            .map(renderEnvironment)}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.ReviewPending}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          props.back();
        }}
        className="overlay"
      >
        <span className="back">
          <span>← Back</span>
        </span>
      </div>

      <div className="modal">
        <h3>
          <strong>Review</strong> Pending Changes
        </h3>

        {/* Conflicts go first */}
        {R.sortBy(
          (envParentId) => {
            const envParent = graph[envParentId] as Model.EnvParent;
            return `${envParent.type} ${envParent.name}`;
          },

          Object.keys(pendingConflicts)
        )

          .concat(
            Array.from(pendingUpdateDetails.apps)
              .concat(Array.from(pendingUpdateDetails.blocks))
              .filter((envParentId) => !pendingConflicts[envParentId])
          )
          .map(renderEnvParent)}
      </div>
    </div>
  );
};

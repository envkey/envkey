import React, {
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { EnvManagerComponent } from "@ui_types";
import { Client, Model } from "@core/types";
import { getCurrentUserEnv, getCurrentUserEntryKeys } from "@core/lib/client";
import * as ui from "@ui";
import * as R from "ramda";
import * as g from "@core/lib/graph";
import { style } from "typestyle";
import { getEnvsUiPermissions } from "@ui_lib/envs";
import * as styles from "@styles";

const HIGHLIGHT_DURATION = 4000;
let justSubmittedTimeout: ReturnType<typeof setTimeout> | undefined;

export const EnvGrid: EnvManagerComponent<
  {},
  { isConnectedBlock?: true; connectedBlockEnvironmentIds?: string[] }
> = (props) => {
  const {
    showLeftNav,
    showRightNav,
    core: { graph },
  } = props;
  const currentUserId = props.ui.loadedAccountId!;

  const filter = props.ui.envManager.filter?.trim().toLowerCase();

  let localsUserId: string | undefined;
  if (props.allEnvironmentIds.length == 1) {
    const [environmentId] = props.allEnvironmentIds;
    const environment = graph[environmentId] as Model.Environment | undefined;

    if (!environment) {
      const split = environmentId.split("|");
      localsUserId = split[1];
    }
  }

  const pendingEnvsWithMeta = useMemo(
    () =>
      R.mergeAll(
        props.visibleEnvironmentIds
          .map((environmentId) => {
            const pendingUserEnv = getCurrentUserEnv(
              props.core,
              currentUserId,
              environmentId,
              true
            );
            if (!pendingUserEnv) {
              return undefined;
            }
            return {
              [environmentId]: pendingUserEnv,
            };
          })
          .filter(
            (res): res is Record<string, Client.Env.UserEnv> =>
              typeof res != "undefined"
          )
      ),
    [currentUserId, JSON.stringify(props.visibleEnvironmentIds), props.core]
  );

  const committedEnvsWithMeta = useMemo(() => {
    const res = R.mergeAll(
      props.visibleEnvironmentIds
        .map((environmentId) => {
          const committedUserEnv = getCurrentUserEnv(
            props.core,
            currentUserId,
            environmentId
          );
          if (!committedUserEnv) {
            return undefined;
          }
          return {
            [environmentId]: committedUserEnv,
          };
        })
        .filter(
          (res): res is Record<string, Client.Env.UserEnv> =>
            typeof res != "undefined"
        )
    );

    return res;
  }, [currentUserId, JSON.stringify(props.visibleEnvironmentIds), props.core]);

  const envsUiPermissions = useMemo(
    () =>
      getEnvsUiPermissions(
        props.core.graph,
        currentUserId,
        props.envParentId,
        props.connectedBlockEnvironmentIds?.filter(Boolean) ??
          props.allEnvironmentIds,
        props.localsUserId
      ),
    [
      currentUserId,
      JSON.stringify(props.connectedBlockEnvironmentIds),
      JSON.stringify(props.allEnvironmentIds),
      props.core.graphUpdatedAt,
    ]
  );

  const canUpdateEntry = useMemo(
    () =>
      localsUserId
        ? g.authz.canUpdateLocals(
            graph,
            currentUserId,
            props.envParentId,
            localsUserId
          )
        : R.all(R.prop("canUpdate"), Object.values(envsUiPermissions)),
    [envsUiPermissions]
  );

  const [highlightEntryKey, setHighlightEntryKey] = useState<string>();
  const [removingEntryKey, setRemovingEntryKey] = useState<string>();

  useEffect(() => {
    if (!props.isConnectedBlock && props.ui.envManager.submittedEntryKey) {
      if (justSubmittedTimeout) {
        clearTimeout(justSubmittedTimeout);
        justSubmittedTimeout = undefined;
      }
      setHighlightEntryKey(props.ui.envManager.submittedEntryKey);

      justSubmittedTimeout = setTimeout(() => {
        setHighlightEntryKey(undefined);
      }, HIGHLIGHT_DURATION);

      props.setEnvManagerState({ submittedEntryKey: undefined });
    }
  }, [props.ui.envManager.submittedEntryKey]);

  const el = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!props.isConnectedBlock && highlightEntryKey && el.current) {
      const highlightedRow = el.current.getElementsByClassName(
        "highlight-row"
      )[0] as HTMLDivElement | undefined;

      if (highlightedRow) {
        const top = highlightedRow.offsetTop;
        const addForm = document.getElementsByClassName(
          "env-add-form"
        )[0] as HTMLDivElement;

        const addFormOffset = addForm ? addForm.offsetHeight : 0;

        window.scrollTo({
          top:
            top -
            (addFormOffset +
              styles.layout.MAIN_HEADER_HEIGHT +
              styles.layout.ENV_LABEL_ROW_HEIGHT),
          behavior: "smooth",
        });
      }
    }
  });

  const renderEntryCol = (entryKey: string) => [
    <ui.EnvCell
      {...props}
      type="entry"
      entryKey={entryKey}
      canUpdate={canUpdateEntry}
      pending={!committedEntryKeysSet.has(entryKey)}
    />,
  ];

  const renderValCols = (entryKey: string) => {
    const cols: React.ReactNode[] = [];

    if (showLeftNav) {
      cols.push(
        <div
          onClick={(e) => {
            e.stopPropagation();
            props.setEnvManagerState({
              environmentStartIndex:
                props.ui.envManager.environmentStartIndex - 1,
            });
          }}
          className="arrow-col left"
        >
          ←
        </div>
      );
    }

    cols.push(
      <div className="cells">
        {props.visibleEnvironmentIds.map((environmentId) => {
          const pendingCell = (pendingEnvsWithMeta[environmentId]?.variables ??
            {})[entryKey];
          const committedCell = (committedEnvsWithMeta[environmentId]
            ?.variables ?? {})[entryKey];

          return (
            <ui.EnvCell
              {...props}
              {...(localsUserId
                ? {
                    canRead: true,
                    canReadMeta: true,
                    canUpdate: g.authz.canUpdateLocals(
                      graph,
                      currentUserId,
                      props.envParentId,
                      localsUserId
                    ),
                  }
                : envsUiPermissions[environmentId])}
              cell={pendingCell}
              pending={!R.equals(pendingCell, committedCell)}
              type="entryVal"
              environmentId={environmentId}
              entryKey={entryKey}
            />
          );
        })}
      </div>
    );

    if (showRightNav) {
      cols.push(
        <div
          onClick={(e) => {
            e.stopPropagation();
            props.setEnvManagerState({
              editingEntryKey: undefined,
              editingEnvParentId: undefined,
              editingEnvironmentId: undefined,
              editingInputVal: undefined,
              environmentStartIndex:
                props.ui.envManager.environmentStartIndex + 1,
            });
          }}
          className="arrow-col right"
        >
          →
        </div>
      );
    }

    return cols;
  };

  const renderRow = (entryKey: string, i: number) => {
    if (removingEntryKey == entryKey) {
      return;
    }

    return props.ui.envManager.confirmingDeleteEntryKeyComposite ==
      [
        props.envParentId,
        props.isSub ? props.allEnvironmentIds[0] : undefined,
        entryKey,
      ]
        .filter(Boolean)
        .join("|") ? (
      <div className="row confirming-remove">
        <label>
          Remove <strong>{entryKey}</strong>?
        </label>
        <div className="buttons">
          <button
            className="secondary"
            onClick={() => {
              props.setEnvManagerState({
                confirmingDeleteEntryKeyComposite: undefined,
              });
            }}
          >
            Cancel
          </button>
          <button
            className="primary"
            onClick={() => {
              setRemovingEntryKey(entryKey);

              if (props.isSub) {
                props.dispatch({
                  type: Client.ActionType.REMOVE_ENTRY,
                  payload: {
                    envParentId: props.envParentId,
                    environmentId: props.allEnvironmentIds[0],
                    entryKey,
                  },
                });
              } else {
                props.dispatch({
                  type: Client.ActionType.REMOVE_ENTRY_ROW,
                  payload: {
                    envParentId: props.envParentId,
                    entryKey,
                  },
                });
              }

              props.setEnvManagerState({
                confirmingDeleteEntryKeyComposite: undefined,
              });
            }}
          >
            Remove
          </button>
        </div>
      </div>
    ) : (
      <div
        className={
          "row" +
          (!props.isConnectedBlock && highlightEntryKey == entryKey
            ? " highlight-row"
            : "") +
          (showLeftNav ? " show-left-nav" : "") +
          (showRightNav ? " show-right-nav" : "") +
          (i % 2 == 0 ? " even" : " odd")
        }
      >
        <div
          className={
            "entry-col " +
            style({
              width: `${styles.layout.ENTRY_COL_PCT * 100}%`,
              minWidth: styles.layout.ENTRY_COL_MIN_WIDTH,
              maxWidth: styles.layout.ENTRY_COL_MAX_WIDTH,
              height: props.envRowHeight,
            })
          }
        >
          {renderEntryCol(entryKey)}
        </div>
        <div className="val-cols">{renderValCols(entryKey)}</div>
      </div>
    );
  };

  let entryKeyEnvironmentIds: string[];
  if (props.isSub) {
    entryKeyEnvironmentIds = props.visibleEnvironmentIds;
  } else if (
    props.envParentType == "block" &&
    props.connectedBlockEnvironmentIds
  ) {
    entryKeyEnvironmentIds = props.connectedBlockEnvironmentIds;
  } else {
    entryKeyEnvironmentIds = props.allEnvironmentIds;
  }

  const { pendingEntryKeysJson, pendingEntryKeysSet } = useMemo(() => {
    const pendingEntryKeys = getCurrentUserEntryKeys(
      props.core,
      currentUserId,
      entryKeyEnvironmentIds,
      true
    );
    return {
      pendingEntryKeysJson: JSON.stringify(pendingEntryKeys),
      pendingEntryKeysSet: new Set(pendingEntryKeys),
    };
  }, [props.core, currentUserId, JSON.stringify(entryKeyEnvironmentIds)]);

  const displayEntryKeys = useMemo(() => {
    if (
      props.editingMultiline &&
      props.ui.envManager.editingEntryKey &&
      props.ui.envManager.editingEnvParentId == props.envParentId
    ) {
      return [props.ui.envManager.editingEntryKey];
    }

    const keys = getCurrentUserEntryKeys(
      props.core,
      currentUserId,
      entryKeyEnvironmentIds,
      true
    );

    return filter ? keys.filter((k) => k.toLowerCase().includes(filter)) : keys;
  }, [
    props.core,
    pendingEntryKeysJson,
    props.editingMultiline,
    props.ui.envManager.editingEntryKey,
    props.ui.envManager.editingEnvParentId,
    filter,
  ]);

  const committedEntryKeysSet = useMemo(
    () =>
      new Set(
        getCurrentUserEntryKeys(
          props.core,
          currentUserId,
          entryKeyEnvironmentIds
        )
      ),
    [props.core, currentUserId, JSON.stringify(entryKeyEnvironmentIds)]
  );

  useEffect(() => {
    if (removingEntryKey && !displayEntryKeys.includes(removingEntryKey)) {
      setRemovingEntryKey(undefined);
    }
  }, [displayEntryKeys.length]);

  useEffect(() => {
    const removeCellIds: string[] = [];
    for (let cellId in props.ui.envManager.committingToCore) {
      const [entryKey] = cellId.split("|");
      if (!pendingEntryKeysSet.has(entryKey)) {
        removeCellIds.push(cellId);
      }
    }

    if (removeCellIds.length > 0) {
      props.setEnvManagerState({
        committingToCore: R.omit(
          removeCellIds,
          props.ui.envManager.committingToCore
        ),
      });
    }
  }, [pendingEntryKeysJson]);

  if (props.editingMultiline && props.ui.envManager.editingEnvironmentId) {
    const editingEnvironment = props.core.graph[
      props.ui.envManager.editingEnvironmentId
    ] as Model.Environment;
    const editingEnvParent = props.core.graph[
      editingEnvironment.envParentId
    ] as Model.EnvParent;

    if (editingEnvParent.type != props.envParentType) {
      return <div></div>;
    }
  }

  return (
    <div className={styles.EnvGrid + " env-grid"} ref={el}>
      {displayEntryKeys.map(renderRow)}
      {displayEntryKeys.length == 0 ? (
        <div className="empty-placeholder">
          <span>No variables are defined.</span>
        </div>
      ) : (
        ""
      )}
    </div>
  );
};

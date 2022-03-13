import React, { useMemo, useEffect } from "react";
import { EnvManagerComponent, EntryFormState } from "@ui_types";
import { Client, Model } from "@core/types";
import * as R from "ramda";
import * as ui from "@ui";
import * as g from "@core/lib/graph";
import { style } from "typestyle";
import { getEnvsUiPermissions } from "@ui_lib/envs";
import { getCurrentUserEntryKeys } from "@core/lib/client";
import * as styles from "@styles";
import { logAndAlertError } from "@ui_lib/errors";

export const CLEARED_EDIT_STATE: EntryFormState = {
  entryKey: undefined,
  editingEntryKey: undefined,
  editingEnvironmentId: undefined,
  vals: {},
};

export const EntryForm: EnvManagerComponent = (props) => {
  const { showLeftNav, showRightNav } = props;
  const currentUserId = props.ui.loadedAccountId!;

  const entryFormState = props.ui.envManager.entryForm;

  const envsUiPermissions = useMemo(
    () =>
      getEnvsUiPermissions(
        props.core.graph,
        currentUserId,
        props.envParentId,
        props.visibleEnvironmentIds,
        props.localsUserId
      ),
    [currentUserId, props.visibleEnvironmentIds, props.core.graphUpdatedAt]
  );

  const currentEntryKeysSet = useMemo(() => {
    const keys = getCurrentUserEntryKeys(
      props.core,
      currentUserId,
      props.visibleEnvironmentIds,
      true
    );

    return new Set(keys);
  }, [props.core, JSON.stringify(props.visibleEnvironmentIds)]);

  useEffect(() => {
    props.setEntryFormState({ ...CLEARED_EDIT_STATE, editingEntryKey: true });
  }, []);

  const onSubmit = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!entryFormState.entryKey?.trim()) {
      return;
    }

    if (currentEntryKeysSet.has(entryFormState.entryKey)) {
      const res = confirm(
        `'${entryFormState.entryKey}' is already defined. Do you want to overwrite it?`
      );
      if (!res) {
        return;
      }
    }

    props
      .dispatch({
        type: Client.ActionType.CREATE_ENTRY_ROW,
        payload: {
          envParentId: props.envParentId,
          entryKey: entryFormState.entryKey,
          vals: R.mergeAll(
            props.visibleEnvironmentIds.map((environmentId) => ({
              [environmentId]: entryFormState.vals[environmentId] ?? {
                isUndefined: true,
              },
            }))
          ),
        },
      })
      .then((res) => {
        if (!res.success) {
          logAndAlertError(
            `There was a problem adding the variable.`,
            (res.resultAction as any).payload
          );
        }
      });

    props.setEnvManagerState({
      ...props.ui.envManager,
      submittedEntryKey: entryFormState.entryKey,
      entryForm: {
        ...CLEARED_EDIT_STATE,
        editingEntryKey: true,
      },
    });
  };

  const renderEntryCell = () => <ui.EntryFormCell {...props} type="entry" />;

  const renderValCell = (environmentId: string, i: number) => {
    const environment = props.core.graph[environmentId] as
      | Model.Environment
      | undefined;

    let canUpdate: boolean;
    if (environment) {
      canUpdate = envsUiPermissions[environmentId].canUpdate;
    } else {
      const [envParentId, localsUserId] = environmentId.split("|");
      canUpdate = g.authz.canUpdateLocals(
        props.core.graph,
        currentUserId,
        envParentId,
        localsUserId
      );
    }

    return (
      <ui.EntryFormCell
        {...props}
        type="entryVal"
        environmentId={environmentId}
        canUpdate={canUpdate}
      />
    );
  };

  const renderValCols = () => {
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
        {props.visibleEnvironmentIds.map(renderValCell)}
      </div>
    );

    if (showRightNav) {
      cols.push(
        <div
          onClick={(e) => {
            e.stopPropagation();
            props.setEnvManagerState({
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

  return (
    <div>
      <div className={styles.EnvGrid}>
        <div
          className={
            "row" +
            (showLeftNav ? " show-left-nav" : "") +
            (showRightNav ? " show-right-nav" : "")
          }
        >
          <div
            className={
              "entry-col " +
              style({
                width: props.entryColWidth,
                height: props.envRowHeight,
              })
            }
          >
            {renderEntryCell()}
          </div>
          <div className="val-cols">{renderValCols()}</div>
        </div>
      </div>
      <div className="entry-form-actions">
        <button
          className={
            "primary " +
            style({
              width: props.entryColWidth - 20,
            })
          }
          onClick={onSubmit}
        >
          Create Variable
        </button>
      </div>
    </div>
  );
};

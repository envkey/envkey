import React, { useState, useMemo, useEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Api } from "@core/types";
import humanize from "humanize-string";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import * as ui from "@ui";
import { stripUndefinedRecursive } from "@core/lib/utils/object";
import * as styles from "@styles";
import { SvgImage, SmallLoader } from "@images";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { wait } from "@core/lib/utils/wait";
import { logAndAlertError } from "@ui_lib/errors";

const getComponent = (envParentType: "app" | "block") => {
  const Settings: OrgComponent<
    ({ appId: string } | { blockId: string }) & {}
  > = (props) => {
    const { graph, graphUpdatedAt } = props.core;
    const envParentId =
      "appId" in props.routeParams
        ? props.routeParams.appId
        : props.routeParams.blockId;
    const envParent = graph[envParentId] as Model.App | Model.Block;
    const currentUserId = props.ui.loadedAccountId!;
    const envParentTypeLabel = humanize(envParentType);
    const org = g.getOrg(graph);

    const { canRename, canUpdateSettings, canDelete, canManageEnvironments } =
      useMemo(() => {
        const canUpdateSettings =
          envParent.type == "app"
            ? g.authz.canUpdateAppSettings(graph, currentUserId, envParentId)
            : g.authz.canUpdateBlockSettings(graph, currentUserId, envParentId);

        return {
          canRename:
            envParent.type == "app"
              ? g.authz.canRenameApp(graph, currentUserId, envParentId)
              : g.authz.canRenameBlock(graph, currentUserId, envParentId),
          canUpdateSettings,
          canDelete:
            envParent.type == "app"
              ? g.authz.canDeleteApp(graph, currentUserId, envParentId)
              : g.authz.canDeleteBlock(graph, currentUserId, envParentId),

          canManageEnvironments:
            envParent.type == "app"
              ? g.authz.hasAppPermission(
                  graph,
                  currentUserId,
                  envParentId,
                  "app_manage_environments"
                )
              : g.authz.hasOrgPermission(
                  graph,
                  currentUserId,
                  "blocks_manage_environments"
                ),
        };
      }, [graphUpdatedAt, envParentId, currentUserId]);

    const [name, setName] = useState(envParent.name);
    const [autoCaps, setAutoCaps] = useState(envParent.settings.autoCaps);
    const [autoCommitLocals, setAutoCommitLocals] = useState(
      envParent.settings.autoCommitLocals
    );

    const [confirmDeleteName, setConfirmDeleteName] = useState("");

    const [updatingSettings, setUpdatingSettings] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [awaitingMinDelay, setAwaitingMinDelay] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const settingsFlagsState = {
      autoCaps,
      autoCommitLocals,
    };
    const settingsState: Model.EnvParentSettings = { ...settingsFlagsState };

    useEffect(() => {
      setName(envParent.name);
      setAutoCaps(envParent.settings.autoCaps);
      setAutoCommitLocals(envParent.settings.autoCommitLocals);
      setConfirmDeleteName("");
      setUpdatingSettings(false);
    }, [envParentId]);

    useEffect(() => {
      if (renaming && envParent.name == name && !awaitingMinDelay) {
        setRenaming(false);
      }
    }, [envParent.name, awaitingMinDelay]);

    const settingsUpdated = () => {
      return !R.equals(
        stripUndefinedRecursive(envParent.settings),
        stripUndefinedRecursive(settingsState)
      );
    };

    const nameUpdated = envParent.name != name;

    const dispatchSettingsUpdate = () => {
      if (updatingSettings || !settingsUpdated()) {
        return;
      }

      setUpdatingSettings(true);
      if (!awaitingMinDelay) {
        setAwaitingMinDelay(true);
        wait(MIN_ACTION_DELAY_MS).then(() => setAwaitingMinDelay(false));
      }

      props
        .dispatch({
          type:
            envParentType == "app"
              ? Api.ActionType.UPDATE_APP_SETTINGS
              : Api.ActionType.UPDATE_BLOCK_SETTINGS,
          payload: {
            id: envParentId,
            settings: settingsState,
          },
        })
        .then((res) => {
          if (!res.success) {
            logAndAlertError(
              `There was a problem updating ${envParentType} settings.`,
              (res.resultAction as any)?.payload
            );
          }
        });
    };

    useEffect(() => {
      dispatchSettingsUpdate();
    }, [JSON.stringify(settingsFlagsState)]);

    useEffect(() => {
      if (updatingSettings && !awaitingMinDelay) {
        setUpdatingSettings(false);
      }
    }, [JSON.stringify(envParent.settings), awaitingMinDelay]);

    const renderRename = () => {
      if (canRename) {
        return (
          <div>
            <div className="field">
              <label>{envParentTypeLabel} Name</label>
              <input
                type="text"
                disabled={renaming}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button
                className="primary"
                disabled={!name.trim() || name == envParent.name || renaming}
                onClick={() => {
                  setRenaming(true);
                  setAwaitingMinDelay(true);
                  wait(MIN_ACTION_DELAY_MS).then(() =>
                    setAwaitingMinDelay(false)
                  );

                  props
                    .dispatch({
                      type:
                        envParentType == "app"
                          ? Api.ActionType.RENAME_APP
                          : Api.ActionType.RENAME_BLOCK,
                      payload: { id: envParent.id, name },
                    })
                    .then((res) => {
                      if (!res.success) {
                        logAndAlertError(
                          `There was a problem renaming the ${envParentType}.`,
                          (res.resultAction as any)?.payload
                        );
                      }
                    });
                }}
              >
                {renaming ? "Renaming..." : "Rename"}
              </button>
            </div>
          </div>
        );
      } else {
        return "";
      }
    };

    const renderSettings = () => {
      if (!canUpdateSettings) {
        return;
      }

      let autoCapsOption: "inherit" | "overrideTrue" | "overrideFalse";
      if (typeof autoCaps == "undefined") {
        autoCapsOption = "inherit";
      } else {
        autoCapsOption = autoCaps ? "overrideTrue" : "overrideFalse";
      }

      let autoCommitLocalsOption: "inherit" | "overrideTrue" | "overrideFalse";
      if (typeof autoCommitLocals == "undefined") {
        autoCommitLocalsOption = "inherit";
      } else {
        autoCommitLocalsOption = autoCommitLocals
          ? "overrideTrue"
          : "overrideFalse";
      }

      return (
        <div>
          <div className="field">
            <label>Auto-Upcase Variable Names?</label>
            <div className="select">
              <select
                value={autoCapsOption}
                disabled={updatingSettings}
                onChange={(e) => {
                  let val: boolean | undefined;

                  if (e.target.value == "inherit") {
                    val = undefined;
                  } else {
                    val = e.target.value == "overrideTrue";
                  }

                  setAutoCaps(val);
                }}
              >
                <option value="inherit">
                  Inherit from org settings (
                  {org.settings.envs.autoCaps ? "Yes" : "No"})
                </option>
                <option value="overrideTrue">Yes</option>
                <option value="overrideFalse">No</option>
              </select>
              <SvgImage type="down-caret" />
            </div>
          </div>
          {/* <div className="field">
            <label>Auto-Commit Locals On Change?</label>
            <div className="select">
              <select
                value={autoCommitLocalsOption}
                disabled={updatingSettings}
                onChange={(e) => {
                  let val: boolean | undefined;

                  if (e.target.value == "inherit") {
                    val = undefined;
                  } else {
                    val = e.target.value == "overrideTrue";
                  }

                  setAutoCommitLocals(val);
                }}
              >
                <option value="inherit">
                  Inherit from org settings (
                  {org.settings.envs.autoCommitLocals ? "Yes" : "No"})
                </option>
                <option value="overrideTrue">Yes</option>
                <option value="overrideFalse">No</option>
              </select>
              <SvgImage type="down-caret" />
            </div>
          </div> */}
        </div>
      );
    };

    const renderManageEnvironments = () => {
      if (!canManageEnvironments) {
        return;
      }
      return <ui.ManageEnvParentEnvironments {...props} />;
    };

    const renderDelete = () => {
      if (canDelete) {
        return (
          <div className="field">
            <label>Delete {envParentTypeLabel}</label>
            <input
              type="text"
              value={confirmDeleteName}
              disabled={isDeleting}
              onChange={(e) => setConfirmDeleteName(e.target.value)}
              placeholder={`To confirm, enter ${envParentType} name here...`}
            />
            <button
              className="primary"
              disabled={isDeleting || confirmDeleteName != envParent.name}
              onClick={async () => {
                setIsDeleting(true);
                await wait(500); // add a little delay for a smoother transition
                props.setUiState({ justDeletedObjectId: envParentId });
                props
                  .dispatch({
                    type:
                      envParentType == "app"
                        ? Api.ActionType.DELETE_APP
                        : Api.ActionType.DELETE_BLOCK,
                    payload: { id: envParentId },
                  })
                  .then((res) => {
                    if (!res.success) {
                      logAndAlertError(
                        `There was a problem deleting the ${envParentType}.`,
                        (res.resultAction as any)?.payload
                      );
                    }
                  });
              }}
            >
              {isDeleting ? <SmallLoader /> : `Delete ${envParentTypeLabel}`}
            </button>
          </div>
        );
      }
    };

    const renderDangerZone = () => {
      if (canDelete) {
        return (
          <div className="danger-zone">
            <h3>Danger Zone</h3>
            {renderDelete()}
          </div>
        );
      }
    };

    return (
      <div className={styles.OrgContainer}>
        <h3>
          {updatingSettings || renaming ? <SmallLoader /> : ""}
          {envParentTypeLabel} <strong>Settings</strong>
        </h3>

        {nameUpdated ? (
          <span className="unsaved-changes">Unsaved changes</span>
        ) : (
          ""
        )}

        {renderRename()}
        {renderSettings()}
        {renderManageEnvironments()}
        {renderDangerZone()}
      </div>
    );
  };

  return Settings;
};

export const AppSettings = getComponent("app");
export const BlockSettings = getComponent("block");

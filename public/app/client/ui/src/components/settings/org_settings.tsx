import React, { useState, useMemo, useEffect, useLayoutEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Api } from "@core/types";
import { stripUndefinedRecursive } from "@core/lib/utils/object";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import * as ui from "@ui";
import * as styles from "@styles";
import { SmallLoader } from "@images";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { wait } from "@core/lib/utils/wait";
import { style } from "typestyle";
import { logAndAlertError } from "@ui_lib/errors";

export const OrgSettings: OrgComponent = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const org = g.getOrg(graph);
  const currentUserId = props.ui.loadedAccountId!;

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { canRename, canUpdateSettings, canDelete } = useMemo(() => {
    return {
      canRename: g.authz.canRenameOrg(graph, currentUserId),
      canUpdateSettings: g.authz.canUpdateOrgSettings(graph, currentUserId),
      canDelete: g.authz.canDeleteOrg(graph, currentUserId),
    };
  }, [graphUpdatedAt, currentUserId]);

  const [name, setName] = useState(org.name);

  const [autoCaps, setAutoCaps] = useState(org.settings.envs?.autoCaps ?? true);
  const [autoCommitLocals, setAutoCommitLocals] = useState(
    org.settings.envs?.autoCommitLocals ?? false
  );

  const [requiresPassphrase, setRequiresPassphrase] = useState(
    org.settings.crypto.requiresPassphrase
  );
  const [requiresLockout, setRequiresLockout] = useState(
    org.settings.crypto.requiresLockout
  );
  const [lockoutMs, setLockoutMs] = useState(org.settings.crypto.lockoutMs);

  const [inviteExpirationMs, setInviteExpirationMs] = useState(
    org.settings.auth.inviteExpirationMs
  );
  const [deviceGrantExpirationMs, setDeviceGrantExpirationMs] = useState(
    org.settings.auth.deviceGrantExpirationMs
  );
  const [tokenExpirationMs, setTokenExpirationMs] = useState(
    org.settings.auth.tokenExpirationMs
  );

  const [confirmDeleteName, setConfirmDeleteName] = useState("");
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const [updatingCryptoSettings, setUpdatingCryptoSettings] = useState(false);
  const [updatingAuthSettings, setUpdatingAuthSettings] = useState(false);
  const [updatingEnvsSettings, setUpdatingEnvsSettings] = useState(false);

  const [renaming, setRenaming] = useState(false);
  const [awaitingMinDelay, setAwaitingMinDelay] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const settingsFlagsState = {
    autoCaps,
    autoCommitLocals,
    requiresPassphrase,
    requiresLockout,
  };
  const settingsState: Model.OrgSettings = {
    crypto: {
      requiresPassphrase,
      requiresLockout,
      lockoutMs,
    },
    auth: {
      inviteExpirationMs,
      deviceGrantExpirationMs,
      tokenExpirationMs,
    },
    envs: {
      autoCommitLocals,
      autoCaps,
    },
  };

  useEffect(() => {
    if (renaming && org.name == name && !awaitingMinDelay) {
      setRenaming(false);
    }
  }, [org.name, awaitingMinDelay]);

  const {
    settingsUpdated,
    cryptoSettingsUpdated,
    authSettingsUpdated,
    envsSettingsUpdated,
  } = useMemo(() => {
    const cryptoSettingsUpdated = !R.equals(
      stripUndefinedRecursive(org.settings.crypto),
      stripUndefinedRecursive(settingsState.crypto)
    );

    const authSettingsUpdated = !R.equals(
      stripUndefinedRecursive(org.settings.auth),
      stripUndefinedRecursive(settingsState.auth)
    );

    const envsSettingsUpdated = !R.equals(
      stripUndefinedRecursive(org.settings.envs),
      stripUndefinedRecursive(settingsState.envs)
    );

    return {
      settingsUpdated:
        cryptoSettingsUpdated || authSettingsUpdated || envsSettingsUpdated,
      cryptoSettingsUpdated,
      authSettingsUpdated,
      envsSettingsUpdated,
    };
  }, [JSON.stringify(org.settings), JSON.stringify(settingsState)]);

  const nameUpdated = name.trim() != org.name;

  const dispatchSettingsUpdate = async () => {
    if (updatingSettings || !settingsUpdated) {
      return;
    }

    setUpdatingSettings(true);

    if (cryptoSettingsUpdated) {
      setUpdatingCryptoSettings(true);
    }

    if (authSettingsUpdated) {
      setUpdatingAuthSettings(true);
    }

    if (envsSettingsUpdated) {
      setUpdatingEnvsSettings(true);
    }

    setAwaitingMinDelay(true);
    wait(MIN_ACTION_DELAY_MS).then(() => setAwaitingMinDelay(false));

    await props
      .dispatch({
        type: Api.ActionType.UPDATE_ORG_SETTINGS,
        payload: settingsState,
      })
      .then((res) => {
        if (!res.success) {
          logAndAlertError(
            `There was a problem updating org settings.`,
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
      setUpdatingCryptoSettings(false);
      setUpdatingAuthSettings(false);
      setUpdatingEnvsSettings(false);
    }
  }, [JSON.stringify(org.settings), awaitingMinDelay]);

  const renderRename = () => {
    if (canRename) {
      return (
        <div className="field">
          <label>Org Name</label>
          <input
            type="text"
            disabled={renaming}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="primary"
            disabled={!name.trim() || !nameUpdated || renaming}
            onClick={() => {
              setRenaming(true);
              setAwaitingMinDelay(true);
              wait(MIN_ACTION_DELAY_MS).then(() => setAwaitingMinDelay(false));

              props
                .dispatch({
                  type: Api.ActionType.RENAME_ORG,
                  payload: { name: name.trim() },
                })
                .then((res) => {
                  if (!res.success) {
                    logAndAlertError(
                      `There was a problem renaming the org.`,
                      (res.resultAction as any)?.payload
                    );
                  }
                });
            }}
          >
            {renaming ? "Renaming..." : "Rename"}
          </button>
        </div>
      );
    } else {
      return "";
    }
  };

  const renderSettings = () => {
    if (canUpdateSettings) {
      return (
        <div>
          <div>
            <h3>
              Security <strong>Settings</strong>
              {updatingCryptoSettings ? <SmallLoader /> : ""}
            </h3>
            <div
              className={
                "field checkbox" +
                (requiresPassphrase ? " selected" : "") +
                (updatingSettings ? " disabled" : "")
              }
              onClick={() => setRequiresPassphrase(!requiresPassphrase)}
            >
              <label>Require passphrase for all organization devices</label>
              <input type="checkbox" checked={requiresPassphrase} />
            </div>
            {requiresPassphrase ? (
              <div
                className={
                  "field checkbox" +
                  (requiresLockout ? " selected" : "") +
                  (updatingSettings ? " disabled" : "")
                }
                onClick={() => setRequiresLockout(!requiresLockout)}
              >
                <label>Require lockout for all organization devices</label>
                <input type="checkbox" checked={requiresLockout} />
              </div>
            ) : (
              ""
            )}
            {requiresLockout ? (
              <div>
                <div className="field">
                  <label>Minimum required lockout (minutes) </label>
                  <input
                    disabled={updatingSettings}
                    type="number"
                    min="1"
                    value={
                      typeof lockoutMs == "number" ? lockoutMs / 1000 / 60 : 120
                    }
                    onChange={(e) => {
                      setLockoutMs(parseInt(e.target.value) * 60 * 1000);
                    }}
                  />
                </div>
                <div className="field">
                  <input
                    type="submit"
                    className="primary"
                    disabled={updatingSettings || !cryptoSettingsUpdated}
                    onClick={dispatchSettingsUpdate}
                    value={
                      (updatingCryptoSettings ? "Updating " : "Update ") +
                      "Security Settings" +
                      (updatingCryptoSettings ? "..." : "")
                    }
                  />
                </div>
              </div>
            ) : (
              ""
            )}
          </div>

          <div>
            <h3>
              Authentication <strong>Settings</strong>
              {updatingAuthSettings ? <SmallLoader /> : ""}
            </h3>
            <div className="field">
              <label>User session expiration (days)</label>
              <input
                type="number"
                disabled={updatingSettings}
                min="1"
                value={tokenExpirationMs / 1000 / 60 / 60 / 24}
                onChange={(e) => {
                  setTokenExpirationMs(
                    parseInt(e.target.value) * 24 * 60 * 60 * 1000
                  );
                }}
              />
            </div>
            <div className="field">
              <label>User invitation expiration (hours)</label>
              <input
                type="number"
                disabled={updatingSettings}
                min="1"
                value={inviteExpirationMs / 1000 / 60 / 60}
                onChange={(e) => {
                  setInviteExpirationMs(
                    parseInt(e.target.value) * 60 * 60 * 1000
                  );
                }}
              />
            </div>
            <div className="field">
              <label>Device invitation expiration (hours)</label>
              <input
                type="number"
                disabled={updatingSettings}
                min="1"
                value={deviceGrantExpirationMs / 1000 / 60 / 60}
                onChange={(e) => {
                  setDeviceGrantExpirationMs(
                    parseInt(e.target.value) * 60 * 60 * 1000
                  );
                }}
              />
            </div>

            <div className="field">
              <input
                type="submit"
                className="primary"
                disabled={updatingSettings || !authSettingsUpdated}
                onClick={dispatchSettingsUpdate}
                value={
                  (updatingAuthSettings ? "Updating " : "Update ") +
                  "Authentication Settings" +
                  (updatingAuthSettings ? "..." : "")
                }
              />
            </div>
          </div>

          <div>
            <h3>
              Environment <strong>Settings</strong>
              {updatingEnvsSettings ? <SmallLoader /> : ""}
            </h3>
            <div
              className={
                "field checkbox no-margin" +
                (autoCaps ? " selected" : "") +
                (updatingSettings ? " disabled" : "")
              }
              onClick={() => setAutoCaps(!autoCaps)}
            >
              <label>Default Auto-Upcase Variable Names</label>
              <input type="checkbox" checked={autoCaps} />
            </div>
            {/* <div
              className={
                "field checkbox" +
                (autoCommitLocals ? " selected" : "") +
                (updatingSettings ? " disabled" : "")
              }
              onClick={() => setAutoCommitLocals(!autoCommitLocals)}
            >
              <label>Default Auto-Commit Locals On Change</label>
              <input type="checkbox" checked={autoCommitLocals} />
            </div> */}
          </div>
        </div>
      );
    }
  };

  const renderDelete = () => {
    if (canDelete) {
      return (
        <div className="field">
          <label>Delete Organization</label>
          <input
            type="text"
            value={confirmDeleteName}
            onChange={(e) => setConfirmDeleteName(e.target.value)}
            placeholder={"To confirm, enter organization name here..."}
          />
          <button
            className="primary"
            disabled={isDeleting || confirmDeleteName != org.name}
            onClick={async () => {
              setIsDeleting(true);

              const minDelayPromise = wait(MIN_ACTION_DELAY_MS);

              const res = await props.dispatch({
                type: Api.ActionType.DELETE_ORG,
                payload: {},
              });

              await minDelayPromise;

              if (res.success) {
                alert("The organization was successfully deleted.");
                props.history.replace("/home");
              } else {
                logAndAlertError(
                  "There was a problem deleting the organization.",
                  (res.resultAction as any)?.payload
                );
              }
            }}
          >
            {isDeleting ? "Deleting Organization..." : "Delete Organization"}
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
        {updatingSettings ||
        renaming ||
        settingsState.crypto.lockoutMs != org.settings.crypto.lockoutMs ? (
          <SmallLoader />
        ) : (
          ""
        )}
        Org <strong>Settings</strong>
      </h3>
      {authSettingsUpdated || nameUpdated ? (
        <span className="unsaved-changes">Unsaved changes</span>
      ) : (
        ""
      )}
      {renderRename()}
      {renderSettings()}
      {renderDangerZone()}
    </div>
  );
};

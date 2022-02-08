import React, { useState } from "react";
import { DeviceSettingsFields } from "@ui";
import { Component } from "@ui_types";
import { Client } from "@core/types";
import { HomeContainer } from "./home_container";
import { wait } from "@core/lib/utils/wait";
import * as styles from "@styles";
import { MIN_ACTION_DELAY_MS } from "@constants";

export const DeviceSettings: Component = (props) => {
  const { core, dispatch, history } = props;

  const [reset, setReset] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [defaultDeviceName, setDefaultDeviceName] = useState<string | null>(
    core.defaultDeviceName ?? null
  );

  const [requiresLockout, setRequiresLockout] = useState(
    typeof core.lockoutMs == "number"
  );
  const [lockoutMs, setLockoutMs] = useState<number | null>(
    core.lockoutMs ?? null
  );
  const [requiresPassphrase, setRequiresPassphrase] = useState(
    core.requiresPassphrase === true
  );
  const [passphrase, setPassphrase] = useState<string>();

  const shouldClearPassphrase = core.requiresPassphrase && !requiresPassphrase;

  const hasUpdate = Boolean(
    (defaultDeviceName && defaultDeviceName != core.defaultDeviceName) ||
      (requiresPassphrase && passphrase) ||
      (core.requiresPassphrase && !requiresPassphrase) ||
      (requiresPassphrase &&
        requiresLockout &&
        lockoutMs &&
        lockoutMs != core.lockoutMs) ||
      (core.lockoutMs && !requiresLockout && !shouldClearPassphrase)
  );

  const dispatchUpdates = async () => {
    let updated = false;
    setIsUpdating(true);

    const minDelayPromise = wait(MIN_ACTION_DELAY_MS);

    if (defaultDeviceName && defaultDeviceName != core.defaultDeviceName) {
      await dispatch({
        type: Client.ActionType.SET_DEFAULT_DEVICE_NAME,
        payload: {
          name: defaultDeviceName,
        },
      });
      updated = true;
    }

    if (requiresPassphrase && passphrase) {
      await dispatch({
        type: Client.ActionType.SET_DEVICE_PASSPHRASE,
        payload: { passphrase },
      });
      updated = true;
    } else if (core.requiresPassphrase && !requiresPassphrase) {
      await dispatch({ type: Client.ActionType.CLEAR_DEVICE_PASSPHRASE });

      updated = true;
    }

    if (
      requiresPassphrase &&
      requiresLockout &&
      lockoutMs &&
      lockoutMs != core.lockoutMs
    ) {
      await dispatch({
        type: Client.ActionType.SET_DEVICE_LOCKOUT,
        payload: { lockoutMs },
      });
      updated = true;
    } else if (
      core.lockoutMs &&
      !requiresLockout &&
      !shouldClearPassphrase /* (clearing passphrase already clears the lockout) */
    ) {
      await dispatch({ type: Client.ActionType.CLEAR_DEVICE_LOCKOUT });
      updated = true;
    }

    await minDelayPromise;

    setReset(updated);
    setIsUpdating(false);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    dispatchUpdates();
  };

  const renderButtons = () => {
    return (
      <div>
        <div className="buttons">
          <input
            disabled={!hasUpdate || isUpdating}
            className="primary"
            type="submit"
            value={isUpdating ? "Saving..." : "Save"}
          />
        </div>
        <div className="back-link">
          <a
            onClick={(e) => {
              e.preventDefault();
              if (history.length > 1) {
                history.goBack();
              } else {
                history.replace("/home");
              }
            }}
          >
            ← Back
          </a>
        </div>
      </div>
    );
  };

  return (
    <HomeContainer>
      <form className={styles.DeviceSettings} onSubmit={onSubmit}>
        <DeviceSettingsFields
          {...props}
          passphraseStrengthInputs={[defaultDeviceName ?? ""].filter(Boolean)}
          disabled={isUpdating}
          onChange={({
            defaultDeviceName,
            requiresPassphrase,
            passphrase,
            requiresLockout,
            lockoutMs,
          }) => {
            setDefaultDeviceName(defaultDeviceName ?? null);
            setRequiresPassphrase(requiresPassphrase ?? false);
            setPassphrase(passphrase);
            setRequiresLockout(requiresLockout ?? false);
            setLockoutMs(lockoutMs ?? null);
            setReset(false);
          }}
          focus
          reset={reset || undefined}
        />
        {renderButtons()}
      </form>
    </HomeContainer>
  );
};

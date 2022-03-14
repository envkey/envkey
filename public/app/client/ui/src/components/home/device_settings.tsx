import React, { useState } from "react";
import { DeviceSettingsFields } from "@ui";
import { Component } from "@ui_types";
import { Client } from "@core/types";
import { HomeContainer } from "./home_container";
import * as styles from "@styles";
import { wait } from "@core/lib/utils/wait";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { logAndAlertError } from "@ui_lib/errors";

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
    core.lockoutMs ?? 120 * 1000 * 60
  );
  const [requiresPassphrase, setRequiresPassphrase] = useState(
    core.requiresPassphrase === true
  );
  const [passphrase, setPassphrase] = useState<string>();

  const [deviceSecurityValid, setDeviceSecurityValid] = useState<boolean>();

  const shouldClearPassphrase = core.requiresPassphrase && !requiresPassphrase;

  const hasUpdate = Boolean(
    (defaultDeviceName && defaultDeviceName != core.defaultDeviceName) ||
      (requiresPassphrase && passphrase) ||
      (core.requiresPassphrase && !requiresPassphrase) ||
      (requiresLockout && !core.lockoutMs) ||
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
      const res = await dispatch({
        type: Client.ActionType.SET_DEFAULT_DEVICE_NAME,
        payload: {
          name: defaultDeviceName,
        },
      });

      if (res.success) {
        updated = true;
      } else {
        logAndAlertError(
          "There was a problem setting the default device name.",
          (res.resultAction as any)?.payload
        );
      }
    }

    if (requiresPassphrase && passphrase) {
      const res = await dispatch({
        type: Client.ActionType.SET_DEVICE_PASSPHRASE,
        payload: { passphrase },
      });

      if (res.success) {
        updated = true;
      } else {
        logAndAlertError(
          "There was a problem setting the device passphrase.",
          (res.resultAction as any)?.payload
        );
      }
    } else if (core.requiresPassphrase && !requiresPassphrase) {
      const res = await dispatch({
        type: Client.ActionType.CLEAR_DEVICE_PASSPHRASE,
      });

      if (res.success) {
        updated = true;
      } else {
        logAndAlertError(
          "There was a problem clearing the device passphrase.",
          (res.resultAction as any)?.payload
        );
      }
    }

    if (
      requiresPassphrase &&
      requiresLockout &&
      lockoutMs &&
      lockoutMs != core.lockoutMs
    ) {
      const res = await dispatch({
        type: Client.ActionType.SET_DEVICE_LOCKOUT,
        payload: { lockoutMs },
      });
      if (res.success) {
        updated = true;
      } else {
        logAndAlertError(
          "There was a problem setting the device lockout.",
          (res.resultAction as any)?.payload
        );
      }
    } else if (
      core.lockoutMs &&
      !requiresLockout &&
      !shouldClearPassphrase /* (clearing passphrase already clears the lockout) */
    ) {
      const res = await dispatch({
        type: Client.ActionType.CLEAR_DEVICE_LOCKOUT,
      });
      if (res.success) {
        updated = true;
      } else {
        logAndAlertError(
          "There was a problem clearing the device lockout.",
          (res.resultAction as any)?.payload
        );
      }
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
            disabled={!hasUpdate || isUpdating || deviceSecurityValid === false}
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
            isValid,
          }) => {
            setDefaultDeviceName(defaultDeviceName ?? null);
            setRequiresPassphrase(requiresPassphrase ?? false);
            setPassphrase(passphrase);
            setRequiresLockout(requiresLockout ?? false);
            setLockoutMs(lockoutMs);
            setReset(false);
            setDeviceSecurityValid(isValid);
          }}
          focus
          reset={reset || undefined}
        />
        {renderButtons()}
      </form>
    </HomeContainer>
  );
};

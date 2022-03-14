import React, { useState } from "react";
import { DeviceSettingsFields } from "@ui";
import { OrgComponent } from "@ui_types";
import { Client, Model } from "@core/types";
import { HomeContainer } from "../home/home_container";
import * as styles from "@styles";
import { logAndAlertError } from "@ui_lib/errors";

export const RequireDeviceSecurity: OrgComponent<{ orgId: string }> = (
  props
) => {
  const { core, dispatch, history } = props;

  const orgId = props.routeParams.orgId;
  const org = props.core.graph[orgId] as Model.Org;

  const [reset, setReset] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const [requiresLockout, setRequiresLockout] = useState(
    typeof core.lockoutMs == "number" || org.settings.crypto.requiresLockout
  );
  const [lockoutMs, setLockoutMs] = useState<number | null>(
    core.lockoutMs ?? org.settings.crypto.lockoutMs ?? 120 * 1000 * 60
  );
  const [requiresPassphrase, setRequiresPassphrase] = useState(
    core.requiresPassphrase === true || org.settings.crypto.requiresPassphrase
  );
  const [passphrase, setPassphrase] = useState<string>();

  const [deviceSecurityValid, setDeviceSecurityValid] = useState<boolean>();

  const hasUpdate = Boolean(
    (requiresPassphrase && passphrase) ||
      (requiresLockout && !core.lockoutMs) ||
      (requiresPassphrase &&
        requiresLockout &&
        lockoutMs &&
        lockoutMs != core.lockoutMs)
  );

  const dispatchUpdates = async () => {
    setIsUpdating(true);

    if (requiresPassphrase && passphrase) {
      const res = await dispatch({
        type: Client.ActionType.SET_DEVICE_PASSPHRASE,
        payload: { passphrase },
      });

      if (!res.success) {
        logAndAlertError(
          "There was a problem setting the device passphrase.",
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
      if (!res.success) {
        logAndAlertError(
          "There was a problem setting the device lockout.",
          (res.resultAction as any)?.payload
        );
      }
    }
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
            value={isUpdating ? "Saving..." : "Save & Continue"}
          />
        </div>
        <div className="back-link">
          <a
            onClick={(e) => {
              e.preventDefault();
              history.replace("/home");
            }}
          >
            ← Back To Home
          </a>
        </div>
      </div>
    );
  };

  return (
    <HomeContainer overlay={true}>
      <form className={styles.DeviceSettings} onSubmit={onSubmit}>
        <p>
          <strong>{org.name}</strong> requires a passphrase
          {org.settings.crypto.requiresLockout
            ? ` and a lockout of ${
                org.settings.crypto.lockoutMs
                  ? Math.floor(org.settings.crypto.lockoutMs / 1000 / 60)
                  : "infinity"
              } minutes or lower to be set on your device`
            : ""}
          .
        </p>
        <DeviceSettingsFields
          {...props}
          disabled={isUpdating}
          fields={["passphrase", "lockout"]}
          onChange={({
            requiresPassphrase,
            passphrase,
            requiresLockout,
            lockoutMs,
            isValid,
          }) => {
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

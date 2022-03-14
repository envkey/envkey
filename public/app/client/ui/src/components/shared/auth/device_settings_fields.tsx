import * as R from "ramda";
import React, { useState, useRef, useEffect } from "react";
import { PassphraseInput } from "@ui";
import { Component } from "@ui_types";
import { Client } from "@core/types";

type DeviceField = "defaultDeviceName" | "passphrase" | "lockout";

type Props = {
  fields?: DeviceField[];
  passphraseStrengthInputs?: string[];
  focus?: true;
  reset?: true;
  disabled?: boolean;
  onChange: (params: {
    defaultDeviceName?: string;
    requiresPassphrase?: boolean;
    passphrase?: string;
    requiresLockout?: boolean;
    lockoutMs: number;
    isValid: boolean;
  }) => void;
};

export const DeviceSettingsFields: Component<{}, Props> = (props) => {
  const { core, onChange } = props;
  const fields = props.fields ?? ["defaultDeviceName", "passphrase", "lockout"];

  const allOrgNames: string[] = [];
  const allUserNames: string[] = [];
  const allEmails: string[] = [];
  const allDeviceNames: string[] = [];

  let anyOrgRequiresPassphrase = false;
  let orgNamesRequiringPassphrase: string[] = [];
  let anyOrgRequiresLockout = false;
  let orgNamesRequiringLockout: string[] = [];
  let minRequiredLockoutMs: number | undefined;
  let orgNamesRequiringMinLockout: string[] = [];

  for (let accountId in core.orgUserAccounts) {
    const account = core.orgUserAccounts[accountId]!;

    allOrgNames.push(account.orgName);
    allUserNames.push(account.firstName);
    allUserNames.push(account.lastName);
    allEmails.push(account.email);
    allDeviceNames.push(account.deviceName);

    if (account.requiresPassphrase) {
      anyOrgRequiresPassphrase = true;
      orgNamesRequiringPassphrase.push(account.orgName);

      if (account.requiresLockout) {
        anyOrgRequiresLockout = true;
        orgNamesRequiringLockout.push(account.orgName);

        if (
          account.lockoutMs &&
          (!minRequiredLockoutMs || account.lockoutMs < minRequiredLockoutMs)
        ) {
          minRequiredLockoutMs = account.lockoutMs;
        }
      }
    }
  }

  if (minRequiredLockoutMs) {
    for (let accountId in core.orgUserAccounts) {
      const account = core.orgUserAccounts[accountId]!;
      if (
        account.requiresLockout &&
        account.lockoutMs == minRequiredLockoutMs
      ) {
        orgNamesRequiringMinLockout.push(account.orgName);
      }
    }
  }

  orgNamesRequiringPassphrase = R.uniq(orgNamesRequiringPassphrase);
  orgNamesRequiringLockout = R.uniq(orgNamesRequiringLockout);
  orgNamesRequiringMinLockout = R.uniq(orgNamesRequiringMinLockout);

  const [defaultDeviceName, setDefaultDeviceName] = useState<string | null>(
    core.defaultDeviceName ?? null
  );

  const [requiresLockout, setRequiresLockout] = useState(
    typeof core.lockoutMs == "number" || anyOrgRequiresLockout
  );
  const [lockoutMs, setLockoutMs] = useState<number>(
    core.lockoutMs ?? minRequiredLockoutMs ?? 120 * 1000 * 60
  );

  const [requiresPassphrase, setRequiresPassphrase] = useState(
    core.requiresPassphrase === true || anyOrgRequiresPassphrase
  );

  const [passphrase, setPassphrase] = useState<string>();

  useEffect(() => {
    if (props.reset && passphrase) {
      setPassphrase(undefined);
    }
  }, [props.reset, passphrase]);

  const requiredPassphraseMissing =
    anyOrgRequiresPassphrase && !requiresPassphrase;
  const requiredLockoutMissing = anyOrgRequiresLockout && !requiresLockout;
  const requiredLockoutTooHigh =
    minRequiredLockoutMs &&
    (!requiresLockout || !lockoutMs || lockoutMs > minRequiredLockoutMs);

  const isValid =
    !requiredPassphraseMissing &&
    !requiredLockoutMissing &&
    !requiredLockoutTooHigh &&
    !(requiresPassphrase && !(passphrase || core.requiresPassphrase));

  const dispatchOnChange = () => {
    onChange({
      defaultDeviceName: defaultDeviceName || undefined,
      requiresPassphrase,
      passphrase,
      requiresLockout,
      lockoutMs,
      isValid,
    });
  };

  useEffect(dispatchOnChange, [
    defaultDeviceName,
    requiresPassphrase,
    passphrase,
    requiresLockout,
    lockoutMs,
    isValid,
  ]);

  const renderDeviceName = () => {
    if (fields.includes("defaultDeviceName")) {
      return (
        <div className="field">
          <label>Default Device Name</label>
          <input
            type="text"
            placeholder="Device name"
            value={defaultDeviceName || ""}
            required
            autoFocus
            disabled={props.disabled}
            onChange={(e) => {
              setDefaultDeviceName(e.target.value);
            }}
          />
        </div>
      );
    }
  };

  const renderRequiresPassphrase = () => {
    return [
      <div
        className={
          "field checkbox" +
          (requiresPassphrase ? " selected" : "") +
          (props.disabled ? " disabled" : "")
        }
        onClick={(e) => {
          if (props.disabled) {
            return;
          }

          const shouldRequire = !requiresPassphrase;
          setRequiresPassphrase(shouldRequire);
          if (!shouldRequire) {
            setPassphrase(undefined);
          }
        }}
      >
        <label>Set device passphrase</label>
        <input
          type="checkbox"
          disabled={props.disabled}
          checked={requiresPassphrase}
        ></input>
      </div>,

      requiredPassphraseMissing ? (
        <p className="error">
          {orgNamesRequiringPassphrase.length == 1
            ? `${orgNamesRequiringPassphrase[0]} requires`
            : `${orgNamesRequiringPassphrase} orgs you belong to require`}
          a passphrase to be set
          {orgNamesRequiringPassphrase.length == 1
            ? ""
            : ": " + orgNamesRequiringPassphrase.join(", ")}
          .
        </p>
      ) : (
        ""
      ),
    ];
  };

  const renderSetPassphrase = () => {
    if (requiresPassphrase) {
      return (
        <div className="field">
          <label>
            {core.requiresPassphrase ? "Update passphrase" : "Passphrase"}
          </label>
          <PassphraseInput
            confirm
            validateStrength
            disabled={props.disabled}
            focus={
              props.focus && !fields.includes("defaultDeviceName")
                ? true
                : undefined
            }
            reset={props.reset}
            strengthInputs={[
              ...allOrgNames,
              ...allUserNames,
              ...allEmails,
              ...allDeviceNames,
              ...(props.passphraseStrengthInputs ?? []),
              defaultDeviceName ?? "",
            ].filter(Boolean)}
            onChange={(valid, val) => {
              setPassphrase(val);
            }}
          />
        </div>
      );
    }
  };

  const renderPassphrase = () => {
    if (fields.includes("passphrase")) {
      return (
        <div>
          {renderRequiresPassphrase()}
          {renderSetPassphrase()}
        </div>
      );
    }
  };

  const renderRequiresLockout = () => {
    return [
      <div
        className={
          "field checkbox" +
          (requiresLockout ? " selected" : "") +
          (props.disabled ? " disabled" : "")
        }
        onClick={(e) => {
          if (props.disabled) {
            return;
          }
          const shouldRequire = !requiresLockout;
          setRequiresLockout(shouldRequire);
        }}
      >
        <label>Set device lockout</label>
        <input
          type="checkbox"
          disabled={props.disabled}
          checked={requiresLockout}
        ></input>
      </div>,

      requiredLockoutMissing ? (
        <p className="error">
          {orgNamesRequiringLockout.length == 1
            ? `${orgNamesRequiringLockout[0]} requires`
            : `${orgNamesRequiringLockout} orgs you belong to require`}
          a lockout to be set
          {orgNamesRequiringLockout.length == 1
            ? ""
            : ": " + orgNamesRequiringLockout.join(", ")}
          .
        </p>
      ) : (
        ""
      ),
    ];
  };

  const renderSetLockoutMinutes = () => {
    if (requiresLockout) {
      return [
        <div className="field">
          <label>Minutes before lockout</label>
          <input
            type="number"
            min="1"
            value={
              typeof lockoutMs == "number"
                ? Math.floor(lockoutMs / 1000 / 60)
                : 120
            }
            required={requiresLockout}
            disabled={props.disabled}
            onChange={(e) => {
              setLockoutMs(parseInt(e.target.value) * 60 * 1000);
            }}
          />
        </div>,

        minRequiredLockoutMs && requiredLockoutTooHigh ? (
          <p className="error">
            {orgNamesRequiringMinLockout.length == 1
              ? `${orgNamesRequiringMinLockout[0]} requires`
              : `${orgNamesRequiringMinLockout} orgs you belong to require`}
            a lockout of {Math.floor(minRequiredLockoutMs / 1000 / 60)} minutes
            or lower
            {orgNamesRequiringMinLockout.length == 1
              ? ""
              : ": " + orgNamesRequiringMinLockout.join(", ")}
            .
          </p>
        ) : (
          ""
        ),
      ];
    }
  };

  const renderLockout = () => {
    if (fields.includes("lockout") && requiresPassphrase) {
      return (
        <div>
          {renderRequiresLockout()}
          {renderSetLockoutMinutes()}
        </div>
      );
    }
  };

  return (
    <div>
      {renderDeviceName()}
      {renderPassphrase()}
      {renderLockout()}
    </div>
  );
};

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
  }) => void;
};

export const DeviceSettingsFields: Component<{}, Props> = (props) => {
  const { core, onChange } = props;
  const fields = props.fields ?? ["defaultDeviceName", "passphrase", "lockout"];

  const [defaultDeviceName, setDefaultDeviceName] = useState<string | null>(
    core.defaultDeviceName ?? null
  );

  const [requiresLockout, setRequiresLockout] = useState(
    typeof core.lockoutMs == "number"
  );
  const [lockoutMs, setLockoutMs] = useState<number>(
    core.lockoutMs ?? 120 * 1000 * 60
  );

  const [requiresPassphrase, setRequiresPassphrase] = useState(
    core.requiresPassphrase === true
  );

  const [passphrase, setPassphrase] = useState<string>();

  useEffect(() => {
    if (props.reset && passphrase) {
      setPassphrase(undefined);
    }
  }, [props.reset, passphrase]);

  const dispatchOnChange = () => {
    onChange({
      defaultDeviceName: defaultDeviceName || undefined,
      requiresPassphrase,
      passphrase,
      requiresLockout,
      lockoutMs,
    });
  };

  useEffect(dispatchOnChange, [
    defaultDeviceName,
    requiresPassphrase,
    passphrase,
    requiresLockout,
    lockoutMs,
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
    return (
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
      </div>
    );
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
              ...R.flatten(
                (
                  Object.values(core.orgUserAccounts) as Client.ClientUserAuth[]
                ).map(
                  R.props([
                    "orgName",
                    "firstName",
                    "lastName",
                    "email",
                    "deviceName",
                  ])
                )
              ),
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
    return (
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
      </div>
    );
  };

  const renderSetLockoutMinutes = () => {
    if (requiresLockout) {
      return (
        <div className="field">
          <label>Minutes before lockout</label>
          <input
            type="number"
            min="1"
            value={typeof lockoutMs == "number" ? lockoutMs / 1000 / 60 : 120}
            required={requiresLockout}
            disabled={props.disabled}
            onChange={(e) => {
              setLockoutMs(parseInt(e.target.value) * 60 * 1000);
            }}
          />
        </div>
      );
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

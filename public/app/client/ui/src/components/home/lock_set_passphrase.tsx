import * as R from "ramda";
import React, { useState } from "react";
import { PassphraseInput } from "@ui";
import { Component } from "@ui_types";
import { Client } from "@core/types";
import { HomeContainer } from "./home_container";
import * as styles from "@styles";
import { logAndAlertError } from "@ui_lib/errors";

export const LockSetPassphrase: Component = ({ core, history, dispatch }) => {
  const [passphrase, setPassphrase] = useState<string>();
  const [isLocking, setIsLocking] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (passphrase) {
      setIsLocking(true);

      let res = await dispatch({
        type: Client.ActionType.SET_DEVICE_PASSPHRASE,
        payload: { passphrase },
      });

      if (res.success) {
        dispatch({
          type: Client.ActionType.LOCK_DEVICE,
        }).then((res) => {
          if (!res.success) {
            logAndAlertError(
              "There was a problem locking the device.",
              res.resultAction
            );
          }
        });
      } else {
        logAndAlertError(
          "There was a problem setting the device passphrase.",
          res.resultAction
        );
      }
    }
  };

  if (core.locked) {
    return <HomeContainer />;
  }

  return (
    <HomeContainer>
      <form className={styles.LockSetPassphrase} onSubmit={onSubmit}>
        <div className="field">
          <label>Set A Device Passphrase</label>
          <PassphraseInput
            confirm
            validateStrength
            focus
            disabled={isLocking ? true : undefined}
            strengthInputs={
              isLocking
                ? []
                : ([
                    ...R.flatten(
                      (
                        Object.values(
                          core.orgUserAccounts
                        ) as Client.ClientUserAuth[]
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
                    core.defaultDeviceName,
                  ].filter(Boolean) as string[])
            }
            onChange={(valid, val) => setPassphrase(val)}
          />
        </div>

        <div>
          <div className="buttons">
            <input
              className="primary"
              disabled={isLocking || !passphrase}
              type="submit"
              value={isLocking ? "Locking Device..." : "Lock Device"}
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
      </form>
    </HomeContainer>
  );
};

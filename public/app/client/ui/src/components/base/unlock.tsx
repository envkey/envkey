import React, { useState } from "react";
import { Link } from "react-router-dom";
import { PassphraseInput } from "@ui";
import { ComponentProps } from "@ui_types";
import { Client } from "@core/types";
import { HomeContainer } from "../home/home_container";
import * as styles from "@styles";
import { SvgImage } from "@images";
import { logAndAlertError } from "@ui_lib/errors";

type Props = Pick<ComponentProps, "dispatch" | "history">;

export const Unlock: React.FC<Props> = ({ dispatch, history }) => {
  const [passphrase, setPassphrase] = useState<string>();
  const [isUnlocking, setIsLocking] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (passphrase) {
      setIsLocking(true);
      setError("");
      const res = await dispatch({
        type: Client.ActionType.UNLOCK_DEVICE,
        payload: { passphrase },
      });

      if (!res.success) {
        if (res.status == 403) {
          setError("Invalid passphrase.");
        } else {
          const msg = "There was a problem unlocking your device.";
          setError(msg);
          console.log(msg, res.resultAction);
        }
        setIsLocking(false);
        setPassphrase("");
      }
    }
  };

  const onHardReset = async (e: React.MouseEvent) => {
    e.preventDefault();

    const confirm = window.confirm(
      "A hard reset will clear any accounts that may have been stored on this device. Are you sure you want to proceed?"
    );

    if (confirm) {
      const res = await dispatch({
        type: Client.ActionType.INIT_DEVICE,
      });

      if (res.success) {
        history.push("/home");
      } else {
        logAndAlertError(
          "There was a problem resetting your device.",
          res.resultAction
        );
      }
    }
  };

  return (
    <HomeContainer>
      <form className={styles.Unlock} onSubmit={onSubmit}>
        <h3>
          <SvgImage type="lock" />
          EnvKey is <strong>locked</strong> on this device.
        </h3>

        <div className="field">
          <label>Device Passphrase</label>
          <PassphraseInput
            focus
            onChange={(valid, val) => setPassphrase(val)}
            disabled={isUnlocking ? true : undefined}
          />
        </div>
        <div className="buttons">
          <input
            className="primary"
            disabled={isUnlocking}
            type="submit"
            value={isUnlocking ? "Unlocking Device..." : "Unlock Device"}
          />
        </div>

        {error ? <p className="error">{error}</p> : ""}

        <div className="forgot-passphrase">
          <h4>Forgot your passphrase?</h4>
          <div className="actions">
            <Link to="/redeem-recovery-key">
              <SvgImage type="restore" />
              Recover Account
            </Link>

            <Link to="/" onClick={onHardReset}>
              <SvgImage type="reset" />
              Hard Reset Device
            </Link>
          </div>
        </div>
      </form>
    </HomeContainer>
  );
};

import React, { useState } from "react";
import { Link } from "react-router-dom";
import { PassphraseInput } from "@ui";
import { ComponentProps } from "@ui_types";
import { Client } from "@core/types";
import { HomeContainer } from "../home/home_container";
import * as styles from "@styles";
import { SvgImage } from "@images";

type Props = Pick<ComponentProps, "dispatch">;

export const Unlock: React.FC<Props> = ({ dispatch }) => {
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
          setError("There was a problem unlocking your device.");
        }
        setIsLocking(false);
        setPassphrase("");
      }
    }
  };

  return (
    <HomeContainer>
      <form className={styles.Unlock} onSubmit={onSubmit}>
        <h3>
          <SvgImage type="lock" />
          EnvKey is <strong>locked.</strong>
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
          <span>Forgot your passphrase?</span>
          <Link to="/redeem-recovery-key">
            <SvgImage type="restore" />
            Recover Account
          </Link>
        </div>
      </form>
    </HomeContainer>
  );
};

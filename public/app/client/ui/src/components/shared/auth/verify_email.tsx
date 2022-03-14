import React, { useState, useMemo, useRef, useLayoutEffect } from "react";
import { Component } from "@ui_types";
import { Api, Client, Auth } from "@core/types";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { wait } from "@core/lib/utils/wait";
import * as styles from "@styles";
import * as z from "zod";
import { logAndAlertError } from "@ui_lib/errors";

type Props = {
  authType: Extract<Auth.AuthType, "sign_in" | "sign_up">;
  tokenName?: string;
  initialEmail?: string;
  orgName?: string;
  communityAuth?: string;
  hostUrlOverride?: string;
  onValid: (params: { email: string; token: string }) => void;
  onBack?: () => any;
  signUpStartText?: React.ReactNode;
};

const emailValidator = z.string().email();

export const VerifyEmail: Component<{}, Props> = ({
  core,
  dispatch,
  onValid,
  onBack,
  initialEmail,
  orgName,
  tokenName,
  authType,
  history,
  communityAuth,
  hostUrlOverride,
  signUpStartText,
}) => {
  const [email, setEmail] = useState<string | null>(initialEmail ?? null);
  const [token, setToken] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [awaitingMinDelay, setAwaitingMinDelay] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState(false);

  const emailCodeRef = useRef<HTMLInputElement>(null);

  const emailValid = useMemo(
    () => !email || emailValidator.safeParse(email).success,
    [email]
  );

  useLayoutEffect(() => {
    if (
      isVerifying &&
      !(
        core.isVerifyingEmail ||
        core.isVerifyingEmailCode ||
        (authType == "sign_in" && token) ||
        awaitingMinDelay
      )
    ) {
      setIsVerifying(false);
    }
  }, [core.isVerifyingEmail, core.isVerifyingEmailCode, awaitingMinDelay]);

  useLayoutEffect(() => {
    if (core.verifyingEmail && !verifiedEmail && !awaitingMinDelay) {
      setVerifiedEmail(true);
    }
  }, [core.verifyingEmail, awaitingMinDelay]);

  useLayoutEffect(() => {
    if (verifiedEmail && emailCodeRef.current && !isVerifying) {
      emailCodeRef.current.focus();
    }
  }, [verifiedEmail, Boolean(emailCodeRef.current), isVerifying]);

  const verifyingCode = Boolean(
    verifiedEmail && !core.verifyEmailError && (!isVerifying || token)
  );

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    let minDelayPromise: Promise<any> | undefined;

    if (email || (verifiedEmail && token)) {
      setAwaitingMinDelay(true);
      setIsVerifying(true);

      minDelayPromise = wait(MIN_ACTION_DELAY_MS).then(() =>
        setAwaitingMinDelay(false)
      );
    }

    if (verifiedEmail && email && token) {
      dispatch(
        {
          type: Api.ActionType.CHECK_EMAIL_TOKEN_VALID,
          payload: { email, token },
        },
        hostUrlOverride
      ).then(async (res) => {
        if (res.success) {
          await minDelayPromise!;
          onValid({ email, token });
          dispatch({
            type: Client.ActionType.RESET_EMAIL_VERIFICATION,
          });
        } else {
          logAndAlertError(
            "There was a problem verifying the email token.",
            (res.resultAction as any)?.payload
          );
        }
      });
    } else if (email) {
      dispatch(
        {
          type: Api.ActionType.CREATE_EMAIL_VERIFICATION,
          payload: { authType, email, communityAuth },
        },
        hostUrlOverride
      ).then((res) => {
        if (!res.success) {
          logAndAlertError(
            `There was a problem sending the email verification.`,
            (res.resultAction as any)?.payload
          );
        }
      });
    }
  };

  const renderButtons = () => {
    let submitLbl: string;
    if (verifyingCode) {
      submitLbl = isVerifying ? "Verifying Token..." : "Verify Token";
    } else if (initialEmail) {
      submitLbl = isVerifying ? "Sending Token..." : "Send Email Token";
    } else {
      submitLbl = isVerifying ? "Sending Token..." : "Next";
    }

    return (
      <div>
        <div className="buttons">
          <input
            className="primary"
            disabled={
              isVerifying || !email || !emailValid || (verifyingCode && !token)
            }
            type="submit"
            value={submitLbl}
          />
        </div>
        <div className="back-link">
          <a
            onClick={(e) => {
              e.preventDefault();
              if (core.verifyingEmail || verifiedEmail) {
                dispatch({
                  type: Client.ActionType.RESET_EMAIL_VERIFICATION,
                });
                setToken(null);
                setEmail(initialEmail ?? null);
                setVerifiedEmail(false);
              } else if (onBack) {
                onBack();
              } else {
                if (history.length > 1) {
                  history.goBack();
                } else {
                  history.replace("/home");
                }
              }
            }}
          >
            ← Back
          </a>
        </div>
      </div>
    );
  };

  const renderVerifyError = () => {
    let s = "";

    if (!isVerifying && core.verifyEmailError) {
      s = `There was a problem sending your ${
        tokenName ?? "Email"
      } Token. Please try again.`;
      console.log("Problem sending Email Token:", core.verifyEmailError);
    } else if (!isVerifying && core.verifyEmailCodeError) {
      s = `There was a problem verifying your ${
        tokenName ?? "Email"
      } Token. Please try again.`;
      console.log("Problem verifying Email Token:", core.verifyEmailCodeError);
    }

    return s ? <p className="error">{s}</p> : s;
  };

  const renderVerifyEmailInput = () => {
    return (
      <div>
        {authType == "sign_up" ? (
          <h3>
            {signUpStartText ?? [
              "Let's start with your ",
              <strong>email.</strong>,
            ]}
          </h3>
        ) : (
          <h3>
            <strong>Sign In</strong> to {orgName}
          </h3>
        )}

        <div className="field">
          {authType == "sign_in" ? (
            <label className="initial-email">
              Your email <span>{initialEmail}</span>
            </label>
          ) : (
            ""
          )}
          {initialEmail ? (
            ""
          ) : (
            <input
              type="email"
              value={email || ""}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter a valid email address..."
              disabled={isVerifying}
              required
              autoFocus
            />
          )}
        </div>
        {(email && email.length < 5) || emailValid ? (
          ""
        ) : (
          <p className="error">Not a valid email adress</p>
        )}
      </div>
    );
  };

  const renderVerifyCodeInput = () => (
    <div>
      <h3>
        We just sent you an <strong>Email Token.</strong> Paste it in:
      </h3>
      <div className="field">
        <input
          type="password"
          value={token || ""}
          onChange={(e) => setToken(e.target.value)}
          disabled={isVerifying}
          placeholder="Paste in your Email Token..."
          required
          autoFocus
        />
      </div>
    </div>
  );

  return (
    <form className={styles.VerifyEmail} onSubmit={onSubmit}>
      {verifyingCode ? renderVerifyCodeInput() : renderVerifyEmailInput()}
      {renderVerifyError()}
      {renderButtons()}
    </form>
  );
};

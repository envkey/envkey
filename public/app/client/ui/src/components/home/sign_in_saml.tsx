import React, { useState, useEffect } from "react";
import { Component } from "@ui_types";
import { Client } from "@core/types";
import { HomeContainer } from "./home_container";
import * as styles from "@styles";
import { wait } from "@core/lib/utils/wait";
import { Link } from "react-router-dom";
import { CopyableDisplay } from "../settings/copyable_display";

let _runningSSOLoop = false;
let dispatchedCreateSession = false;

export const SignInSaml: Component<{ accountId: string }> = (props) => {
  const { core, dispatch, history, setUiState, routeParams } = props;
  const account = core.orgUserAccounts[routeParams.accountId];
  const [errorMessage, setErrorMessage] = useState<string | undefined>("");
  const [runningSSOLoop, _setRunningSSOLoop] = useState(false);
  const setRunningSSOLoop = (val: boolean) => {
    _runningSSOLoop = val;
    _setRunningSSOLoop(val);
  };

  const authenticatingSSO = core.startingExternalAuthSession || runningSSOLoop;

  useEffect(() => {
    _runningSSOLoop = false;
    dispatchedCreateSession = false;

    dispatch({ type: Client.ActionType.RESET_EXTERNAL_AUTH });

    return () => {
      _runningSSOLoop = false;
    };
  }, []);

  // Redirection from invalid state, or from successful completion of login.
  useEffect(() => {
    const needsEmailAuth = account && !account.externalAuthProviderId;
    const isLoggedIn =
      account?.token &&
      account.orgId &&
      props.ui.loadedAccountId === account.userId;

    if (!account) {
      history.push("/home");
      return;
    }
    if (needsEmailAuth) {
      console.log(
        "Account is not externally authorized, redirecting to email sign-in"
      );
      // if the account was deleted, there may still be enough UI state around to keep them stuck on the sign-in screen
      // in an infinite loop when hitting the back butt
      // so send them back
      history.push(`/sign-in/${routeParams.accountId}`);
      return;
    }
    if (isLoggedIn) {
      console.log("Logged in, redirecting for org", account.orgId);
      history.push("/org/" + account.orgId);
      return;
    }
  }, [
    account?.externalAuthProviderId,
    core.isCreatingSession,
    props.ui.loadedAccountId,
  ]);

  // Capture any external auth errors
  useEffect(() => {
    const e =
      core.startingExternalAuthSessionError ||
      core.externalAuthSessionCreationError ||
      core.authorizingExternallyErrorMessage;
    if (!e) {
      return;
    }
    setRunningSSOLoop(false);

    setErrorMessage(
      typeof e === "string" ? e : "errorReason" in e ? e.errorReason : e.type
    );
  }, [
    core.startingExternalAuthSessionError,
    core.externalAuthSessionCreationError,
    core.authorizingExternallyErrorMessage,
  ]);

  // Creation of session from successful external auth.
  useEffect(() => {
    if (
      !account ||
      !core.completedExternalAuth ||
      !runningSSOLoop ||
      core.creatingExternalAuthSession ||
      dispatchedCreateSession
    ) {
      return;
    }

    dispatchedCreateSession = true;
    dispatch(
      {
        type: Client.ActionType.CREATE_SESSION,
        payload: {
          accountId: account.userId,
          externalAuthSessionId:
            core.completedExternalAuth.externalAuthSessionId,
        },
      },
      account.hostUrl
    )
      .then((loginRes) => {
        if (!loginRes.success) {
          console.log(loginRes);
          const e = (core.createSessionError || loginRes.resultAction) as any;
          setErrorMessage(e.errorReason || e.type);
          setRunningSSOLoop(false);
          return;
        }
        console.log(
          "Created external auth session from",
          core.completedExternalAuth
        );
      })
      .catch((err) => {
        setRunningSSOLoop(false);
        setErrorMessage(err.message);
      });
  }, [props.ui.loadedAccountId, core.completedExternalAuth]);

  useEffect(() => {
    (async () => {
      if (!core.startingExternalAuthSession) {
        return;
      }
      if (_runningSSOLoop) {
        console.log("runningSSOLoop already started");
        return;
      }
      console.log("starting runningSSOLoop");
      setRunningSSOLoop(true);
      await props.refreshCoreState();
      while (_runningSSOLoop) {
        console.log("runningSSOLoop waiting for saml auth");
        await wait(500);
        await props.refreshCoreState();
      }
    })();
  }, [core.startingExternalAuthSession]);

  const authorizeExernally = async () => {
    setUiState({
      accountId: account!.userId,
      loadedAccountId: undefined,
    });

    await dispatch({ type: Client.ActionType.RESET_EXTERNAL_AUTH });

    const createSessRes = await dispatch({
      type: Client.ActionType.CREATE_EXTERNAL_AUTH_SESSION_FOR_LOGIN,
      payload: {
        waitBeforeOpenMillis: 0,
        authMethod: "saml",
        provider: "saml",
        externalAuthProviderId: account!.externalAuthProviderId!,
        orgId: account!.orgId,
        userId: account!.userId,
      },
    });
    if (!createSessRes.success) {
      console.log(createSessRes.resultAction);
      setErrorMessage((createSessRes.resultAction as any).errorReason);
      return;
    }
  };

  if (!account) {
    return <HomeContainer />;
  }

  return (
    <HomeContainer>
      <div>
        <h3>
          <strong>Sign In</strong> to {account.orgName}
        </h3>

        <form
          className={styles.SignIn}
          onSubmit={(e) => {
            e.preventDefault();
            authorizeExernally();
          }}
        >
          <div className="field no-margin">
            <label className="initial-email">
              <span>{account.email}</span>
            </label>
          </div>

          <div className="field">
            <input
              className="primary"
              type="submit"
              disabled={authenticatingSSO}
              value={
                authenticatingSSO
                  ? "Authenticating With SSO..."
                  : "Sign in with SSO"
              }
            />
          </div>
          {errorMessage ? <p className="error">{errorMessage}</p> : ""}

          {authenticatingSSO && core.pendingExternalAuthSession
            ? [
                <p className="important">
                  Your system's default browser should now pop up so you can
                  authenticate with your org's SSO provider. You can also paste
                  the URL into a browser manually:
                </p>,
                <CopyableDisplay
                  {...props}
                  label="SSO Authentication Url"
                  value={core.pendingExternalAuthSession.authUrl}
                />,
              ]
            : ""}

          <div className="buttons">
            <div className="back-link">
              <Link
                onClick={() => {
                  setRunningSSOLoop(false);
                  dispatch({ type: Client.ActionType.RESET_EXTERNAL_AUTH });
                }}
                to="/select-account"
              >
                ← Back
              </Link>
            </div>
          </div>
        </form>
      </div>
    </HomeContainer>
  );
};

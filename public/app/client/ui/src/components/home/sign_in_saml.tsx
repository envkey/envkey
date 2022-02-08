import React, { useState, useEffect } from "react";
import { Component } from "@ui_types";
import { Client } from "@core/types";
import { HomeContainer } from "./home_container";
import * as styles from "@styles";
import { wait } from "@core/lib/utils/wait";
import { SmallLoader } from "@images";
import { Link } from "react-router-dom";

let runningLoop = false;

// immediately start the sign-in process upon visiting this page

export const SignInSaml: Component<{ accountId: string }> = (props) => {
  const { core, dispatch, history, setUiState, routeParams } = props;
  const account = core.orgUserAccounts[routeParams.accountId];

  const [errorMessage, setErrorMessage] = useState<string | undefined>("");

  // Redirection from invalid state, or from successful completion of login.
  useEffect(() => {
    const needsEmailAuth = account && !account.externalAuthProviderId;
    const isLoggedIn =
      account?.token &&
      account.orgId &&
      props.ui.loadedAccountId === account.userId;

    if (!account) {
      runningLoop = false;
      history.push("/home");
      return;
    }
    if (needsEmailAuth) {
      runningLoop = false;
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
      runningLoop = false;
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
    runningLoop = false;

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
      !runningLoop ||
      core.creatingExternalAuthSession
    ) {
      return;
    }
    runningLoop = false;

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
          return;
        }
        console.log(
          "Created external auth session from",
          core.completedExternalAuth
        );
      })
      .catch((err) => {
        setErrorMessage(err.message);
      });
  }, [props.ui.loadedAccountId, core.completedExternalAuth]);

  useEffect(() => {
    (async () => {
      if (!core.startingExternalAuthSession) {
        return;
      }
      if (runningLoop) {
        console.log("runningLoop already started");
        return;
      }
      console.log("starting runningLoop");
      runningLoop = true;
      await props.refreshCoreState();
      while (runningLoop) {
        console.log("runningLoop waiting for saml auth");
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

  if (errorMessage) {
    return (
      <HomeContainer>
        <h3>There was a problem signing in with SAML.</h3>
        <pre className="error">{errorMessage}</pre>
        <form className={styles.SignIn}>
          <div className="buttons">
            <div className="back-link">
              <a
                onClick={(e) => {
                  e.preventDefault();
                  setErrorMessage("");
                  dispatch({ type: Client.ActionType.RESET_EXTERNAL_AUTH });
                }}
              >
                ← Back
              </a>
            </div>
          </div>
        </form>
      </HomeContainer>
    );
  }

  if (core.startingExternalAuthSession) {
    return (
      <HomeContainer>
        <h3>
          Redirecting to login...
          <br />
          <SmallLoader />
        </h3>
        <form className={styles.SignIn}>
          <div className="buttons">
            <div className="home-link">
              <Link to="/select-account">Cancel</Link>
            </div>
          </div>
        </form>
      </HomeContainer>
    );
  }

  if (core.isAuthorizingExternallyForSessionId) {
    return (
      <HomeContainer>
        <h3>
          Waiting for SAML authentication...
          <br />
          <SmallLoader />
        </h3>
        <form className={styles.SignIn}>
          <div className="buttons">
            <div className="back-link">
              <Link to="/select-account">Cancel</Link>
            </div>
          </div>
        </form>
      </HomeContainer>
    );
  }

  if (core.completedExternalAuth) {
    return (
      <HomeContainer>
        <h3>
          Creating session from successful external auth...
          <br />
          <SmallLoader />
        </h3>
        <form className={styles.SignIn}>
          <div className="buttons">
            <div className="back-link">
              <Link to="/select-account">Cancel</Link>
            </div>
          </div>
        </form>
      </HomeContainer>
    );
  }

  return (
    <HomeContainer>
      <div>
        <form
          className={styles.SignIn}
          onSubmit={(e) => {
            e.preventDefault();
            authorizeExernally();
          }}
        >
          <div className="field saml-user-info">
            <label>{account.orgName}</label>
            <p>
              <strong>{account.email}</strong>
            </p>
            <input
              className="primary"
              type="submit"
              value="Sign in with SAML"
            />
          </div>
          <div className="buttons">
            <div className="back-link">
              <Link to="/select-account">← Back</Link>
            </div>
          </div>
        </form>
      </div>
    </HomeContainer>
  );
};

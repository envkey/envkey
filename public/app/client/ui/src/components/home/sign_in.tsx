import React, { useState, useEffect } from "react";
import { VerifyEmail } from "@ui";
import { Component } from "@ui_types";
import { Client, Api } from "@core/types";
import { HomeContainer } from "./home_container";
import * as styles from "@styles";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { wait } from "@core/lib/utils/wait";

type CreateSessionRes = Client.DispatchResult<
  Client.Action.SuccessAction<
    Client.Action.ClientActions["CreateSession"],
    Api.Net.SessionResult
  >
>;

export const SignIn: Component<{ accountId: string }> = (props) => {
  const { core, dispatch, history, setUiState, routeParams } = props;
  const account = core.orgUserAccounts[routeParams.accountId];

  const [awaitingMinDelay, setAwaitingMinDelay] = useState(false);

  useEffect(() => {
    if (account?.token) {
      setUiState({
        accountId: account.userId,
        loadedAccountId: undefined,
      });
    }
  }, [account?.token]);

  useEffect(() => {
    if (!account) {
      history.replace("/home");
    } else if (
      account.token &&
      !awaitingMinDelay &&
      props.ui.loadedAccountId == account.userId
    ) {
      history.replace("/org/" + account.orgId);
    }
  }, [
    account?.token,
    core.isCreatingSession,
    props.ui.loadedAccountId,
    awaitingMinDelay,
  ]);

  if (!account) {
    return <HomeContainer />;
  }

  const dispatchCreateSession = (token: string) => {
    setAwaitingMinDelay(true);
    wait(MIN_ACTION_DELAY_MS).then(() => setAwaitingMinDelay(false));

    const hostUrl = account.hostUrl;

    dispatch(
      {
        type: Client.ActionType.CREATE_SESSION,
        payload: {
          accountId: routeParams.accountId,
          emailVerificationToken: token,
        },
      },
      hostUrl
    ) as Promise<CreateSessionRes>;
  };

  return (
    <HomeContainer>
      <div className={styles.SignIn}>
        <VerifyEmail
          {...{
            ...props,
            hostUrlOverride: account.hostUrl,
            authType: "sign_in",
            initialEmail: account.email,
            orgName: account.orgName,
            onValid: ({ email, token }) => {
              dispatchCreateSession(token);
            },
          }}
        />
      </div>
    </HomeContainer>
  );
};

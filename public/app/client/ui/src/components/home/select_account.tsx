import * as R from "ramda";
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Component } from "@ui_types";
import { Client } from "@core/types";
import { confirmForgetDevice } from "@ui_lib/auth";
import { HomeContainer } from "./home_container";
import { SvgImage, SmallLoader } from "@images";
import * as styles from "@styles";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { wait } from "@core/lib/utils/wait";
import { logAndAlertError } from "@ui_lib/errors";

export const SelectAccount: Component = (props) => {
  const { core, dispatch, setUiState } = props;

  const accounts = R.sortBy(
    R.prop("orgName"),
    Object.values(core.orgUserAccounts) as Client.ClientUserAuth[]
  );
  const numAccounts = accounts.length;

  const [selectedAccountId, setSelectedAccountId] = useState<string>();
  const [awaitingMinSelectDelay, setAwaitingMinSelectDelay] = useState(false);
  const [destroyingDeployment, setDestroyingDeployment] = useState<
    Client.PendingSelfHostedDeployment | undefined
  >();

  useEffect(() => {
    if (
      selectedAccountId &&
      selectedAccountId == props.ui.loadedAccountId &&
      !awaitingMinSelectDelay
    ) {
      const { orgId } = core.orgUserAccounts[selectedAccountId]!;
      props.history.push(`/org/${orgId}`);
    }
  }, [props.ui.loadedAccountId, awaitingMinSelectDelay]);

  const renderPending = (
    pendingDeployment: Client.PendingSelfHostedDeployment,
    i: number
  ) => {
    return (
      <div key={`deployment-${i}`} className="account">
        <span className="remove">
          <a
            onClick={async (e) => {
              e.preventDefault();
              alert(
                "To stop and bring down all resources for a pending installation, use the EnvKey CLI command: `envkey host destroy`"
              );
            }}
            className="exit"
          >
            <SvgImage type="x-circle" /> Remove
          </a>
        </span>

        <span
          className="select"
          onClick={() =>
            props.history.push(
              `/init-self-hosted/${pendingDeployment.hostUrl.split(".")[0]!}`
            )
          }
        >
          <span className="labels">
            <label className="org-name">{pendingDeployment.orgName}</label>
            <label className="provider">
              {pendingDeployment.hostUrl} ({pendingDeployment.deploymentTag})
            </label>
          </span>
          {destroyingDeployment?.hostUrl === pendingDeployment.hostUrl ? (
            <SmallLoader />
          ) : (
            <SvgImage type="right-caret" />
          )}
        </span>
      </div>
    );
  };
  const renderAccount = (account: Client.ClientUserAuth, i?: number) => {
    const { token, userId, orgId, email, provider, orgName } = account;
    return (
      <div
        key={i ?? 0}
        className={"account" + (selectedAccountId == userId ? " selected" : "")}
      >
        <span className="remove">
          {token ? (
            <a
              href="#"
              className="sign-out"
              onClick={(e) => {
                e.preventDefault();
                dispatch({
                  type: Client.ActionType.SIGN_OUT,
                  payload: { accountId: account.userId },
                }).then((res) => {
                  if (!res.success) {
                    logAndAlertError(
                      `There was a problem signing out.`,
                      res.resultAction
                    );
                  }
                });
              }}
            >
              <SvgImage type="exit" />
              Sign Out
            </a>
          ) : (
            <a
              href="#"
              className="forget"
              onClick={(e) => {
                e.preventDefault();
                if (confirmForgetDevice()) {
                  dispatch({
                    type: Client.ActionType.FORGET_DEVICE,
                    payload: { accountId: userId },
                  }).then((res) => {
                    if (!res.success) {
                      logAndAlertError(
                        `There was a problem removing the account.`,
                        res.resultAction
                      );
                    }
                  });
                }
              }}
            >
              <SvgImage type="x-circle" />
              Remove
            </a>
          )}
        </span>

        <span
          className="select"
          onClick={() => {
            if (
              props.ui.loadedAccountId == userId &&
              props.core.orgUserAccounts[props.ui.loadedAccountId]?.token
            ) {
              props.history.push(`/org/${orgId}`);
            } else if (token) {
              setUiState({
                accountId: userId,
                loadedAccountId: undefined,
              });
              setSelectedAccountId(userId);
              setAwaitingMinSelectDelay(true);
              wait(MIN_ACTION_DELAY_MS).then(() =>
                setAwaitingMinSelectDelay(false)
              );
            } else {
              props.history.push(
                provider === "saml"
                  ? `/sign-in-saml/${userId}`
                  : `/sign-in/${userId}`
              );
            }
          }}
        >
          <span className="labels">
            <label className="org-name">{orgName}</label>
            <label className="provider">
              {(provider == "email" ? "" : provider + " - ") + email}
            </label>
          </span>

          {selectedAccountId == userId ? (
            <SmallLoader />
          ) : (
            <SvgImage type="right-caret" />
          )}
        </span>
      </div>
    );
  };

  return (
    <HomeContainer>
      <div
        className={
          styles.SelectAccount + (selectedAccountId ? " account-selected" : "")
        }
      >
        {accounts.length > 0 ? (
          <h3>
            You have{" "}
            <strong>
              {numAccounts} account
              {numAccounts > 1 ? "s" : ""}
            </strong>{" "}
            on this device.
          </h3>
        ) : (
          <h3>
            There are <strong>no accounts</strong> on this device.
          </h3>
        )}
        <div>{accounts.map(renderAccount)}</div>

        <div>
          {core.pendingSelfHostedDeployments.length > 0 ? (
            <div className="pending-header">
              <h3>
                You have{" "}
                <strong>
                  {core.pendingSelfHostedDeployments.length} pending
                </strong>{" "}
                deployment
                {core.pendingSelfHostedDeployments.length > 1 ? "s" : ""}.
              </h3>
            </div>
          ) : null}
          {core.pendingSelfHostedDeployments.length > 0
            ? core.pendingSelfHostedDeployments.map(renderPending)
            : null}
        </div>

        <div className="home-link">
          <Link to="/home">← Back To Home</Link>
        </div>
      </div>
    </HomeContainer>
  );
};

import React, { useState, useEffect, useMemo } from "react";
import { Component } from "@ui_types";
import { Client } from "@core/types";
import { HomeContainer } from "../home_container";
import * as styles from "@styles";
import { SvgImage } from "@images";
import { ExternalLink } from "../../shared";
import { twitterShortTs } from "@core/lib/utils/date";
import { style } from "typestyle";

export const InitSelfHosted: Component<{ subdomain: string }> = (props) => {
  const { core, dispatch, refreshCoreState, history, routeParams } = props;
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [initToken, setInitToken] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  const { pendingDeployment, account } = useMemo(
    () => ({
      pendingDeployment: core.pendingSelfHostedDeployments.find(
        (d) => d.hostUrl.split(".")[0]! == routeParams.subdomain
      ),
      account: Object.values(core.orgUserAccounts).find(
        (acct) => acct && acct.hostUrl.split(".")[0]! == routeParams.subdomain
      ),
    }),
    [props.core, routeParams.subdomain]
  );

  useEffect(() => {
    if (!pendingDeployment && !account) {
      history.replace("/select-account");
    }
  }, [pendingDeployment, account]);

  useEffect(() => {
    if (
      account &&
      props.ui.loadedAccountId == account.userId &&
      core.graphUpdatedAt
    ) {
      if (core.graph[account.userId]) {
        history.push(`/org/${account.orgId}`);
      } else {
        refreshCoreState();
      }
    } else if (account && props.ui.loadedAccountId != account.userId) {
      props.setUiState({
        accountId: account.userId,
        loadedAccountId: account.userId,
      });
    }
  }, [account, core.graphUpdatedAt, props.ui.loadedAccountId]);

  if (!pendingDeployment) {
    return <HomeContainer />;
  }

  const dispatchInitToken = async () => {
    setErrorMessage("");
    if (!initToken) {
      return;
    }
    setIsVerifying(true);

    try {
      const loginRes = await dispatch({
        type: Client.ActionType.SIGN_IN_PENDING_SELF_HOSTED,
        payload: {
          initToken,
          index: core.pendingSelfHostedDeployments.findIndex(
            (d) => d.hostUrl.split(".")[0]! === routeParams.subdomain
          )!,
        },
      });

      if (!loginRes.success) {
        console.error(loginRes);
        setErrorMessage(
          (loginRes as any).errorReason ||
            (loginRes.resultAction as any)?.errorReason ||
            "Init token was not confirmed."
        );
        setIsVerifying(false);
        setInitToken("");
      }
    } catch (err) {
      console.log(err);
      setIsVerifying(false);
      setInitToken("");
      setErrorMessage(err.message);
    }
  };

  return (
    <HomeContainer>
      <div className={styles.SignIn}>
        <h3>
          Pending <strong>Self-Hosted</strong> Deployment
        </h3>

        <p
          style={{
            textAlign: "center",
          }}
        >
          Your installation has <strong>started.</strong>
        </p>

        <table
          className={style({
            width: "100%",
            padding: 20,
            background: "rgba(0,0,0,0.2)",
            $nest: {
              "tr:not(:last-of-type)": {
                borderBottom: "1px solid rgba(0,0,0,0.1)",
              },
            },
          })}
        >
          <tbody>
            <tr>
              <th>Started</th>
              <td>{twitterShortTs(pendingDeployment.addedAt, props.ui.now)}</td>
            </tr>
            <tr>
              <th>Org</th>
              <td>{pendingDeployment.orgName}</td>
            </tr>
            <tr>
              <th>Host</th>
              <td>{pendingDeployment.hostUrl}</td>
            </tr>
            <tr>
              <th>
                {pendingDeployment.failoverRegion ? "Primary " : ""}Region
              </th>
              <td>{pendingDeployment.primaryRegion}</td>
            </tr>
            {pendingDeployment.failoverRegion ? (
              <tr>
                <th>Failover Region</th>
                <td>{pendingDeployment.failoverRegion}</td>
              </tr>
            ) : (
              ""
            )}
            <tr>
              <th>Tag</th>
              <td>{pendingDeployment.deploymentTag}</td>
            </tr>
            <tr>
              <th>Your Email</th>
              <td>{pendingDeployment.email}</td>
            </tr>
            <tr>
              <th>Install Logs</th>
              <td>
                <span>
                  {
                    <ExternalLink
                      {...props}
                      to={pendingDeployment.codebuildLink}
                    >
                      AWS Install Logs →
                    </ExternalLink>
                  }
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <form
          className={styles.Register}
          onSubmit={(e) => {
            e.preventDefault();
            dispatchInitToken();
          }}
        >
          <p>
            When it finishes, you'll receive an email containing an{" "}
            <em>Init Token.</em> Enter it below to sign in, then you're done!
          </p>

          {errorMessage ? (
            <div
              className="error"
              style={{
                marginTop: "0",
                marginBottom: "30px",
                padding: "20px",
              }}
            >
              <a
                style={{ cursor: "pointer", float: "right", opacity: 0.8 }}
                onClick={async (e) => {
                  e.preventDefault();
                  setErrorMessage("");
                }}
              >
                <SvgImage type="x-circle" height={21} width={21} />
              </a>
              <p>
                <strong>{errorMessage}</strong>
              </p>
              <p style={{ marginBottom: "0" }}>
                Please ensure the installation has completed successfully and
                try again.
                <br />
                {pendingDeployment.internalMode
                  ? [
                      "Since you're using Behind-Your-Firewall Mode, make sure you've connected correctly through PrivateLink with a VPC endpoint, and that you have VPN or DirectConnect access to an EnvKey-enabled network.",
                    ]
                  : [
                      "You might also need to wait for DNS records to finish propagating on ",
                      <strong>{pendingDeployment.domain}</strong>,
                      ".",
                    ]}
              </p>
            </div>
          ) : null}

          <div className="field">
            <label>Init Token</label>
            <input
              type="password"
              required
              autoFocus={true}
              value={initToken}
              disabled={isVerifying}
              placeholder="Paste in your Init Token..."
              onChange={(e) => setInitToken(e.target.value)}
            />
          </div>
          <div className="field">
            <input
              className="primary"
              disabled={isVerifying}
              type="submit"
              value={isVerifying ? "Signing In..." : "Sign In"}
            />
          </div>

          <div className="field">
            <span>
              Installations usually finish in 30-45 minutes, but can sometimes
              take longer. If you've been waiting longer than 90 minutes, please
              contact <strong>support@envkey.com</strong> for help.
            </span>
          </div>

          <div className="back-link">
            <a
              onClick={(e) => {
                e.preventDefault();
                history.push("/select-account");
              }}
            >
              ← Back
            </a>
          </div>
        </form>
      </div>
    </HomeContainer>
  );
};

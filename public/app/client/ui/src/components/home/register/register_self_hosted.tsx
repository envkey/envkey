import React, { useState, useEffect } from "react";
import { Component, ReactSelectOption } from "@ui_types";
import { Client } from "@core/types";
import { getDefaultOrgSettings } from "@core/lib/client/defaults";
import { HomeContainer } from "../home_container";
import * as styles from "@styles";
import {
  Region,
  regions,
  regionLabels,
  defaultFailoverRegions,
} from "../../../../../../api/infra/src/stack-constants";
import { SmallLoader, SvgImage } from "@images";
import { wait } from "@core/lib/utils/wait";
import { ExternalLink, ReactSelect } from "../../shared";
import * as R from "ramda";

const DEFAULT_REGION: Region = "us-east-1";

let refreshingState: boolean = false;

export const RegisterSelfHosted: Component = (props) => {
  const { dispatch } = props;

  const [accountReady, setAccountReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  const [profile, setProfile] = useState("envkey-host");
  const [primaryRegion, setPrimaryRegion] = useState<Region>(DEFAULT_REGION);
  const [failoverRegion, setFailoverRegion] = useState<Region | undefined>(
    defaultFailoverRegions[DEFAULT_REGION]
  );
  const [customDomain, setCustomDomain] = useState(false);
  const [domain, setDomain] = useState("");
  const [verifiedSenderEmail, setVerifiedSenderEmail] = useState("");
  const [infraAlertsEmail, setInfraAlertsEmail] = useState("");

  const [internalMode, setInternalMode] = useState(false);
  const [authorizedAccounts, setAuthorizedAccounts] = useState<string[]>([]);
  const [authorizedAccountsInputVal, setAuthorizedAccountsInputVal] =
    useState("");

  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [deviceName, setDeviceName] = useState(
    props.core.defaultDeviceName ?? ""
  );

  const [isRegistering, setIsRegistering] = useState<Boolean>(false);

  const pendingDeployment: Client.PendingSelfHostedDeployment | undefined =
    isRegistering
      ? props.core.pendingSelfHostedDeployments.find(
          (acct) =>
            acct.email == email &&
            acct.domain == domain &&
            acct.orgName == orgName
        )
      : undefined;

  useEffect(() => {
    if (internalMode) {
      setFailoverRegion(undefined);
    } else {
      setFailoverRegion(defaultFailoverRegions[primaryRegion]);
    }
  }, [internalMode]);

  useEffect(() => {
    setFailoverRegion(defaultFailoverRegions[primaryRegion]);
  }, [primaryRegion]);

  useEffect(() => {
    (async () => {
      if (props.core.isDeployingSelfHosted) {
        if (!refreshingState) {
          refreshingState = true;
          await props.refreshCoreState();
          while (refreshingState) {
            await wait(1000);
            await props.refreshCoreState();
          }
        }
      } else {
        refreshingState = false;
      }

      if (props.core.deploySelfHostedError) {
        setIsRegistering(false);
        refreshingState = false;
        const e = props.core.deploySelfHostedError as any;
        setErrorMessage(e.errorReason || e.type);
      }
    })();
  }, [props.core.isDeployingSelfHosted, props.core.deploySelfHostedError]);

  useEffect(() => {
    if (pendingDeployment) {
      props.history.push(
        `/init-self-hosted/${pendingDeployment.hostUrl.split(".")[0]!}`
      );
    }
  }, [pendingDeployment]);

  if (pendingDeployment) {
    return <HomeContainer></HomeContainer>;
  }

  const reset = () => {
    setAccountReady(false);
    setErrorMessage(undefined);
    setOrgName("");
    setEmail("");
    setFirstName("");
    setLastName("");
  };

  const backStep = () => {
    if (accountReady) {
      reset();
    } else {
      props.history.replace(`/create-org`);
    }
  };

  const dispatchRegistration = async () => {
    if (!isValid) {
      return;
    }

    setErrorMessage(undefined);
    setIsRegistering(true);

    // this action will validate all params before starting the deploy, allow the user to fix any issues and trying again
    return dispatch({
      type: Client.ActionType.REGISTER,
      payload: {
        hostType: "self-hosted",
        org: {
          name: orgName,
          settings: getDefaultOrgSettings(),
        },
        user: {
          email,
          firstName,
          lastName,
        },
        device: { name: deviceName },
        provider: "email",
        profile,
        primaryRegion,
        failoverRegion,
        customDomain: internalMode ? false : customDomain,
        domain,
        verifiedSenderEmail,
        infraAlertsEmail,
        notifySmsWhenDone: "",
        deployWaf: true,
        internalMode,
        authorizedAccounts,
      },
    })
      .then(async (res) => {
        if (!res.success) {
          throw new Error(JSON.stringify((res.resultAction as any)?.payload));
        }
      })
      .catch((err) => {
        setIsRegistering(false);
        console.error("Registration error", { err });
        setErrorMessage(err.message);
      });
  };

  const isValid =
    profile &&
    domain &&
    verifiedSenderEmail &&
    orgName &&
    email &&
    firstName &&
    lastName &&
    deviceName;

  const selfHostedSetupInstructions = (
    <div>
      <p>
        Follow the steps below to create an AWS account and get it ready to host
        EnvKey Business Self-Hosted:
        <br />
        <br />
        <strong>
          <ExternalLink
            {...props}
            to="https://docs-v2.envkey.com/docs/enterprise-self-hosted"
          >
            Docs: Business Self-Hosted →
          </ExternalLink>
        </strong>
      </p>
    </div>
  );

  const selfHostedSetupInstructionsWelcome = (
    <div>
      <p>
        <strong>Now you need to supply some info</strong> to kick off the
        installation. It usually finishes in 30-45 minutes. No data is sent
        anywhere except your AWS account.
      </p>
    </div>
  );

  if (errorMessage) {
    return (
      <HomeContainer>
        <div className={styles.Register}>
          <h3>
            Install <strong>Error</strong>
          </h3>
          <p>There was a problem installing EnvKey.</p>
          <p className="error">{errorMessage}</p>
          <p>
            Please ensure your AWS account was setup correctly and try again. If
            the problem persists, email <strong>support@envkey.com</strong>
          </p>

          <div className="buttons">
            <div className="back-link">
              <a onClick={reset}>← Back</a>
            </div>
          </div>
        </div>
      </HomeContainer>
    );
  }

  if (isRegistering) {
    return (
      <HomeContainer>
        <div className={styles.Register}>
          <h3>
            <strong>Starting</strong> Install
          </h3>
          <div className="deploy-self-hosted-status">
            {props.core.deploySelfHostedStatus ? (
              <p>{props.core.deploySelfHostedStatus}</p>
            ) : (
              ""
            )}
            <p>
              <SmallLoader />
            </p>
          </div>
        </div>
      </HomeContainer>
    );
  }

  if (accountReady) {
    return (
      <HomeContainer>
        <div className={styles.Register}>
          <h3>
            <strong>Install</strong> And Create Org
          </h3>
          {selfHostedSetupInstructionsWelcome}
          <div className="field">
            <label>AWS profile name</label>
            <input
              type="text"
              placeholder="envkey-host"
              value={profile}
              required
              onChange={(e) => setProfile(e.target.value)}
            />
            <span>
              This profile shoud be set in your `$HOME/.aws/credentials` file
              with credentials for an IAM user with administrator access.
            </span>
          </div>

          <div className="field">
            <label>Behind-your-firewall mode</label>

            <div className="select">
              <select
                value={internalMode ? "true" : "false"}
                onChange={(e) => setInternalMode(e.target.value == "true")}
              >
                <option key="internal0" value="true">
                  Enabled
                </option>
                <option key="internal1" value="false">
                  Disabled
                </option>
              </select>
              <SvgImage type="down-caret" />
            </div>

            <span>
              <strong>Behind-Your-Firewall Mode</strong> seals your EnvKey
              installation off in a fully private network. You can connect from
              VPCs in other AWS accounts through AWS PrivateLink.
              <br />
              <strong>
                Not recommended unless you're certain that you need it.
              </strong>
            </span>
          </div>

          {internalMode
            ? [
                <div className="field">
                  <label>Authorized AWS Account Ids</label>
                  <ReactSelect
                    creatable={true}
                    hideIndicatorContainer={true}
                    isMulti
                    onChange={(selectedArg) => {
                      const selected = (selectedArg ??
                        []) as ReactSelectOption[];

                      let accounts = R.uniq(selected.map(R.prop("value")));

                      if (
                        !R.equals(
                          R.sortBy(R.identity, authorizedAccounts),
                          R.sortBy(R.identity, accounts)
                        )
                      ) {
                        setAuthorizedAccounts(accounts);
                      }
                    }}
                    value={authorizedAccounts.map((value) => ({
                      value,
                      label: value,
                    }))}
                    placeholder="Add a 12 digit AWS Account ID..."
                    formatCreateLabel={(s: string) => s}
                    isValidNewOption={(s) => /^\d{12}$/.test(s)}
                    noOptionsMessage={() => null}
                    inputValue={authorizedAccountsInputVal}
                    onInputChange={(s: string) => {
                      if (
                        /^\d{12}$/.test(s) &&
                        !authorizedAccounts.includes(s)
                      ) {
                        setAuthorizedAccounts([...authorizedAccounts, s]);
                        setAuthorizedAccountsInputVal("");
                      } else if (s.length <= 12 && /^\d+$/.test(s)) {
                        setAuthorizedAccountsInputVal(s);
                      }
                    }}
                  />
                  <br />

                  <span>
                    Add any number of valid 12 digit AWS Account IDs.
                    <br />
                    Only VPCs in these accounts will be allowed to connect to
                    your EnvKey installation. You can update them later if
                    needed.
                    <br />
                    <strong>
                      Note that in addition to authorizing these accounts,
                      you'll also have to{" "}
                      <ExternalLink
                        {...props}
                        to="https://docs.aws.amazon.com/vpc/latest/privatelink/accept-reject-endpoint-requests.html"
                      >
                        approve connection requests →
                      </ExternalLink>
                    </strong>
                  </span>
                </div>,
              ]
            : ""}

          <div className="field">
            <label>AWS{internalMode ? " " : " Primary "}Region</label>
            <div className="select">
              <select
                value={primaryRegion}
                onChange={(e) => setPrimaryRegion(e.target.value as Region)}
              >
                {regions.map((r) => (
                  <option
                    value={r}
                    key={r}
                  >{`${regionLabels[r]} (${r})`}</option>
                ))}
              </select>
              <SvgImage type="down-caret" />
            </div>
            {internalMode ? (
              <span>
                With Behind-Your-Firewall-Mode, it's simplest to connect from
                the same region that EnvKey runs in, but you can connect from
                other regions if needed using Inter-Region VPC peering.
              </span>
            ) : (
              ""
            )}
          </div>

          {internalMode ? (
            ""
          ) : (
            <div className="field">
              <label>AWS Failover Region</label>
              <div className="select">
                <select
                  value={failoverRegion}
                  onChange={(e) => setFailoverRegion(e.target.value as Region)}
                >
                  {regions
                    .filter((r) => r != primaryRegion)
                    .map((r) => (
                      <option
                        value={r}
                        key={r}
                      >{`${regionLabels[r]} (${r})`}</option>
                    ))}
                </select>
                <SvgImage type="down-caret" />
              </div>
            </div>
          )}

          <div className="field">
            <label>Domain Type</label>
            <div className="select">
              <select
                value={customDomain ? "custom" : "route53"}
                onChange={(e) => setCustomDomain(e.target.value == "custom")}
              >
                <option key="custom0" value="route53">
                  Use domain purchased through Route53
                </option>
                <option key="custom1" value="custom">
                  Use an existing domain
                </option>
              </select>
              <SvgImage type="down-caret" />
            </div>
            <span>
              If you purchased a domain through Route53, DNS will be configured
              automatically.
              <br />
              <br />
              If you'd prefer to use an existing domain, EnvKey will generate
              DNS records for you to add when the installation finishes.
            </span>
          </div>

          <div className="field">
            <label>Domain</label>
            <input
              type="text"
              placeholder="Enter a domain..."
              value={domain}
              required
              onChange={(e) => setDomain(e.target.value)}
            />
            <span>
              Enter just the root domain. Example: `org-secrets.com`
              {internalMode
                ? [
                    <br />,
                    <strong>
                      Note: Behind-Your-Firewall-Mode requires this domain to be
                      registered with Route53 in your EnvKey AWS account.
                    </strong>,
                  ]
                : ""}
            </span>
          </div>

          <div className="field">
            <label>SES-Verified Sender Email</label>
            <input
              type="email"
              placeholder="Enter an SES-verified email address..."
              value={verifiedSenderEmail}
              required
              onChange={(e) => setVerifiedSenderEmail(e.target.value)}
            />
            <span>
              This will be the 'from' address for emails sent by your EnvKey
              host. Must be verified in SES.
            </span>
          </div>

          <div className="field">
            <label>SES-Verified Infrastructure Alerts Email</label>
            <input
              type="email"
              placeholder="Enter an SES-verified email address..."
              value={infraAlertsEmail}
              required
              onChange={(e) => setInfraAlertsEmail(e.target.value)}
            />
            <span>
              EnvKey errors and AWS infrastructure alerts will be sent here.
              Must be verified in SES. You'll get an email from AWS asking you
              to confirm your subscription to these alerts.
            </span>
          </div>

          <div className="field">
            <label>Organization Name</label>
            <input
              type="text"
              placeholder="Enter a name..."
              value={orgName ?? ""}
              required
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Your Email</label>
            <input
              type="email"
              placeholder="Enter email for initial account creation..."
              value={email ?? ""}
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Your Name</label>
            <input
              type="text"
              placeholder="Enter your first name..."
              value={firstName ?? ""}
              required
              onChange={(e) => setFirstName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Enter your last name..."
              value={lastName ?? ""}
              required
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Name Of This Device</label>
            <input
              type="text"
              placeholder="Enter a name..."
              value={deviceName ?? ""}
              required
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </div>

          <div>
            <div className="buttons">
              <button
                className="primary"
                disabled={!isValid}
                onClick={dispatchRegistration}
              >
                Install
              </button>
            </div>

            <div className="back-link">
              <a
                onClick={async (e) => {
                  e.preventDefault();
                  backStep();
                }}
              >
                ← Back
              </a>
            </div>
          </div>
        </div>
      </HomeContainer>
    );
  } else {
    return (
      <HomeContainer>
        <div className={styles.Register}>
          <h3>
            Get Your <strong>AWS Account</strong> Ready
          </h3>

          {selfHostedSetupInstructions}

          <div className="buttons">
            <button className="primary" onClick={() => setAccountReady(true)}>
              My AWS Account Is Ready
            </button>
          </div>

          <div className="back-link">
            <a
              onClick={(e) => {
                e.preventDefault();
                backStep();
              }}
            >
              ← Back
            </a>
          </div>
        </div>
      </HomeContainer>
    );
  }
};

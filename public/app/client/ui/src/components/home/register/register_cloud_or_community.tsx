import React, { useState, useEffect, useMemo } from "react";
import { VerifyEmail, ExternalLink } from "@ui";
import { Component } from "@ui_types";
import { Client, Api } from "@core/types";
import { getDefaultOrgSettings } from "@core/lib/client/defaults";
import { secureRandomAlphanumeric, sha256 } from "@core/lib/crypto/utils";
import { HomeContainer } from "../home_container";
import * as styles from "@styles";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { wait } from "@core/lib/utils/wait";
import { CopyableDisplay } from "src/components/settings/copyable_display";
import { logAndAlertError } from "@ui_lib/errors";

type RegisterRes = Client.DispatchResult<
  Client.Action.SuccessAction<
    Client.Action.ClientActions["Register"],
    Api.Net.RegisterResult
  >
>;

const getRegisterComponent = (hostType: "cloud" | "community") => {
  const RegisterComponent: Component = (props) => {
    const { core, ui, dispatch, history, setUiState } = props;

    const [communityInfraReady, setCommunityInfraReady] = useState(false);
    const [communityAuth, setCommunityAuth] = useState("");
    const [domain, setDomain] = useState("");
    const [subdomain, setSubdomain] = useState("");

    const [email, setEmail] = useState<string | null>(null);
    const [token, setToken] = useState<string | null>(null);

    const [orgName, setOrgName] = useState<string | null>(null);
    const [firstName, setFirstName] = useState<string | null>(null);
    const [lastName, setLastName] = useState<string | null>(null);
    const [deviceName, setDeviceName] = useState<string | null>(
      core.defaultDeviceName ?? null
    );

    const [registeredUserId, setRegisteredUserId] = useState<string>();

    const [isRegistering, setIsRegistering] = useState(false);
    const [awaitingMinDelay, setAwaitingMinDelay] = useState(false);

    const registeredAccount =
      (ui.accountId &&
        ui.accountId == registeredUserId &&
        core.orgUserAccounts[registeredUserId]) ||
      undefined;

    useEffect(() => {
      if (
        registeredAccount &&
        core.graphUpdatedAt &&
        !awaitingMinDelay &&
        ui.loadedAccountId == registeredAccount.userId
      ) {
        history.push(`/org/${registeredAccount.orgId}`);
      }
    }, [
      Boolean(registeredAccount),
      core.graphUpdatedAt,
      awaitingMinDelay,
      ui.loadedAccountId,
    ]);

    useEffect(() => {
      if (hostType == "community") {
        setCommunityAuth(secureRandomAlphanumeric(22));
      }
    }, []);

    const communityAuthHash = useMemo(
      () => (hostType == "community" ? sha256(communityAuth) : ""),
      [communityAuth]
    );

    const dispatchRegistration = async () => {
      if (
        !(email && token && orgName && firstName && lastName && deviceName) ||
        (hostType == "community" && !(domain && subdomain))
      ) {
        return;
      }
      setIsRegistering(true);
      setAwaitingMinDelay(true);

      const minDelayPromise = wait(MIN_ACTION_DELAY_MS).then(() =>
        setAwaitingMinDelay(false)
      );

      const action: Client.Action.ClientActions["Register"] =
        hostType == "community"
          ? {
              type: Client.ActionType.REGISTER,
              payload: {
                hostType: "community",
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
                emailVerificationToken: token,
                communityAuth,
              },
            }
          : {
              type: Client.ActionType.REGISTER,
              payload: {
                hostType: "cloud",
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
                emailVerificationToken: token,
              },
            };

      const res = (await dispatch(
        action,
        hostType == "community" ? [subdomain, domain].join(".") : undefined
      )) as RegisterRes;

      await minDelayPromise;

      return res;
    };

    const onRegister = async (res: RegisterRes | undefined) => {
      if (!res || !res.success) {
        logAndAlertError(
          "There was a problem creating an organization.",
          res?.resultAction
        );
        return;
      }
      const payload = res.resultAction.payload;

      setUiState({
        accountId: payload.userId,
        loadedAccountId: undefined,
      });

      setRegisteredUserId(payload.userId);
    };

    const onSubmitRegistration = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      dispatchRegistration().then(onRegister);
    };

    if (hostType == "community" && !communityInfraReady) {
      return (
        <HomeContainer>
          <div className={styles.Register}>
            <h3>
              Get Your <strong>Infrastructure</strong> Ready
            </h3>
            <p>
              To get <strong>EnvKey Community</strong> running on your
              infrastructure, follow the steps at:
              <br />
              <br />
              <strong>
                <ExternalLink
                  {...props}
                  to="https://docs-v2.envkey.com/docs/self-hosting-open-source-envkey"
                >
                  Docs: Self-Hosting EnvKey Community Open Source →
                </ExternalLink>
              </strong>
            </p>

            <p>
              To ensure that not just anyone can create an organization on your
              new host, you'll need to set a <code>COMMUNITY_AUTH_HASH</code>{" "}
              environment variable that is readable by the EnvKey Community
              process.
            </p>

            <CopyableDisplay
              {...props}
              label="COMMUNITY_AUTH_HASH"
              value={communityAuthHash}
            />

            <p>
              Next, enter the <strong>domain</strong> and{" "}
              <strong>subdomain</strong> of your EnvKey installation below.
            </p>

            <div className="field">
              <label>Domain</label>
              <input
                type="text"
                placeholder="Enter a domain..."
                value={domain ?? ""}
                disabled={isRegistering}
                required
                autoFocus
                onChange={(e) => setDomain(e.target.value)}
              />
              <span>Example: `org-secrets.com`</span>
            </div>

            <div className="field">
              <label>Subdomain</label>
              <input
                type="text"
                placeholder="Enter a subdomain..."
                value={subdomain ?? ""}
                required
                onChange={(e) => setSubdomain(e.target.value)}
              />
              <span>Example: `mysubdomain`</span>
            </div>

            <div className="buttons">
              <button
                className="primary"
                disabled={!(domain && subdomain)}
                onClick={() => setCommunityInfraReady(true)}
              >
                Next
              </button>
            </div>

            <div className="back-link">
              <a
                onClick={(e) => {
                  e.preventDefault();
                  props.history.replace(`/create-org`);
                }}
              >
                ← Back
              </a>
            </div>
          </div>
        </HomeContainer>
      );
    }

    if (!(email && token)) {
      return (
        <HomeContainer>
          <div className={styles.Register}>
            <VerifyEmail
              {...{
                ...props,
                authType: "sign_up",
                communityAuth: communityAuth || undefined,
                hostUrlOverride:
                  hostType == "community" && domain && subdomain
                    ? [subdomain, domain].join(".")
                    : undefined,
                onValid: ({ email, token }) => {
                  setEmail(email);
                  setToken(token);
                },
                onBack:
                  hostType == "community"
                    ? () => setCommunityInfraReady(false)
                    : undefined,

                signUpStartText:
                  hostType == "community"
                    ? ["Now enter your ", <strong>email.</strong>]
                    : undefined,
              }}
            />
          </div>
        </HomeContainer>
      );
    }

    const renderRegisterButtons = () => {
      let label: string;
      if (isRegistering) {
        label = "Creating Organization...";
      } else {
        label = "Create Organization";
      }

      return (
        <div>
          <div className="buttons">
            <input
              className="primary"
              disabled={
                isRegistering ||
                !(orgName && firstName && lastName && deviceName) ||
                (hostType == "community" && !(domain && subdomain))
              }
              type="submit"
              value={label}
            />
          </div>

          <div className="back-link">
            <a
              onClick={async (e) => {
                e.preventDefault();

                if (core.verifyingEmail) {
                  await dispatch({
                    type: Client.ActionType.RESET_EMAIL_VERIFICATION,
                  });
                  setToken(null);
                  setEmail(null);
                } else if (hostType == "community" && communityInfraReady) {
                  setCommunityInfraReady(false);
                } else {
                  props.history.replace(`/create-org`);
                }
              }}
            >
              ← Back
            </a>
          </div>
        </div>
      );
    };

    return (
      <HomeContainer>
        <form className={styles.Register} onSubmit={onSubmitRegistration}>
          <h3>
            A bit more info is needed to <strong>create your org.</strong>
          </h3>

          <div className="field">
            <label>Organization Name</label>
            <input
              type="text"
              placeholder="Enter a name..."
              value={orgName ?? ""}
              disabled={isRegistering}
              required
              autoFocus
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Your Name</label>
            <input
              type="text"
              placeholder="Enter your first name..."
              value={firstName ?? ""}
              disabled={isRegistering}
              required
              onChange={(e) => setFirstName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Enter your last name..."
              value={lastName ?? ""}
              disabled={isRegistering}
              required
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Name Of This Device</label>
            <input
              type="text"
              placeholder="Enter a name..."
              disabled={isRegistering}
              value={deviceName ?? ""}
              required
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </div>
          {renderRegisterButtons()}
        </form>
      </HomeContainer>
    );
  };

  return RegisterComponent;
};

export const RegisterCloud = getRegisterComponent("cloud");
export const RegisterCommunity = getRegisterComponent("community");

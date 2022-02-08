import React, { useState, useMemo, useEffect } from "react";
import { Component } from "@ui_types";
import { dispatchDeviceSecurity } from "@ui_lib/device_security";
import { Api, Client, Model } from "@core/types";
import * as ui from "@ui";
import * as g from "@core/lib/graph";
import { HomeContainer } from "./home_container";
import * as styles from "@styles";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { wait } from "@core/lib/utils/wait";

const INVITE_TOKEN_REGEX = /^(i|dg)_[a-zA-Z0-9]{26}_.+$/;
const ENCRYPTION_TOKEN_REGEX = /^[a-fA-F0-9]{64}_[a-zA-Z0-9]{26}$/;

let runningLoop = false;

export const AcceptInvite: Component = (props) => {
  const [emailToken, setEmailToken] = useState("");
  const [encryptionToken, setEncryptionToken] = useState("");
  const [deviceName, setDeviceName] = useState(props.core.defaultDeviceName);

  const [passphrase, setPassphrase] = useState<string>();
  const [lockoutMs, setLockoutMs] = useState<number>();

  const [isLoading, setIsLoading] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  const [awaitingMinDelay, setIsAwaitingMinDelay] = useState(false);

  const [acceptedUserId, setAcceptedUserId] = useState<string>();
  const [acceptedSender, setAcceptedSender] = useState<string>();
  const [needsExternalAuthError, setNeedsExternalAuthError] = useState<
    Api.Net.RequiresExternalAuthResult | undefined
  >(undefined);
  const [externalAuthErrorMessage, setExternalAuthErrorMessage] = useState<
    string | undefined
  >();

  const [loadActionType, acceptActionType] = useMemo(() => {
    if (!emailToken) {
      return [undefined, undefined];
    }
    const split = emailToken.split("_");
    if (!split || split.length != 3) {
      return [undefined, undefined];
    }

    const [prefix] = split as ["i" | "dg", string, string];
    return {
      i: [Client.ActionType.LOAD_INVITE, Client.ActionType.ACCEPT_INVITE],
      dg: [
        Client.ActionType.LOAD_DEVICE_GRANT,
        Client.ActionType.ACCEPT_DEVICE_GRANT,
      ],
    }[prefix] as [
      Client.Action.ClientActions["LoadInvite" | "LoadDeviceGrant"]["type"],
      Client.Action.ClientActions["AcceptInvite" | "AcceptDeviceGrant"]["type"]
    ];
  }, [emailToken]);

  const loadedInviteOrDeviceGrant =
    props.core.loadedInvite ?? props.core.loadedDeviceGrant;

  const inviteeOrGranteeId = loadedInviteOrDeviceGrant
    ? "inviteeId" in loadedInviteOrDeviceGrant
      ? loadedInviteOrDeviceGrant.inviteeId
      : loadedInviteOrDeviceGrant.granteeId
    : undefined;

  useEffect(() => {
    if (inviteeOrGranteeId && inviteeOrGranteeId != props.ui.accountId) {
      props.setUiState({
        accountId: inviteeOrGranteeId,
      });
    }
  }, [
    Boolean(loadedInviteOrDeviceGrant),
    inviteeOrGranteeId == props.ui.accountId,
  ]);

  useEffect(() => {
    if (loadedInviteOrDeviceGrant && isLoading && !awaitingMinDelay) {
      setIsLoading(false);
    }
  }, [Boolean(loadedInviteOrDeviceGrant), awaitingMinDelay]);

  useEffect(() => {
    const error = props.core.loadInviteError || props.core.loadDeviceGrantError;
    if (!error || error.type !== "requiresExternalAuthError") {
      setNeedsExternalAuthError(undefined);

      if (error) {
        setIsLoading(false);
        setEmailToken("");
        setEncryptionToken("");
      }

      return;
    }
    setNeedsExternalAuthError(error as Api.Net.RequiresExternalAuthResult);
    setIsLoading(false);
  }, [props.core.loadInviteError, props.core.loadDeviceGrantError]);

  // Capture any external auth errors
  useEffect(() => {
    const e =
      props.core.startingExternalAuthSessionError ||
      props.core.createSessionError ||
      props.core.startingExternalAuthSessionInviteError ||
      props.core.externalAuthSessionCreationError ||
      props.core.authorizingExternallyErrorMessage;
    if (!e) {
      setExternalAuthErrorMessage(undefined);
      return;
    }
    console.error("External auth error", e);
    runningLoop = false;

    setExternalAuthErrorMessage(
      typeof e === "string" ? e : "errorReason" in e ? e.errorReason : e.type
    );
  }, [
    props.core.startingExternalAuthSessionError,
    props.core.createSessionError,
    props.core.startingExternalAuthSessionInviteError,
    props.core.externalAuthSessionCreationError,
    props.core.authorizingExternallyErrorMessage,
  ]);

  // Creation of session from successful external auth.
  useEffect(() => {
    if (props.core.completedInviteExternalAuth) {
      if (runningLoop) {
        runningLoop = false;
      }
      return;
    }
    if (
      !needsExternalAuthError ||
      loadedInviteOrDeviceGrant ||
      props.core.creatingExternalAuthSession ||
      runningLoop
    ) {
      return;
    }

    console.log(
      "CREATE_EXTERNAL_AUTH_SESSION_FOR_INVITE",
      needsExternalAuthError
    );

    props.dispatch({
      type: Client.ActionType.CREATE_EXTERNAL_AUTH_SESSION_FOR_INVITE,
      payload: {
        authMethod: "saml",
        provider: "saml",
        authType:
          loadActionType === Client.ActionType.LOAD_INVITE
            ? "accept_invite"
            : "accept_device_grant",
        authObjectId: needsExternalAuthError.id!,
        externalAuthProviderId: needsExternalAuthError.externalAuthProviderId!,
        orgId: needsExternalAuthError.orgId!,
        loadActionType: loadActionType!,
        emailToken,
        encryptionToken,
      },
    });
  }, [needsExternalAuthError, props.core.completedInviteExternalAuth]);

  useEffect(() => {
    (async () => {
      if (!props.core.startingExternalAuthSessionInvite) {
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
        console.log("runningLoop waiting for saml invite");
        await wait(500);
        await props.refreshCoreState();
      }
    })();
  }, [props.core.startingExternalAuthSessionInvite]);

  useEffect(() => {
    if (props.core.completedExternalAuth) {
      setNeedsExternalAuthError(undefined);
      return;
    }
  }, [props.core.completedExternalAuth]);

  const existingDeviceNames = useMemo(() => {
    if (!inviteeOrGranteeId) {
      return new Set<string>();
    }
    return new Set(
      (
        g.getActiveOrgUserDevicesByUserId(props.core.graph)[
          inviteeOrGranteeId
        ] ?? []
      ).map(({ name }) => name.trim().toLowerCase())
    );
  }, [props.core.graphUpdatedAt, inviteeOrGranteeId]);

  const deviceNameUnique = useMemo(() => {
    if (!deviceName) {
      return true;
    }
    return !existingDeviceNames.has(deviceName.trim().toLowerCase());
  }, [deviceName, existingDeviceNames]);

  const emailTokenInvalid = emailToken && !emailToken.match(INVITE_TOKEN_REGEX);
  const encryptionTokenInvalid =
    encryptionToken && !encryptionToken.match(ENCRYPTION_TOKEN_REGEX);

  const externalAuthValid =
    !needsExternalAuthError ||
    (needsExternalAuthError && props.core.completedExternalAuth);
  const formValid =
    (loadedInviteOrDeviceGrant &&
      acceptActionType &&
      externalAuthValid &&
      deviceName &&
      deviceNameUnique) ||
    (!loadedInviteOrDeviceGrant &&
      loadActionType &&
      externalAuthValid &&
      emailToken &&
      !emailTokenInvalid &&
      encryptionToken &&
      !encryptionTokenInvalid);

  const numAccounts = Object.keys(props.core.orgUserAccounts).length;

  const shouldRedirect = Boolean(
    !loadedInviteOrDeviceGrant &&
      props.ui.loadedAccountId &&
      acceptedUserId &&
      acceptedUserId === props.ui.loadedAccountId &&
      props.core.orgUserAccounts[props.ui.loadedAccountId] &&
      !awaitingMinDelay
  );

  useEffect(() => {
    if (shouldRedirect) {
      const orgId =
        props.core.orgUserAccounts[props.ui.loadedAccountId!]!.orgId;
      props.history.push(`/org/${orgId}/welcome`);
    }
  }, [shouldRedirect]);

  if (shouldRedirect) {
    return <HomeContainer />;
  }

  const shouldShowDeviceSecurity =
    numAccounts == 0 && !props.core.requiresPassphrase;

  const loadedOrgId =
    props.core.loadedInviteOrgId ?? props.core.loadedDeviceGrantOrgId;

  const loadedOrg = loadedOrgId
    ? (props.core.graph[loadedOrgId] as Model.Org)
    : undefined;
  const inviteeOrGrantee = inviteeOrGranteeId
    ? (props.core.graph[inviteeOrGranteeId] as Model.OrgUser)
    : undefined;

  const invitedOrGrantedBy = loadedInviteOrDeviceGrant
    ? (props.core.graph[
        "invitedByUserId" in loadedInviteOrDeviceGrant
          ? loadedInviteOrDeviceGrant.invitedByUserId
          : loadedInviteOrDeviceGrant.grantedByUserId
      ] as Model.OrgUser | Model.CliUser)
    : undefined;

  let senderId: string | undefined;
  let sender: string | undefined;
  if (invitedOrGrantedBy) {
    if (invitedOrGrantedBy.type == "orgUser") {
      senderId = invitedOrGrantedBy.id;
    } else if (invitedOrGrantedBy.type == "cliUser") {
      senderId = invitedOrGrantedBy.signedById;
    }

    if (senderId) {
      const { email, firstName, lastName } = props.core.graph[
        senderId
      ] as Model.OrgUser;
      sender = `${firstName} ${lastName} <${email}>`;
    }
  }

  const onLoad = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!emailToken || !encryptionToken || !loadActionType) {
      return;
    }

    setIsLoading(true);
    setIsAwaitingMinDelay(true);
    wait(MIN_ACTION_DELAY_MS).then(() => setIsAwaitingMinDelay(false));

    props.dispatch({ type: Client.ActionType.RESET_EXTERNAL_AUTH }).then(() =>
      props.dispatch({
        type: loadActionType,
        payload: { emailToken, encryptionToken },
      })
    );
  };

  const onAccept = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!acceptActionType || !inviteeOrGrantee || !deviceName || !formValid) {
      return;
    }

    const inviteeOrGranteeId = inviteeOrGrantee.id;

    setIsAccepting(true);

    setAcceptedSender(sender);
    setIsAwaitingMinDelay(true);
    wait(MIN_ACTION_DELAY_MS).then(() => setIsAwaitingMinDelay(false));

    const res = await props.dispatch({
      type: acceptActionType,
      payload: { deviceName, emailToken, encryptionToken },
    });

    if (!res.success) {
      return;
    }

    if (shouldShowDeviceSecurity && passphrase) {
      await dispatchDeviceSecurity(props.dispatch, passphrase, lockoutMs);
    }

    props.setUiState({
      accountId: inviteeOrGranteeId,
      loadedAccountId: inviteeOrGranteeId,
    });

    setAcceptedUserId(inviteeOrGranteeId);
  };

  const renderButtons = () => {
    const samlWaiting =
      runningLoop ||
      (needsExternalAuthError && !props.core.completedExternalAuth);
    const disabledDueToLoading =
      samlWaiting || !formValid || isLoading || isAccepting;

    let label: string;
    if (isLoading) {
      label = "Loading and Verifying...";
    } else if (samlWaiting) {
      label = "Authenticating with SSO...";
    } else if (isAccepting) {
      label = "Signing In...";
    } else if (loadedInviteOrDeviceGrant) {
      label = "Sign In";
    } else {
      label = "Next";
    }

    return (
      <div>
        <div className="buttons">
          <input
            className="primary"
            type="submit"
            disabled={disabledDueToLoading}
            value={label}
          />
        </div>
        <div className="back-link">
          <a
            onClick={(e) => {
              e.preventDefault();
              if (loadedInviteOrDeviceGrant) {
                setEmailToken("");
                setEncryptionToken("");
                setDeviceName(props.core.defaultDeviceName);
                setPassphrase("");
                setLockoutMs(undefined);
              }

              props.dispatch({ type: Client.ActionType.RESET_EXTERNAL_AUTH });

              if (props.core.loadedInvite) {
                props.dispatch({ type: Client.ActionType.RESET_INVITE });
              } else if (props.core.loadedDeviceGrant) {
                props.dispatch({
                  type: Client.ActionType.RESET_DEVICE_GRANT,
                });
              } else {
                props.history.length > 1
                  ? props.history.goBack()
                  : props.history.replace(`/home`);
              }
            }}
          >
            ← Back
          </a>
        </div>
      </div>
    );
  };

  /* Begin Render */

  const isReadyToAccept =
    isAccepting ||
    (loadedInviteOrDeviceGrant &&
      loadedOrg &&
      inviteeOrGrantee &&
      sender &&
      !isLoading);

  // Second screen. Invite is loaded, and need to
  if (isReadyToAccept) {
    const deviceNameInput = (
      <div className="field">
        <label>Device Name</label>
        <input
          type="text"
          placeholder="Device name"
          value={deviceName || ""}
          disabled={isAccepting}
          required
          onChange={(e) => setDeviceName(e.target.value)}
          autoFocus
        />
        {deviceNameUnique || isAccepting ? (
          ""
        ) : (
          <p className="error">You already have a device with the same name</p>
        )}
      </div>
    );
    const deviceSecurityComponent = shouldShowDeviceSecurity ? (
      <ui.DeviceSettingsFields
        {...props}
        disabled={isAccepting}
        fields={["passphrase", "lockout"]}
        passphraseStrengthInputs={[
          loadedOrg?.name ?? "",
          inviteeOrGrantee?.firstName ?? "",
          inviteeOrGrantee?.lastName ?? "",
          deviceName ?? "",
        ].filter(Boolean)}
        onChange={({ passphrase, lockoutMs }) => {
          setPassphrase(passphrase);
          setLockoutMs(lockoutMs);
        }}
      />
    ) : (
      ""
    );

    return (
      <HomeContainer>
        <form
          className={styles.AcceptInvite}
          onSubmit={loadedInviteOrDeviceGrant ? onAccept : onLoad}
        >
          <div className="fields">
            <h3>
              Invitation <strong>loaded and verified.</strong>
            </h3>

            <div className="field sent-by">
              <label>Sent By</label>
              <p>
                <strong>{sender ?? acceptedSender!}</strong>
              </p>
            </div>

            <p>
              Please ensure you know and trust this sender before proceeding.
            </p>

            {deviceNameInput}

            {deviceSecurityComponent}
          </div>
          {renderButtons()}
        </form>
      </HomeContainer>
    );
  }

  // First screen helpers

  const loadingInviteError =
    props.core.loadInviteError ?? props.core.loadDeviceGrantError;
  const loadInviteErrorComponent =
    !needsExternalAuthError && loadingInviteError ? (
      <p className="error">
        There was a problem loading and verifying your invite. Please ensure you
        copied both tokens correctly and try again.
      </p>
    ) : (
      ""
    );

  // First screen render. Inputs for the tokens. Maybe wait for external auth.
  return (
    <HomeContainer>
      <form
        className={styles.AcceptInvite}
        onSubmit={loadedInviteOrDeviceGrant ? onAccept : onLoad}
      >
        <div className="fields">
          {loadInviteErrorComponent}

          <div className="field invite-token">
            <label>
              <span className="number">1</span>
              <span className="label">
                An <strong>Invite Token</strong>, received by email.
              </span>
            </label>
            <input
              type="password"
              placeholder="Paste in your Invite Token..."
              value={emailToken}
              disabled={isLoading}
              required
              autoFocus
              onChange={(e) => setEmailToken(e.target.value)}
            />
            {emailTokenInvalid ? (
              <p className="error">Invite Token invalid.</p>
            ) : (
              ""
            )}
          </div>
          <div className="field encryption-token">
            <label>
              <span className="number">2</span>
              <span className="label">
                An <strong>Encryption Token</strong>, received directly from the
                person who invited you.
              </span>
            </label>
            <input
              type="password"
              placeholder="Paste in your Encryption Token..."
              disabled={isLoading}
              value={encryptionToken}
              required
              onChange={(e) => setEncryptionToken(e.target.value)}
            />
            {encryptionTokenInvalid ? (
              <p className="error">Encryption Token invalid.</p>
            ) : (
              ""
            )}
          </div>

          {externalAuthErrorMessage ? (
            <p className={"error"}>{externalAuthErrorMessage}</p>
          ) : null}
        </div>
        {renderButtons()}
      </form>
    </HomeContainer>
  );
};

import React, { useState, useMemo, useEffect } from "react";
import { Component } from "@ui_types";
import { Client, Model } from "@core/types";
import { Link } from "react-router-dom";
import * as g from "@core/lib/graph";
import { getDefaultApiHostUrl } from "../../../../shared/src/env";
import { HomeContainer } from "../home/home_container";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { wait } from "@core/lib/utils/wait";
import { PHRASE_LENGTH } from "@core/lib/crypto/phrase";
import * as styles from "@styles";
import { logAndAlertError } from "@ui_lib/errors";
import { CryptoStatus } from "../shared";
import { SmallLoader } from "@images";

export const RedeemRecoveryKey: Component = (props) => {
  const [recoveryKey, setRecoveryKey] = useState("");
  const [emailToken, setEmailToken] = useState("");

  const [deviceName, setDeviceName] = useState(props.core.defaultDeviceName);
  const [deviceNameUpdated, setDeviceNameUpdated] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemedUserId, setRedeemedUserId] = useState<string>();
  const [awaitingMinDelay, setAwaitingMinDelay] = useState(false);

  const [loadingWithEmail, setLoadingWithEmail] = useState<string>();

  const [isResetting, setIsResetting] = useState(false);

  const loadedRecoveryKey = props.core.loadedRecoveryKey;
  const loadRecoveryKeyError = props.core.loadRecoveryKeyError;
  const recoveryAccountId = loadedRecoveryKey?.userId;

  useEffect(() => {
    if (!loadedRecoveryKey && !loadRecoveryKeyError && isResetting) {
      setIsResetting(false);
    }

    if ((loadedRecoveryKey || loadRecoveryKeyError) && !awaitingMinDelay) {
      setIsLoading(false);
      setLoadingWithEmail(undefined);
    }
  }, [
    Boolean(loadedRecoveryKey),
    Boolean(loadRecoveryKeyError),
    awaitingMinDelay,
  ]);

  useEffect(() => {
    if (recoveryAccountId && recoveryAccountId != props.ui.accountId) {
      props.setUiState({
        accountId: recoveryAccountId,
      });
    }
  }, [Boolean(loadedRecoveryKey), recoveryAccountId == props.ui.accountId]);

  const existingDeviceNames = useMemo(() => {
    if (!recoveryAccountId) {
      return new Set<string>();
    }
    return new Set(
      (
        g.getActiveOrgUserDevicesByUserId(props.core.graph)[
          recoveryAccountId
        ] ?? []
      ).map(({ name }) => name.trim().toLowerCase())
    );
  }, [props.core.graphUpdatedAt, recoveryAccountId]);

  const deviceNameUnique = useMemo(() => {
    if (!deviceName) {
      return true;
    }
    return !existingDeviceNames.has(deviceName.trim().toLowerCase());
  }, [deviceName, existingDeviceNames]);

  useEffect(() => {
    if (deviceName && !deviceNameUnique && !deviceNameUpdated) {
      setDeviceName(deviceName + "-recovered");
    }
  }, [deviceNameUnique]);

  useEffect(() => {
    if (props.core.defaultDeviceName && !deviceName && !deviceNameUpdated) {
      setDeviceName(props.core.defaultDeviceName);
    }
  }, [props.core.defaultDeviceName]);

  const formValid =
    (loadedRecoveryKey && deviceName && deviceNameUnique) ||
    (!loadedRecoveryKey &&
      recoveryKey &&
      [PHRASE_LENGTH, PHRASE_LENGTH + 1].includes(
        recoveryKey.split(/\s/).length
      )) ||
    (!loadedRecoveryKey &&
      loadRecoveryKeyError?.type == "requiresEmailAuthError" &&
      emailToken);

  const numAccounts = Object.keys(props.core.orgUserAccounts).length;

  const shouldRedirect = Boolean(
    !loadedRecoveryKey &&
      props.ui.loadedAccountId &&
      redeemedUserId &&
      redeemedUserId === props.ui.loadedAccountId &&
      props.core.orgUserAccounts[props.ui.loadedAccountId] &&
      !awaitingMinDelay
  );

  useEffect(() => {
    if (shouldRedirect) {
      const orgId =
        props.core.orgUserAccounts[props.ui.loadedAccountId!]!.orgId;

      props.history.push(`/org/${orgId}`);
    }
  }, [shouldRedirect]);

  if (shouldRedirect) {
    return <HomeContainer />;
  }

  const loadedOrgId = props.core.loadedRecoveryKeyOrgId;

  const loadedOrg = loadedOrgId
    ? (props.core.graph[loadedOrgId] as Model.Org)
    : undefined;
  const recoveringUser = recoveryAccountId
    ? (props.core.graph[recoveryAccountId] as Model.OrgUser)
    : undefined;

  const onLoad = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!recoveryKey) {
      return;
    }

    if (loadRecoveryKeyError?.type == "requiresEmailAuthError" && !emailToken) {
      return;
    }

    const split = recoveryKey.split(/\s/);

    const [encryptionKey, hostUrl] =
      split.length == PHRASE_LENGTH + 1
        ? [split.slice(0, PHRASE_LENGTH).join(" "), split[PHRASE_LENGTH]]
        : [split.join(" "), getDefaultApiHostUrl()];

    setIsLoading(true);
    if (emailToken && loadRecoveryKeyError?.type == "requiresEmailAuthError") {
      setLoadingWithEmail(loadRecoveryKeyError.email);
    }
    setAwaitingMinDelay(true);
    wait(MIN_ACTION_DELAY_MS).then(() => setAwaitingMinDelay(false));

    props.dispatch({
      type: Client.ActionType.LOAD_RECOVERY_KEY,
      payload: {
        encryptionKey,
        hostUrl,
        emailToken: emailToken || undefined,
      },
    });
  };

  const onAccept = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (
      !recoveringUser ||
      !deviceName ||
      !formValid ||
      !recoveryKey ||
      !emailToken
    ) {
      return;
    }

    const split = recoveryKey.split(/\s/);

    const [encryptionKey, hostUrl] =
      split.length == PHRASE_LENGTH + 1
        ? [split.slice(0, PHRASE_LENGTH).join(" "), split[PHRASE_LENGTH]]
        : [split.join(" "), getDefaultApiHostUrl()];

    setIsRedeeming(true);
    setAwaitingMinDelay(true);
    wait(MIN_ACTION_DELAY_MS).then(() => setAwaitingMinDelay(false));

    const res = await props.dispatch({
      type: Client.ActionType.REDEEM_RECOVERY_KEY,
      payload: { deviceName, encryptionKey, hostUrl, emailToken: emailToken },
    });

    if (!res.success) {
      logAndAlertError(
        `There was a problem redeeming the recovery key.`,
        (res.resultAction as any).payload
      );
      return;
    }

    props.setUiState({
      accountId: recoveringUser.id,
      loadedAccountId: recoveringUser.id,
      lastLoadedAccountId: recoveringUser.id,
    });
    setRedeemedUserId(recoveringUser.id);
  };

  const renderButtons = () => {
    let label: React.ReactChild;
    if (isLoading || isRedeeming) {
      label = <SmallLoader />;
    } else if (props.core.loadedRecoveryKey) {
      label = "Sign In";
    } else {
      label = "Next";
    }

    return (
      <div>
        <div className="buttons">
          <button
            className="primary"
            disabled={
              !formValid ||
              isLoading ||
              Boolean(loadingWithEmail) ||
              isRedeeming
            }
          >
            {label}
          </button>
        </div>
        {isLoading || isRedeeming ? <CryptoStatus {...props} /> : ""},
        <div className="back-link">
          <a
            onClick={async (e) => {
              e.preventDefault();
              if (
                props.core.loadedRecoveryKey ||
                loadRecoveryKeyError?.type == "requiresEmailAuthError"
              ) {
                props.dispatch({
                  type: Client.ActionType.RESET_RECOVERY_KEY,
                });
                setIsResetting(true);
                setRecoveryKey("");
                setEmailToken("");
                setDeviceName(props.core.defaultDeviceName);
                setDeviceNameUpdated(false);
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

  const fields =
    ((loadedRecoveryKey && loadedOrg && recoveringUser) || isRedeeming) &&
    !isLoading &&
    !loadingWithEmail &&
    !isResetting
      ? [
          <div className="field">
            <label>Device Name</label>
            <input
              type="text"
              placeholder="Device name"
              value={deviceName || ""}
              disabled={isRedeeming}
              required
              onChange={(e) => {
                setDeviceName(e.target.value);
                if (!deviceNameUpdated) {
                  setDeviceNameUpdated(true);
                }
              }}
              autoFocus
            />
            {deviceNameUnique ? (
              ""
            ) : (
              <small>You already have a device with the same name</small>
            )}
          </div>,
        ]
      : [
          loadRecoveryKeyError &&
          loadRecoveryKeyError.type != "requiresEmailAuthError" ? (
            <p className="error">
              There was a problem loading your recovery key. Please ensure you
              typed it in correctly and try again.
            </p>
          ) : (
            ""
          ),
          (loadRecoveryKeyError?.type == "requiresEmailAuthError" ||
            loadingWithEmail) &&
          !isResetting &&
          !(isLoading && !loadingWithEmail) ? (
            <div className="field">
              <p>
                An <strong>Email Token</strong> has been sent to{" "}
                <strong>
                  {loadRecoveryKeyError?.type == "requiresEmailAuthError"
                    ? loadRecoveryKeyError.email
                    : loadingWithEmail}
                </strong>
                . Please paste it below:
              </p>
              <input
                type="password"
                placeholder="Email Token"
                value={emailToken}
                disabled={Boolean(loadingWithEmail)}
                required
                autoFocus
                onChange={(e) => setEmailToken(e.target.value)}
              />
            </div>
          ) : (
            <div className="field">
              <p>
                Enter your <strong>Recovery Key</strong> below. If you don't
                have one, you'll need to ask a member with admin access to
                re-invite you.
              </p>
              <textarea
                placeholder="Enter your Recovery Key..."
                value={recoveryKey}
                disabled={isLoading}
                required
                onChange={(e) => setRecoveryKey(e.target.value)}
              />
              {props.core.locked ? (
                <p className="important">
                  <h4>Important</h4>
                  If you have other accounts on this device, they will be
                  cleared when you load your Recovery Key, and you'll have to
                  recover those accounts separately. If you know your device's
                  passphrase, <Link to="/unlock">unlock it</Link> before using a
                  Recovery Key.
                </p>
              ) : (
                ""
              )}
            </div>
          ),
        ];

  return (
    <HomeContainer>
      <form
        className={styles.RedeemRecoveryKey}
        onSubmit={loadedRecoveryKey ? onAccept : onLoad}
      >
        <h3>
          <strong>Recover</strong> An Account
        </h3>
        {fields} {renderButtons()}
      </form>
    </HomeContainer>
  );
};

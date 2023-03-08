import React, { useState, useEffect, useLayoutEffect } from "react";
import { Component } from "@ui_types";
import { HomeContainer } from "../home/home_container";
import * as styles from "@styles";
import { CryptoStatus } from "../shared";
import { Client } from "@core/types";
import { SmallLoader } from "@images";
import * as R from "ramda";

let dispatchedAcceptInvite = false;

export const V1UpgradeAcceptInvite: Component = (props) => {
  const [startedUpgrade, setStartedUpgrade] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeComplete, setUpgradeComplete] = useState(false);

  const [deviceName, setDeviceName] = useState(
    props.core.defaultDeviceName ?? ""
  );

  useLayoutEffect(() => {
    if (
      !(
        props.core.v1UpgradeInviteToken && props.core.v1UpgradeEncryptionToken
      ) &&
      !startedUpgrade
    ) {
      props.history.push("/home");
    }
  }, [props.core.v1UpgradeInviteToken && props.core.v1UpgradeEncryptionToken]);

  useEffect(() => {
    if (upgrading && props.core.v1UpgradeError) {
      setUpgrading(false);
      setUpgradeComplete(true);
    }
  }, [props.core.v1UpgradeError]);

  useEffect(() => {
    if (upgrading && props.core.didAcceptInvite) {
      setUpgrading(false);
      setUpgradeComplete(true);
    }
  }, [props.core.didAcceptInvite]);

  useEffect(() => {
    if (
      props.core.loadedInvite &&
      !props.core.didAcceptInvite &&
      !upgradeComplete &&
      !dispatchedAcceptInvite
    ) {
      if (props.ui.accountId == props.core.loadedInvite.inviteeId) {
        props.dispatch({
          type: Client.ActionType.ACCEPT_INVITE,
          payload: {
            emailToken: props.core.v1UpgradeInviteToken!,
            encryptionToken: props.core.v1UpgradeEncryptionToken!,
            deviceName,
            isV1Upgrade: true,
          },
        });
        dispatchedAcceptInvite = true;
      } else {
        props.setUiState({ accountId: props.core.loadedInvite.inviteeId });
      }
    }
  }, [props.core.loadedInvite, props.ui.accountId]);

  const resetUpgradeButton = (label = "Cancel Upgrade") => (
    <button
      className="secondary"
      onClick={async (e) => {
        e.preventDefault();
        props.dispatch({
          type: Client.ActionType.RESET_V1_UPGRADE,
          payload: {},
        });
      }}
    >
      {label}
    </button>
  );

  if (
    !(props.core.v1UpgradeInviteToken && props.core.v1UpgradeEncryptionToken) &&
    !startedUpgrade
  ) {
    return (
      <HomeContainer anchor="center">
        <div className={styles.V1Upgrade}></div>
      </HomeContainer>
    );
  }

  return (
    <HomeContainer anchor="center">
      <div className={styles.V1Upgrade}>
        <h3>
          <strong>Upgrade</strong> From V1
        </h3>

        {upgrading ? (
          <form>
            <div className="field">
              <SmallLoader />
              <p className="org-import-status">Upgrading...</p>
              <CryptoStatus {...props} />
            </div>
          </form>
        ) : upgradeComplete ? (
          props.core.v1UpgradeError ? (
            <form>
              <p>
                There was a problem finishing the upgrade. Please contact{" "}
                <strong>support@envkey.com</strong> for help.
              </p>
              <p className="error">
                {JSON.stringify(props.core.v1UpgradeError)}
              </p>
              <div className="buttons">
                {resetUpgradeButton("Back To Home")}
              </div>
            </form>
          ) : (
            <form>
              <div>
                <p className="org-import-status">Your upgrade has finished!</p>
              </div>
              <div className="buttons">
                <button
                  className="primary"
                  onClick={(e) => {
                    e.preventDefault();
                    const latestOrg = R.last(
                      R.sortBy(
                        R.prop("lastAuthAt"),
                        Object.values(
                          props.core.orgUserAccounts
                        ) as Client.ClientUserAuth[]
                      )
                    );
                    props.history.push(`/org/${latestOrg!.orgId}`);
                  }}
                >
                  Go To Your V2 Org →
                </button>
              </div>
            </form>
          )
        ) : (
          <form>
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

            <div className="buttons">
              {resetUpgradeButton()}
              <button
                className="primary"
                onClick={async (e) => {
                  e.preventDefault();
                  setUpgrading(true);
                  setStartedUpgrade(true);

                  await props.dispatch({
                    type: Client.ActionType.LOAD_INVITE,
                    payload: {
                      emailToken: props.core.v1UpgradeInviteToken!,
                      encryptionToken: props.core.v1UpgradeEncryptionToken!,
                      isV1Upgrade: true,
                    },
                  });
                }}
              >
                Finish Upgrade →
              </button>
            </div>
          </form>
        )}
      </div>
    </HomeContainer>
  );
};

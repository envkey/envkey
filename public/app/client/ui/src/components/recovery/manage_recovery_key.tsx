import React, { useState, useEffect, useMemo } from "react";
import { OrgComponent } from "@ui_types";
import { Client } from "@core/types";
import * as g from "@core/lib/graph";
import { twitterShortTs } from "@core/lib/utils/date";
import * as styles from "@styles";
import { SmallLoader } from "@images";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { wait } from "@core/lib/utils/wait";
import { logAndAlertError } from "@ui_lib/errors";
import { CryptoStatus } from "../shared";

export const ManageRecoveryKey: OrgComponent<
  {},
  { requireRecoveryKey?: true; onClear?: () => any }
> = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;
  const auth = props.core.orgUserAccounts[currentUserId]!;
  const org = g.graphTypes(graph).org;

  const activeRecoveryKey = useMemo(
    () => g.getActiveRecoveryKeysByUserId(graph)[currentUserId],
    [graphUpdatedAt]
  );

  const [generating, setGenerating] = useState(false);
  const [awaitingMinDelay, setAwaitingMinDelay] = useState(false);

  useEffect(() => {
    return () => {
      props.dispatch({ type: Client.ActionType.CLEAR_GENERATED_RECOVERY_KEY });
    };
  }, []);

  useEffect(() => {
    if (
      (props.core.generatedRecoveryKey ||
        props.core.generateRecoveryKeyError) &&
      generating &&
      !awaitingMinDelay
    ) {
      setGenerating(false);
    }
  }, [props.core.isGeneratingRecoveryKey, awaitingMinDelay]);

  if (props.core.generateRecoveryKeyError) {
    console.log(
      "generate recovery key error:",
      props.core.generateRecoveryKeyError
    );
  }

  const genLabel = activeRecoveryKey
    ? "Regenerate Recovery Key"
    : "Generate Recovery Key";

  const generateButton = props.requireRecoveryKey ? (
    ""
  ) : (
    <div className="buttons">
      <button
        className="primary"
        disabled={generating}
        onClick={() => {
          setGenerating(true);
          if (!props.requireRecoveryKey) {
            setAwaitingMinDelay(true);
            wait(MIN_ACTION_DELAY_MS).then(() => setAwaitingMinDelay(false));
          }
          props
            .dispatch({ type: Client.ActionType.CREATE_RECOVERY_KEY })
            .then((res) => {
              if (!res.success) {
                logAndAlertError(
                  `There was a problem generating the recovery key.`,
                  (res.resultAction as any)?.payload
                );
              }
            });
        }}
      >
        {generating ? "Regenerating..." : genLabel}
      </button>
    </div>
  );

  if (
    !props.requireRecoveryKey &&
    (awaitingMinDelay ||
      (activeRecoveryKey &&
        !(
          props.core.generateRecoveryKeyError || props.core.generatedRecoveryKey
        )))
  ) {
    return (
      <div className={styles.SettingsManageRecoveryKey}>
        {props.requireRecoveryKey ? (
          ""
        ) : (
          <h3>
            Your <strong>Recovery Key</strong>
          </h3>
        )}

        <div className="active">
          <div>
            <span className="title">Recovery key active</span>
            <span className="subtitle">
              {generating
                ? ""
                : twitterShortTs(activeRecoveryKey!.createdAt, props.ui.now)}
            </span>
          </div>
        </div>
        <div className="buttons">{generateButton}</div>
        {generating ? <CryptoStatus {...props} /> : ""}
      </div>
    );
  }

  return (
    <div
      className={
        (props.requireRecoveryKey ? "" : styles.SettingsManageRecoveryKey) +
        " " +
        styles.ManageRecoveryKey
      }
    >
      {props.core.generateRecoveryKeyError ? (
        <div>
          <p className="error">
            There was a problem generating your Recovery Key.
          </p>
        </div>
      ) : (
        ""
      )}
      {props.core.generatedRecoveryKey || props.requireRecoveryKey ? (
        <div>
          <div className="field">
            <label>
              Your <strong>{org.name}</strong> Recovery Key
            </label>
            <div className="recovery-key">
              {props.core.generatedRecoveryKey
                ? [
                    ...props.core.generatedRecoveryKey.encryptionKey.split(" "),
                    auth.hostType == "self-hosted" ? auth.hostUrl : "",
                  ]
                    .filter(Boolean)
                    .map((value, i) => (
                      <span>
                        {i > 0 && i % 4 == 0 ? <br /> : ""}
                        {value}{" "}
                      </span>
                    ))
                : [<SmallLoader />]}
            </div>
            {props.core.generatedRecoveryKey ? "" : <CryptoStatus {...props} />}
          </div>
          <p>
            Your Recovery Key allows you to get back in to the org if you lose
            access to your device or forget your passphrase. Keep it safe and
            make sure you can retrieve it even if you lose this device.
          </p>

          <p className="important">
            <h4>Important</h4>
            If you lose your Recovery Key and there's no other user in your org
            with sufficient access to re-invite you, some or all of your org's
            data could be lost forever.
          </p>

          <p>
            This key won't be shown again, but you can always generate a new one
            in the <strong>My Org</strong> section.
          </p>
          <div className="buttons">
            <button
              className="primary"
              onClick={() => {
                props.dispatch({
                  type: Client.ActionType.CLEAR_GENERATED_RECOVERY_KEY,
                });
                if (props.onClear) {
                  props.onClear();
                }
              }}
            >
              {props.requireRecoveryKey ? "Continue" : "Done"}
            </button>
          </div>
        </div>
      ) : (
        generateButton
      )}
    </div>
  );
};

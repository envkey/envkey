import React, { useMemo } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Rbac } from "@core/types";
import * as styles from "@styles";
import * as g from "@core/lib/graph";
import { SvgImage } from "@images";

export const AppLocalKeysOnboard: OrgComponent<{}, { appId: string }> = (
  props
) => {
  return (
    <div className={styles.OnboardHelp + " onboard-app-envkeys"}>
      <span
        className="close"
        onClick={() => {
          props.setUiState({ closedOnboardAppLocalKeys: true });
        }}
      >
        <SvgImage type="x" />
      </span>

      <p>
        You can generate local keys <strong>manually</strong> below, but
        normally <em>you shouldn't need to.</em>
      </p>

      <p>
        Local keys load your app's development environment or a branch of the
        development environment. They're generated{" "}
        <strong>automatically</strong> the first time you start an
        EnvKey-enabled app--you just need to be sure you have EnvKey installed,
        you're signed in, and your app has a <strong>.envkey</strong> file in
        its root directory.
      </p>
      <p>
        If your app is missing a <strong>.envkey</strong> file, you can add it
        by running the <code>envkey init</code> command in your app's root
        directory.
      </p>
      <p>
        Local keys are tied to the <strong>device</strong> they're generated on.
        If a device is revoked, all its local keys will also be revoked.
      </p>
    </div>
  );
};

export const AppServersOnboard: OrgComponent<{}, { appId: string }> = (
  props
) => {
  return (
    <div className={styles.OnboardHelp + " onboard-app-envkeys"}>
      <span
        className="close"
        onClick={() => {
          props.setUiState({ closedOnboardAppServers: true });
        }}
      >
        <SvgImage type="x" />
      </span>

      <p>
        To connect <strong>servers</strong> to an EnvKey environment defined in
        the <span className="tab">Environments</span> tab, just click the{" "}
        <em>Generate New Server Key</em> button below, and choose an
        environment.
      </p>
    </div>
  );
};

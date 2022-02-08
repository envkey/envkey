import React, { useMemo } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Rbac } from "@core/types";
import * as styles from "@styles";
import * as g from "@core/lib/graph";
import { SvgImage } from "@images";
import { style } from "typestyle";

export const CliUsersOnboard: OrgComponent = (props) => {
  return (
    <div
      className={
        styles.OnboardHelp + " onboard-cli-keys " + style({ marginBottom: 30 })
      }
    >
      <span
        className="close"
        onClick={() => {
          props.setUiState({ closedOnboardCLIKeys: true });
        }}
      >
        <SvgImage type="x" />
      </span>
      <p>
        CLI Keys let you interface <em>programatically</em> with EnvKey's CLI in{" "}
        <strong>Auto Mode</strong>. You can assign them an Org Role and access
        to apps just like a human user, and they can do just about anything a
        human can do. They're useful for CI/CD and automation tasks.
      </p>

      <p>
        If you just want to load config, locally or on a server, you're better
        off with a <strong>Server or Local Development ENVKEY</strong>.
      </p>

      <p>
        If you want to use the EnvKey CLI instead of the UI, you don't need a
        CLI Key for that either. You can use the CLI in{" "}
        <strong>Interactive Mode</strong>. Type <code>envkey</code> into a shell
        to see the available commands.
      </p>
    </div>
  );
};

import React, { useLayoutEffect, useEffect, useState } from "react";
import { OrgComponent } from "@ui_types";
import { Client } from "@core/types";
import { cliUserRoute } from "./helpers";
import * as g from "@core/lib/graph";
import * as styles from "@styles";
import copy from "copy-text-to-clipboard";

export const GeneratedCliUsers: OrgComponent<
  { appId?: string },
  { orgImport?: true }
> = (props) => {
  const generatedCliUsers = props.core.generatedCliUsers;
  const numGenerated = generatedCliUsers.length;
  const appId = props.routeParams.appId;

  const [clearing, setClearing] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number>();

  const dispatchClearGenerated = () =>
    props.dispatch({ type: Client.ActionType.CLEAR_GENERATED_CLI_USERS });

  if (!props.orgImport) {
    useLayoutEffect(() => {
      if (numGenerated == 0) {
        props.history.replace(cliUserRoute(props, "/new-cli-key"));
      }
    }, [numGenerated == 0]);

    useEffect(() => {
      return () => {
        if (!clearing) {
          dispatchClearGenerated();
        }
      };
    }, [clearing]);

    if (numGenerated == 0) {
      return <div></div>;
    }
  }

  const renderGenerated = (
    generated: Client.GeneratedCliUserResult,
    i: number
  ) => {
    const {
      cliKey,
      user: { name },
    } = generated;

    return (
      <div>
        <div className="name">
          <label>
            <strong>{name}</strong>
          </label>
        </div>
        <div className="token">
          <div>
            <span>
              <label>CLI_ENVKEY</label>
              {cliKey.substr(0, 20)}…
            </span>
            <button
              onClick={() => {
                setCopiedIndex(i);
                copy(cliKey);
              }}
            >
              Copy
            </button>
          </div>
        </div>
        {copiedIndex === i ? <small>Copied.</small> : ""}
      </div>
    );
  };

  return (
    <div
      className={
        (props.orgImport ? "" : styles.OrgContainer) +
        " " +
        styles.GeneratedInvites
      }
    >
      {props.orgImport ? (
        ""
      ) : (
        <h3>
          CLI Key <strong>Generated</strong>
        </h3>
      )}

      <p>
        {props.core.generatedCliUsers.length == 1
          ? "Your CLI Key has"
          : `${props.core.generatedCliUsers.length} CLI Keys have`}{" "}
        been generated. To pass{" "}
        {props.core.generatedCliUsers.length == 1 ? "it" : "one"} to the EnvKey
        CLI, either set it as a <code>CLI_ENVKEY</code> environment variable or
        use the {props.orgImport ? "" : <br />}
        <code>--cli-envkey</code> flag.
      </p>

      <div className="generated-invites">
        {generatedCliUsers.map(renderGenerated)}
      </div>

      {props.orgImport ? (
        ""
      ) : (
        <div className="buttons">
          {appId ? (
            <button
              className="secondary"
              onClick={async () => {
                dispatchClearGenerated();
                props.history.push(
                  props.location.pathname.replace(
                    "/add/generated-cli-key",
                    "/list"
                  )
                );
              }}
              disabled={clearing}
            >
              Done
            </button>
          ) : (
            ""
          )}

          <button
            className="primary"
            onClick={async () => {
              setClearing(true);
              dispatchClearGenerated();
              props.history.push(cliUserRoute(props, "/new-cli-key"));
            }}
            disabled={clearing}
          >
            Create Another CLI Key
          </button>
        </div>
      )}
    </div>
  );
};

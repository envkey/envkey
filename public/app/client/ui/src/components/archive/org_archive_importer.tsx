import React, { useState, useEffect, useMemo } from "react";
import { OrgComponent } from "@ui_types";
import { Link } from "react-router-dom";
import { Client } from "@core/types";
import * as g from "@core/lib/graph";
import * as ui from "@ui";
import * as styles from "@styles";
import { wait } from "@core/lib/utils/wait";
import { SmallLoader } from "@images";
import { style } from "typestyle";
import { logAndAlertError } from "@ui_lib/errors";

let refreshingState = false;

export const OrgArchiveImporter: OrgComponent<
  {},
  { filePath: string; close: () => void }
> = (props) => {
  const { graph } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const [encryptionKey, setEncryptionKey] = useState("");
  const [importOrgUsers, setImportOrgUsers] = useState(true);
  const [importing, setImporting] = useState(false);

  const [importComplete, setImportComplete] = useState(false);

  const [selectedImportTab, setSelectedImportTab] = useState<
    "invites" | "cli-keys" | "envkeys"
  >("invites");

  const numGeneratedEnvkeys = useMemo(
    () => Object.keys(props.core.generatedEnvkeys).length,
    [props.core]
  );

  useEffect(() => {
    (async () => {
      if (importing && !props.core.isImportingOrg) {
        setImportComplete(!Boolean(props.core.importOrgError));
        setImporting(false);
        refreshingState = false;
        await props.refreshCoreState();
      } else if (importing && props.core.isImportingOrg) {
        if (!refreshingState) {
          refreshingState = true;
          await props.refreshCoreState();
          while (refreshingState) {
            await wait(1000);
            await props.refreshCoreState();
          }
        }
      }
    })();
  }, [props.core.isImportingOrg]);

  const clearGenerated = () => {
    props.dispatch({
      type: Client.ActionType.CLEAR_GENERATED_INVITES,
    });
    props.dispatch({
      type: Client.ActionType.CLEAR_GENERATED_CLI_USERS,
    });
    props.dispatch({
      type: Client.ActionType.CLEAR_ALL_GENERATED_ENVKEYS,
    });
  };

  const startImport = async () => {
    if (!encryptionKey) {
      return;
    }

    setImporting(true);
    clearGenerated();

    props
      .dispatch({
        type: Client.ActionType.IMPORT_ORG,
        payload: {
          filePath: props.filePath,
          encryptionKey,
          importOrgUsers,
        },
      })
      .then((res) => {
        if (!res.success) {
          logAndAlertError(
            "There was a problem starting the import.",
            (res.resultAction as any)?.payload
          );
        }
      });
  };

  const renderImportCompleteView = () => {
    if (selectedImportTab == "invites") {
      return <ui.GeneratedInvites {...props} orgImport={true} />;
    } else if (selectedImportTab == "cli-keys") {
      return <ui.GeneratedCliUsers {...props} orgImport={true} />;
    } else if (selectedImportTab == "envkeys") {
      return <ui.OrgImportEnvkeys {...props} />;
    }
  };

  const renderContents = () => {
    if (props.core.importOrgError) {
      const message = (props.core.importOrgError.error as Error).message;
      const licenseError =
        message == "License expired" || message == "License limits exceeded";

      const license = g.graphTypes(graph).license;
      let copy: React.ReactNode;
      if (message == "License expired") {
        copy = (
          <p>
            {[
              `Your organization's ${
                license.provisional ? "provisional " : ""
              }license has `,
              <strong>expired.</strong>,
              [" Please update your license, then try again."],
            ]}
          </p>
        );
      } else if (message == "License limits exceeded") {
        copy = (
          <p>
            {[
              "This import would exceed your organization's limits of ",
              <strong>{license.maxDevices} active or pending devices</strong>,
              " and ",
              <strong>{license.maxServerEnvkeys} Server ENVKEYs.</strong>,
              [" Please update your license, then try again."],
            ]}
          </p>
        );
      } else {
        copy = <p className="error">{message}.</p>;
      }

      const canManageBilling = g.authz.hasOrgPermission(
        graph,
        currentUserId,
        "org_manage_billing"
      );

      return [
        <h3>
          <strong>Import</strong> Error
        </h3>,

        copy,

        <div className="buttons">
          <button className="secondary" onClick={props.close}>
            Done
          </button>
          {licenseError && canManageBilling ? (
            <Link className="primary" to={props.orgRoute("/my-org/billing")}>
              Go To Billing →
            </Link>
          ) : (
            ""
          )}
        </div>,
      ];
    }

    if (importComplete) {
      return [
        <h3>
          <strong>Import</strong> Complete
        </h3>,

        <p>
          The import has completed successfully. You'll need to finish{" "}
          <strong>re-inviting</strong> each user, then <strong>replace</strong>{" "}
          your regenerated CLI keys and server ENVKEYs wherever they're used.
          When you're done, scroll all the way down and click the{" "}
          <em>Finish And Close</em> button.
        </p>,

        <div className="import-complete-tabs">
          <div
            className={selectedImportTab == "invites" ? "selected" : ""}
            onClick={() => setSelectedImportTab("invites")}
          >
            Invites <small>{props.core.generatedInvites.length}</small>
          </div>
          <div
            className={selectedImportTab == "cli-keys" ? "selected" : ""}
            onClick={() => setSelectedImportTab("cli-keys")}
          >
            CLI Keys <small>{props.core.generatedCliUsers.length}</small>
          </div>
          <div
            className={selectedImportTab == "envkeys" ? "selected" : ""}
            onClick={() => setSelectedImportTab("envkeys")}
          >
            ENVKEYs <small>{numGeneratedEnvkeys}</small>
          </div>
        </div>,

        renderImportCompleteView(),

        <div className={"field " + style({ marginTop: 60 })}>
          <button
            className="primary"
            onClick={() => {
              clearGenerated();
              props.close();
            }}
          >
            Finish And Close
          </button>
        </div>,
      ];
    } else if (importing) {
      return [
        <h3>
          <strong>Importing</strong> Org Archive
        </h3>,

        <div className="field">
          <SmallLoader />
          <p className="org-import-status">
            {props.core.importOrgStatus ?? "Starting import"}...
          </p>
        </div>,
      ];
    }

    return [
      <h3>
        <strong>Import</strong> Org Archive
      </h3>,
      <div className="field">
        <label>Encryption Key</label>
        <input
          autoFocus={true}
          value={encryptionKey}
          placeholder="Enter encryption key..."
          onChange={(e) => setEncryptionKey(e.target.value)}
        />
      </div>,

      <p>
        Automatically re-invited users will use{" "}
        <strong>email authentication.</strong> If you want to use{" "}
        <strong>SSO</strong>, re-invite them yourself after the import finishes
        and you've configured SSO.
      </p>,
      <div
        className={"field checkbox" + (importOrgUsers ? " selected" : "")}
        onClick={() => setImportOrgUsers(!importOrgUsers)}
      >
        <label>Automatically Re-Invite Users?</label>
        <input type="checkbox" checked={importOrgUsers} />
      </div>,

      <div className="field">
        <button
          className="primary"
          onClick={startImport}
          disabled={encryptionKey.length != 25}
        >
          Start Import
        </button>
      </div>,
    ];
  };

  return (
    <div className={styles.OrgArchiveImporter}>
      <div
        className={"overlay" + (importing || importComplete ? " disabled" : "")}
        onClick={() => (importing || importComplete ? null : props.close())}
      >
        <span className="back">
          <span>← Back</span>
        </span>
      </div>

      <div className="modal">{renderContents()}</div>
    </div>
  );
};

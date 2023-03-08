import React, { useState, useEffect, useMemo, useLayoutEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Link } from "react-router-dom";
import { Client } from "@core/types";
import * as g from "@core/lib/graph";
import * as ui from "@ui";
import * as styles from "@styles";
import { SmallLoader, SvgImage } from "@images";
import { style } from "typestyle";
import { logAndAlertError } from "@ui_lib/errors";

type ImportStep = "orgUsers" | "cliUsers" | "apps" | "blocks" | "servers";

export const OrgArchiveImporter: OrgComponent<
  {},
  { filePath: string; close: () => void }
> = (props) => {
  const { graph } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const [encryptionKey, setEncryptionKey] = useState("");

  const [importOrgUsers, setImportOrgUsers] = useState(true);
  const [importCliUsers, setImportCliUsers] = useState(true);
  const [importServers, setImportServers] = useState(true);
  const [regenServerKeys, setRegenServerKeys] = useState(true);

  const [orgUserIds, setOrgUserIds] = useState<string[]>();
  const [cliUserIds, setCliUserIds] = useState<string[]>();
  const [appIds, setAppIds] = useState<string[]>();
  const [blockIds, setBlockIds] = useState<string[]>();

  const [decrypting, setDecrypting] = useState(false);
  const [importing, setImporting] = useState(false);

  const [importStep, setImportStep] = useState<ImportStep>();
  const [selectAllForStep, setSelectAllForStep] = useState(true);

  const [importComplete, setImportComplete] = useState(false);

  const [selectedImportTab, setSelectedImportTab] = useState<
    "invites" | "cli-keys" | "envkeys"
  >("invites");

  const numGeneratedEnvkeys = useMemo(
    () => Object.keys(props.core.generatedEnvkeys).length,
    [props.core]
  );

  useEffect(() => {
    if (importing && !props.core.isImportingOrg) {
      setImportComplete(!Boolean(props.core.importOrgError));
      setImporting(false);
      props.setUiState({ importStatus: undefined });
    } else if (props.core.isImportingOrg && !importing) {
      setImporting(true);
    }
  }, [props.core.isImportingOrg]);

  useLayoutEffect(() => {
    if (decrypting && !props.core.isDecryptingOrgArchive) {
      setDecrypting(false);
    }

    if (props.core.filteredOrgArchive && !importStep) {
      let nextStep: ImportStep | undefined;
      if (props.core.filteredOrgArchive.orgUsers.length > 0) {
        nextStep = "orgUsers";
      } else if (props.core.filteredOrgArchive.cliUsers.length > 0) {
        nextStep = "cliUsers";
      } else if (props.core.filteredOrgArchive.apps.length > 0) {
        nextStep = "apps";
      } else if (props.core.filteredOrgArchive.blocks.length > 0) {
        nextStep = "blocks";
      } else if (props.core.filteredOrgArchive.servers.length > 0) {
        nextStep = "servers";
      }
      setImportStep(nextStep);
    }
  }, [props.core.isDecryptingOrgArchive]);

  useEffect(() => {
    if (!importServers && regenServerKeys) {
      setRegenServerKeys(false);
    }
  }, [importServers]);

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

  const decryptArchive = async () => {
    if (!encryptionKey) {
      return;
    }

    setDecrypting(true);

    props
      .dispatch({
        type: Client.ActionType.DECRYPT_ORG_ARCHIVE,
        payload: {
          filePath: props.filePath,
          encryptionKey,
        },
      })
      .then((res) => {
        if (!res.success) {
          logAndAlertError(
            "There was a problem decrypting the archive.",
            (res.resultAction as any)?.payload
          );
        }
      });
  };

  const startImport = async () => {
    setImporting(true);
    clearGenerated();

    props
      .dispatch({
        type: Client.ActionType.IMPORT_ORG,
        payload: {
          importOrgUsers,
          importCliUsers,
          importServers,
          importLocalKeys: false,
          regenServerKeys,
          importOrgUserIds: orgUserIds,
          importCliUserIds: cliUserIds,
          importEnvParentIds:
            appIds || blockIds
              ? [...(appIds ?? []), ...(blockIds ?? [])]
              : undefined,
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
              "This import would exceed your organization's limit of ",
              <strong>{license.maxUsers} active or pending users</strong>,
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

    const header = (
      <h3>
        <strong>Import</strong> Org Archive
      </h3>
    );

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
            {props.ui.importStatus ??
              props.core.importOrgStatus ??
              "Starting import"}
            ...
          </p>
        </div>,
      ];
    } else if (decrypting) {
      return [
        <h3>
          <strong>Decrypting</strong> Org Archive
        </h3>,

        <div className="field">
          <SmallLoader />
          <p className="org-import-status">Decrypting and parsing archive...</p>
        </div>,
      ];
    } else if (props.core.filteredOrgArchive) {
      if (importStep == "orgUsers") {
        let nextStep: ImportStep | undefined;
        if (props.core.filteredOrgArchive.cliUsers.length > 0) {
          nextStep = "cliUsers";
        } else if (props.core.filteredOrgArchive.apps.length > 0) {
          nextStep = "apps";
        } else if (props.core.filteredOrgArchive.blocks.length > 0) {
          nextStep = "blocks";
        } else if (props.core.filteredOrgArchive.servers.length > 0) {
          nextStep = "servers";
        }

        return [
          header,
          <h4>Users</h4>,
          <p>
            Automatically re-invited users will use{" "}
            <strong>email authentication.</strong> If you want to use{" "}
            <strong>SSO</strong>, re-invite them yourself after the import
            finishes and you've configured SSO.
          </p>,
          <div
            className={"field checkbox" + (importOrgUsers ? " selected" : "")}
            onClick={() => setImportOrgUsers(!importOrgUsers)}
          >
            <label>Automatically Re-Invite Users?</label>
            <input type="checkbox" checked={importOrgUsers} />
          </div>,

          <div className="field">
            <label>Re-Invite Everyone?</label>
            <div className="select">
              <select
                value={selectAllForStep ? "all" : "choose"}
                onChange={(e) => {
                  const selectAll = e.target.value == "all";
                  setSelectAllForStep(selectAll);
                  if (selectAll) {
                    setOrgUserIds(undefined);
                  }
                }}
              >
                <option value="all">Re-invite all users</option>
                <option value="choose">Select which users to re-invite</option>
              </select>
              <SvgImage type="down-caret" />
            </div>
          </div>,

          selectAllForStep ? (
            ""
          ) : (
            <div className="field">
              <label>Select Users</label>
              <ui.CheckboxMultiSelect
                winHeight={props.winHeight}
                noSubmitButton={true}
                emptyText={`No users to import`}
                items={props.core.filteredOrgArchive.orgUsers.map((orgUser) => {
                  const name = [orgUser.firstName, orgUser.lastName].join(" ");
                  return {
                    label: (
                      <label>
                        {name} <span className="small">{orgUser.email}</span>
                      </label>
                    ),
                    searchText: name,
                    id: orgUser.id,
                  };
                })}
                onChange={(ids) => setOrgUserIds(ids)}
              />
            </div>
          ),

          <div className="field">
            <button
              className="primary"
              onClick={() => {
                if (nextStep) {
                  setImportStep(nextStep);
                  setSelectAllForStep(true);
                } else {
                  startImport();
                }
              }}
              disabled={
                importOrgUsers &&
                !selectAllForStep &&
                (!orgUserIds || orgUserIds.length == 0)
              }
            >
              {nextStep ? "Next" : "Start Import"}
            </button>
          </div>,
        ];
      } else if (importStep == "cliUsers") {
        let nextStep: ImportStep | undefined;
        if (props.core.filteredOrgArchive.apps.length > 0) {
          nextStep = "apps";
        } else if (props.core.filteredOrgArchive.blocks.length > 0) {
          nextStep = "blocks";
        } else if (props.core.filteredOrgArchive.servers.length > 0) {
          nextStep = "servers";
        }

        return [
          header,
          <h4>CLI Keys</h4>,
          <div
            className={"field checkbox" + (importCliUsers ? " selected" : "")}
            onClick={() => setImportCliUsers(!importCliUsers)}
          >
            <label>Automatically Regenerate CLI Keys?</label>
            <input type="checkbox" checked={importCliUsers} />
          </div>,

          <div className="field">
            <label>Regenerate All?</label>
            <div className="select">
              <select
                value={selectAllForStep ? "all" : "choose"}
                onChange={(e) => {
                  const selectAll = e.target.value == "all";
                  setSelectAllForStep(selectAll);
                  if (selectAll) {
                    setCliUserIds(undefined);
                  }
                }}
              >
                <option value="all">Regenerate all CLI keys</option>
                <option value="choose">
                  Select which CLI keys to regenerate
                </option>
              </select>
              <SvgImage type="down-caret" />
            </div>
          </div>,

          selectAllForStep ? (
            ""
          ) : (
            <div className="field">
              <label>Select CLI Keys</label>
              <ui.CheckboxMultiSelect
                winHeight={props.winHeight}
                noSubmitButton={true}
                emptyText={`No CLI keys to import`}
                items={props.core.filteredOrgArchive.cliUsers.map((cliUser) => {
                  return {
                    label: <label>{cliUser.name}</label>,
                    searchText: cliUser.name,
                    id: cliUser.id,
                  };
                })}
                onChange={(ids) => setCliUserIds(ids)}
              />
            </div>
          ),

          <div className="field">
            <button
              className="primary"
              onClick={() => {
                if (nextStep) {
                  setImportStep(nextStep);
                  setSelectAllForStep(true);
                } else {
                  startImport();
                }
              }}
              disabled={
                importCliUsers &&
                !selectAllForStep &&
                (!cliUserIds || cliUserIds.length == 0)
              }
            >
              {nextStep ? "Next" : "Start Import"}
            </button>
          </div>,
        ];
      } else if (importStep == "apps") {
        let nextStep: ImportStep | undefined;
        if (props.core.filteredOrgArchive.blocks.length > 0) {
          nextStep = "blocks";
        } else if (
          props.core.filteredOrgArchive.servers.length > 0 &&
          (!appIds || appIds.length > 0)
        ) {
          nextStep = "servers";
        }

        return [
          header,
          <h4>Apps</h4>,
          <div className="field">
            <label>Import All Apps?</label>
            <div className="select">
              <select
                value={selectAllForStep ? "all" : "choose"}
                onChange={(e) => {
                  const selectAll = e.target.value == "all";
                  setSelectAllForStep(selectAll);
                  if (selectAll) {
                    setAppIds(undefined);
                  }
                }}
              >
                <option value="all">Import all apps</option>
                <option value="choose">Select which apps to import</option>
              </select>
              <SvgImage type="down-caret" />
            </div>
          </div>,

          selectAllForStep ? (
            ""
          ) : (
            <div className="field">
              <label>Select Apps</label>
              <ui.CheckboxMultiSelect
                winHeight={props.winHeight}
                noSubmitButton={true}
                emptyText={`No apps to import`}
                items={props.core.filteredOrgArchive.apps.map((app) => {
                  return {
                    label: <label>{app.name}</label>,
                    searchText: app.name,
                    id: app.id,
                  };
                })}
                onChange={(ids) => setAppIds(ids)}
              />
            </div>
          ),

          <div className="field">
            <button
              className="primary"
              onClick={() => {
                if (nextStep) {
                  setImportStep(nextStep);
                  setSelectAllForStep(true);
                } else {
                  startImport();
                }
              }}
            >
              {nextStep ? "Next" : "Start Import"}
            </button>
          </div>,
        ];
      } else if (importStep == "blocks") {
        let nextStep: ImportStep | undefined;
        if (
          props.core.filteredOrgArchive.servers.length > 0 &&
          (!appIds || appIds.length > 0)
        ) {
          nextStep = "servers";
        }

        return [
          header,
          <h4>Blocks</h4>,
          <div className="field">
            <label>Import All Blocks?</label>
            <div className="select">
              <select
                value={selectAllForStep ? "all" : "choose"}
                onChange={(e) => {
                  const selectAll = e.target.value == "all";
                  setSelectAllForStep(selectAll);
                  if (selectAll) {
                    setBlockIds(undefined);
                  }
                }}
              >
                <option value="all">Import all blocks</option>
                <option value="choose">Select which blocks to import</option>
              </select>
              <SvgImage type="down-caret" />
            </div>
          </div>,

          selectAllForStep ? (
            ""
          ) : (
            <div className="field">
              <label>Select Blocks</label>
              <ui.CheckboxMultiSelect
                winHeight={props.winHeight}
                noSubmitButton={true}
                emptyText={`No blocks to import`}
                items={props.core.filteredOrgArchive.blocks.map((block) => {
                  return {
                    label: <label>{block.name}</label>,
                    searchText: block.name,
                    id: block.id,
                  };
                })}
                onChange={(ids) => setBlockIds(ids)}
              />
            </div>
          ),

          <div className="field">
            <button
              className="primary"
              onClick={() => {
                if (nextStep) {
                  setImportStep(nextStep);
                  setSelectAllForStep(true);
                } else {
                  startImport();
                }
              }}
            >
              {nextStep ? "Next" : "Start Import"}
            </button>
          </div>,
        ];
      } else if (importStep == "servers") {
        return [
          header,
          <h4>Servers</h4>,
          <p>
            If you have many servers, you might prefer to regenerate them
            gradually rather than automatically as part of the import. You can
            recreate your servers as placeholders, but wait on generating their
            associated ENVKEYs by checking{" "}
            <strong>Automatically Re-Create Servers?</strong> below, but leaving{" "}
            <strong>Regenerate Server ENVKEYs?</strong> unchecked.
          </p>,

          <div
            className={"field checkbox" + (importServers ? " selected" : "")}
            onClick={() => setImportServers(!importServers)}
          >
            <label>Automatically Re-Create Servers?</label>
            <input type="checkbox" checked={importServers} />
          </div>,

          <div
            className={
              "field checkbox" +
              (regenServerKeys ? " selected" : "") +
              (importServers ? "" : " disabled")
            }
            onClick={() => {
              if (importServers) {
                setRegenServerKeys(!regenServerKeys);
              }
            }}
          >
            <label>Regenerate Server ENVKEYs?</label>
            <input
              type="checkbox"
              disabled={!importServers}
              checked={regenServerKeys}
            />
          </div>,

          <div className="field">
            <button className="primary" onClick={startImport}>
              Start Import
            </button>
          </div>,
        ];
      }
    }

    if (props.core.filteredOrgArchive) {
      return [
        header,
        <p>Archive decrypted and parsed successfully.</p>,
        <div className="field">
          <button className="primary" onClick={startImport}>
            Start Import
          </button>
        </div>,
      ];
    }

    return [
      header,
      <div className="field">
        <label>Encryption Key</label>
        <input
          autoFocus={true}
          value={encryptionKey}
          placeholder="Enter encryption key..."
          onChange={(e) => setEncryptionKey(e.target.value)}
        />
      </div>,

      <div className="field">
        <button
          className="primary"
          onClick={decryptArchive}
          disabled={!encryptionKey}
        >
          Next
        </button>
      </div>,
    ];
  };

  return (
    <div className={styles.OrgArchiveImporter}>
      <div
        className={"overlay" + (importing || importComplete ? " disabled" : "")}
        onClick={() => {
          if (!importing && !importComplete) {
            props.dispatch({
              type: Client.ActionType.RESET_ORG_IMPORT,
            });
            props.close();
          }
        }}
      >
        <span className="back">
          <span>← Back</span>
        </span>
      </div>

      <div className="modal">{renderContents()}</div>
    </div>
  );
};

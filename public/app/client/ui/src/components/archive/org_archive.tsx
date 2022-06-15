import React, { useState } from "react";
import { OrgComponent } from "@ui_types";
import { Client } from "@core/types";
import * as g from "@core/lib/graph";
import * as styles from "@styles";
import { style } from "typestyle";
import { SmallLoader } from "@images";
import { ElectronWindow } from "@core/types/electron";
import { CopyableDisplay } from "../settings/copyable_display";
import { OrgArchiveImporter } from "./org_archive_importer";
import { logAndAlertError } from "@ui_lib/errors";

declare var window: ElectronWindow;

export const OrgArchiveV1: OrgComponent = (props) => {
  const { graph } = props.core;
  const { org } = g.graphTypes(graph);

  const [exporting, setExporting] = useState(false);
  const [exportEncryptionKey, setExportEncryptionKey] = useState("");
  const [debugData, setDebugData] = useState(false);

  const [importFilePath, setImportFilePath] = useState("");

  const exportArchive = async () => {
    const fileName = `${debugData ? "DEBUG-" : ""}${org.name
      .split(" ")
      .join("-")
      .toLowerCase()}-${new Date().toISOString().slice(0, 10)}.envkey-archive`;

    const filePath = await window.electron.chooseFilePath(
      `Export EnvKey Archive`,
      fileName
    );

    if (filePath) {
      setExporting(true);

      const res = await props.dispatch({
        type: Client.ActionType.EXPORT_ORG,
        payload: { filePath, debugData },
      });

      setExporting(false);

      if (res.success) {
        const { encryptionKey } = (
          res.resultAction as { payload: { encryptionKey: string } }
        ).payload;

        setExportEncryptionKey(encryptionKey);
      } else {
        logAndAlertError(
          "There was a problem exporting the org archive.",
          (res.resultAction as any)?.payload
        );
      }
    }
  };

  const importArchive = async () => {
    const filePath = await window.electron.chooseFile(
      "Choose a .envkey-archive file to import",
      [{ extensions: ["envkey-archive"], name: "EnvKey Archive" }]
    );
    if (filePath) {
      setImportFilePath(filePath);
    }
  };

  const renderExportFields = () => {
    if (exporting) {
      return (
        <div className="field">
          <SmallLoader />
        </div>
      );
    }

    return exportEncryptionKey
      ? [
          <p>
            Your org archive was saved to disk successfully. To import it into a
            new org, you'll need the <strong>Encryption Key</strong> below.
          </p>,
          <CopyableDisplay
            {...props}
            label="Encryption Key"
            value={exportEncryptionKey}
          />,
          <div className="field">
            <button
              className="primary"
              onClick={() => {
                setExporting(false);
                setExportEncryptionKey("");
                setDebugData(false);
              }}
            >
              Done
            </button>
          </div>,
        ]
      : [
          <p>
            Export all org data to an encrypted .envkey-archive file. This file
            can then be imported into a new org. Archives{" "}
            <strong>do not include</strong> logs or old environment versions.
          </p>,

          <div
            className={"field checkbox" + (debugData ? " selected" : "")}
            onClick={() => setDebugData(!debugData)}
          >
            <label>Export with obfuscated data for debugging</label>
            <input type="checkbox" checked={debugData} />
          </div>,

          <div className="field">
            <button className="primary" onClick={exportArchive}>
              Export Org
            </button>
          </div>,
        ];
  };

  return (
    <div className={styles.OrgContainer}>
      <h3>
        <strong>Import</strong> Org Archive
      </h3>
      <p>Import all data from an encrypted .envkey-archive file.</p>
      <div className="field">
        <button className="primary" onClick={importArchive}>
          Import Org
        </button>
      </div>
      {importFilePath ? (
        <OrgArchiveImporter
          {...props}
          filePath={importFilePath}
          close={() => setImportFilePath("")}
        />
      ) : (
        ""
      )}
      <h3>
        <strong>Export</strong> Org Archive
      </h3>
      {renderExportFields()}
    </div>
  );
};

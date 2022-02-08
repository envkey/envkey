import React, { useState, useMemo } from "react";
import { Client, Model } from "@core/types";
import { OrgComponent } from "@ui_types";
import * as R from "ramda";
import * as g from "@core/lib/graph";
import { getRawEnvWithAncestors, getRawEnv } from "@core/lib/client";
import { ElectronWindow } from "@core/types/electron";
import * as styles from "@styles";
import { SvgImage } from "@images";

declare var window: ElectronWindow;

type ExportFormat = "env" | "yaml" | "json";

export const EnvExport: OrgComponent = (props) => {
  const { graph, graphUpdatedAt, pendingEnvUpdates } = props.core;
  const searchParams = new URLSearchParams(props.location.search);
  const exportEnvironmentId = searchParams.get("exportEnvironmentId")!;

  const environment = graph[exportEnvironmentId] as
    | Model.Environment
    | undefined;

  const envParentId = environment
    ? environment.envParentId
    : exportEnvironmentId.split("|")[0];
  const envParent = graph[envParentId] as Model.EnvParent;

  const environmentName = g.getEnvironmentName(graph, exportEnvironmentId);

  const close = () => {
    props.history.push(
      props.location.pathname.replace(
        `?exportEnvironmentId=${exportEnvironmentId}`,
        ""
      )
    );
  };

  const [format, setFormat] = useState<ExportFormat>("env");
  const [includeAncestors, setIncludeAncestors] = useState(false);
  const [includePending, setIncludePending] = useState(true);
  const [exporting, setExporting] = useState(false);

  const hasBlocks = useMemo(() => {
    if (envParent.type != "app") {
      return false;
    }

    return (
      g.getConnectedBlockEnvironmentsForApp(
        graph,
        envParent.id,
        undefined,
        exportEnvironmentId
      ).length > 0
    );
  }, [graphUpdatedAt, exportEnvironmentId]);

  const hasPending = useMemo(() => {
    if (pendingEnvUpdates.length == 0) {
      return false;
    }

    const rawEnvFn = includeAncestors ? getRawEnvWithAncestors : getRawEnv;

    const [rawEnv, rawEnvWithPending] = [
      rawEnvFn(props.core, {
        envParentId,
        environmentId: exportEnvironmentId,
      }),
      rawEnvFn(
        props.core,
        {
          envParentId,
          environmentId: exportEnvironmentId,
        },
        true
      ),
    ];

    return !R.equals(rawEnv, rawEnvWithPending);
  }, [exportEnvironmentId, pendingEnvUpdates.length, includeAncestors]);

  return (
    <div className={styles.EnvExporter}>
      <div
        className="overlay"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
      >
        <span className="back">
          <span>← Back</span>
        </span>
      </div>
      <div className="modal">
        <h3>
          Export <strong>{environmentName}</strong>
        </h3>

        <div className="field">
          <label>Format</label>

          <div className="select">
            <select
              disabled={exporting}
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
            >
              <option value="env">.env (KEY=VAL)</option>
              <option value="yaml">.yaml</option>
              <option value="json">.json</option>
            </select>
            <SvgImage type="down-caret" />
          </div>
        </div>

        {!environment || environment.isSub || hasBlocks ? (
          <div className="field">
            <label>What to include?</label>
            <div className="select">
              <select
                value={includeAncestors ? "true" : "false"}
                onChange={(e) => setIncludeAncestors(e.target.value == "true")}
              >
                <option value="true">
                  {!environment
                    ? "Locals"
                    : environment.isSub
                    ? "Sub-environment"
                    : "Environment"}{" "}
                  merged with{" "}
                  {!environment || environment.isSub
                    ? environment
                      ? " base environment"
                      : " development environment"
                    : ""}
                  {(!environment || environment.isSub) && !hasBlocks
                    ? " and "
                    : ""}
                  {!hasBlocks ? "connected blocks" : ""}
                </option>
                <option value="false">
                  Export{" "}
                  {!environment
                    ? " locals only"
                    : environment.isSub
                    ? " this branch only"
                    : " this environment only"}
                </option>
              </select>
              <SvgImage type="down-caret" />
            </div>
          </div>
        ) : (
          ""
        )}

        {hasPending ? (
          <div className="field">
            <label>Include Pending Changes?</label>
            <div className="select">
              <select
                value={includePending ? "true" : "false"}
                onChange={(e) => setIncludePending(e.target.value == "true")}
              >
                <option value="true">Include pending changes in export</option>
                <option value="false">
                  Exclude pending changes from export
                </option>
              </select>
              <SvgImage type="down-caret" />
            </div>
          </div>
        ) : (
          ""
        )}

        <div className="buttons">
          <button
            className="primary"
            disabled={exporting}
            onClick={async () => {
              const filePath = await window.electron.chooseFilePath(
                `Export ${envParent.name} - ${environmentName}`,
                `${environmentName.toLowerCase()}.${format}`
              );

              if (filePath) {
                setExporting(true);

                await props.dispatch({
                  type: Client.ActionType.EXPORT_ENVIRONMENT,
                  payload: {
                    envParentId: envParent.id,
                    environmentId: exportEnvironmentId,
                    format,
                    filePath,
                    includeAncestors: includeAncestors || undefined,
                    pending: includePending || undefined,
                  },
                });

                close();
              }
            }}
          >
            {exporting ? "..." : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
};

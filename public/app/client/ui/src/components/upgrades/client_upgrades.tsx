import React, { useState, useLayoutEffect } from "react";
import { ComponentBaseProps } from "@ui_types";
import * as styles from "@styles";
import {
  ElectronWindow,
  AvailableClientUpgrade,
  ClientUpgradeProgress,
  ClientUpgrade,
} from "@core/types/electron";
import * as R from "ramda";
import { SmallLoader } from "@images";
import ReactMarkdown from "react-markdown";

declare var window: ElectronWindow;

export const ClientUpgrades: React.FC<
  ComponentBaseProps & {
    onRestartLater: () => void;
    availableClientUpgrade: AvailableClientUpgrade;
    clientUpgradeProgress: ClientUpgradeProgress;
  }
> = (props) => {
  const { cli, desktop, envkeysource } = props.availableClientUpgrade;

  const missedVersions = (
    ["cli", "desktop", "envkeysource"] as ("cli" | "desktop" | "envkeysource")[]
  ).reduce(
    (agg, project) => ({
      ...agg,
      [project]: Object.keys(
        props.availableClientUpgrade[project]?.notes ?? {}
      ),
    }),
    {} as Record<"cli" | "desktop" | "envkeysource", string[]>
  );

  const numUpgrades = [cli, desktop, envkeysource].filter(Boolean).length;
  const progressReportedForAllDownloads =
    Object.keys(props.clientUpgradeProgress).length == numUpgrades;

  const downloadedBytes = progressReportedForAllDownloads
    ? R.sum(
        Object.values(props.clientUpgradeProgress).map(
          R.prop("downloadedBytes")
        )
      )
    : 0;
  const totalBytes = progressReportedForAllDownloads
    ? R.sum(
        Object.values(props.clientUpgradeProgress).map(R.prop("totalBytes"))
      )
    : 0;

  const [progressPct, setProgressPct] = useState(0);

  const [startedUpgrade, setStartedUpgrade] = useState(false);

  const [showInitialLoader, setShowInitialLoader] = useState(true);
  const [showFinalLoader, setShowFinalLoader] = useState(true);

  useLayoutEffect(() => {
    const pct =
      totalBytes > 0 && downloadedBytes > 0 ? downloadedBytes / totalBytes : 0;

    if (pct > progressPct) {
      setProgressPct(pct);
    }
  }, [totalBytes, downloadedBytes]);

  let showFinalLoaderTimeout: ReturnType<typeof setTimeout> | undefined;
  useLayoutEffect(() => {
    if (showInitialLoader && progressPct > 0) {
      setShowInitialLoader(false);
    } else if (
      !showFinalLoader &&
      !showFinalLoaderTimeout &&
      progressPct >= 0.95
    ) {
      showFinalLoaderTimeout = setTimeout(() => {
        setShowFinalLoader(true);
        showFinalLoaderTimeout = undefined;
      }, 1000);
    }
  }, [progressPct]);

  return (
    <div className={styles.Upgrades}>
      <div className="overlay disabled" />

      <div className="modal">
        <h3>
          {[
            desktop ? "UI" : undefined,
            cli || envkeysource ? "CLI Tools" : undefined,
          ]
            .filter(Boolean)
            .join(" & ")}{" "}
          <strong>Upgrade Available</strong>
        </h3>

        <div className="project-changelogs">
          {(
            [
              ["desktop", desktop, "EnvKey UI"],
              ["cli", cli, "CLI"],
              ["envkeysource", envkeysource, "envkey-source"],
            ] as ["desktop" | "cli" | "envkeysource", ClientUpgrade, string][]
          )
            .filter(([, clientUpgrade]) => clientUpgrade)
            .map(([project, clientUpgrade, label]) => (
              <div>
                <h5>
                  <span>{label}</span>
                  <small>
                    Current <strong>{clientUpgrade.currentVersion}</strong>
                    <span className="sep">●</span> Latest{" "}
                    <strong>{clientUpgrade.nextVersion}</strong>
                  </small>
                </h5>
                <div className="changelog">
                  {missedVersions[project].map((v) => {
                    const note = clientUpgrade.notes[v];
                    return (
                      <div>
                        <label className="version">{v}</label>

                        <div className="note">
                          <ReactMarkdown>{note}</ReactMarkdown>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>

        {startedUpgrade ? (
          [
            <div className="progress">
              {showInitialLoader || showFinalLoader ? (
                <SmallLoader />
              ) : (
                <div
                  className="bar"
                  style={{ width: `${Math.min(progressPct * 100, 100)}%` }}
                ></div>
              )}
            </div>,
          ]
        ) : (
          <div className="buttons">
            <button className="secondary" onClick={props.onRestartLater}>
              Not Now
            </button>
            <button
              className="primary"
              onClick={() => {
                setStartedUpgrade(true);
                window.electron.downloadAndInstallUpgrades();
              }}
            >
              Upgrade
              {[desktop, cli, envkeysource].filter(Boolean).length > 1
                ? " All"
                : ""}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useLayoutEffect } from "react";
import { ComponentBaseProps } from "@ui_types";
import * as styles from "@styles";
import { ElectronWindow, ClientUpgradeProgress } from "@core/types/electron";
import { SmallLoader } from "@images";
import { style } from "typestyle";

declare var window: ElectronWindow;

export const ClientUpgradeStatus: React.FC<
  ComponentBaseProps & {
    clientUpgradeProgress: ClientUpgradeProgress | undefined;
    upgradeDownloaded?: boolean;
  }
> = (props) => {
  const [showInitialLoader, setShowInitialLoader] = useState(true);
  const [showFinalLoader, setShowFinalLoader] = useState(false);

  const { totalBytes, downloadedBytes } = props.clientUpgradeProgress ?? {
    totalBytes: 0,
    downloadedBytes: 0,
  };

  let progressPct =
    totalBytes > 0 && downloadedBytes > 0 ? downloadedBytes / totalBytes : 0;
  if (progressPct >= 0.95) {
    progressPct = 1;
  }

  let showFinalLoaderTimeout: ReturnType<typeof setTimeout> | undefined;
  useLayoutEffect(() => {
    if (showInitialLoader && progressPct > 0) {
      setShowInitialLoader(false);
    } else if (
      !showFinalLoader &&
      !showFinalLoaderTimeout &&
      progressPct == 1
    ) {
      showFinalLoaderTimeout = setTimeout(() => {
        setShowFinalLoader(true);
        showFinalLoaderTimeout = undefined;
      }, 500);
    }
  }, [progressPct]);

  return (
    <div
      className={
        styles.ClientUpgradeStatus +
        " " +
        style({
          justifyContent: props.upgradeDownloaded ? "center" : "space-between",
        })
      }
    >
      {props.upgradeDownloaded
        ? [
            <label>Upgrade finished.</label>,
            <button
              onClick={() => {
                window.electron.restartWithLatestVersion();
              }}
            >
              Restart With Latest Version
            </button>,
          ]
        : [
            <label>Upgrade in progress...</label>,
            <div className="progress">
              {[
                showInitialLoader || showFinalLoader ? <SmallLoader /> : "",
                <div
                  className="bar"
                  style={{ width: `${Math.min(progressPct * 100, 100)}%` }}
                ></div>,
              ]}
            </div>,
          ]}
    </div>
  );
};

import React, { useState, useEffect } from "react";
import { Component } from "@ui_types";
import * as R from "ramda";

const dataTypeLabels = {
  keys: "intermediate keys",
  blobs: "environment blobs",
  keys_and_blobs: "environment blobs",
};

export const CryptoStatus: Component = (props) => {
  const { graph } = props.core;
  const status = props.ui.envActionStatus;

  const [fetched, setFetched] = useState(false);
  const [encrypted, setEncrypted] = useState(false);
  const [decrypted, setDecrypted] = useState(false);

  const {
    cryptoStatus,
    isFetchingEnvs,
    isFetchingChangesets,
    isLoadingInvite,
    isLoadingDeviceGrant,
    isLoadingRecoveryKey,
    isProcessingApi,
  } = status ?? { isFetchingEnvs: {}, isFetchingChangesets: {} };

  const isFetchingEnvIds = Object.keys(isFetchingEnvs);
  const isFetchingChangesetIds = Object.keys(isFetchingChangesets);

  useEffect(() => {
    if (
      isFetchingEnvIds.length + isFetchingChangesetIds.length > 0 &&
      !fetched
    ) {
      setFetched(true);
    }
  }, [isFetchingEnvIds.length + isFetchingChangesetIds.length > 0]);

  useEffect(() => {
    if (cryptoStatus?.op == "decrypt" && !decrypted) {
      setDecrypted(true);
    } else if (cryptoStatus?.op == "encrypt" && !encrypted) {
      setEncrypted(true);
    }
  }, [cryptoStatus?.op]);

  let msg = "Processing...";

  if (cryptoStatus) {
    msg = `${cryptoStatus.op == "encrypt" ? "Encrypted" : "Decrypted"} ${
      cryptoStatus.processed
    }/${cryptoStatus.total} ${dataTypeLabels[cryptoStatus.dataType]}...`;
  } else if (
    (isFetchingEnvIds.length > 0 || isFetchingChangesetIds.length > 0) &&
    !decrypted
  ) {
    const ids = R.union(isFetchingEnvIds, isFetchingChangesetIds);
    const [appIds, blockIds] = R.partition(
      (id) => graph[id].type == "app",
      ids
    );

    msg = `Fetching encrypted ${[
      isFetchingEnvIds.length > 0 ? `environments` : null,
      isFetchingChangesetIds.length > 0 ? "versions" : null,
    ]
      .filter(Boolean)
      .join(" and ")} for ${[
      appIds.length > 0
        ? `${appIds.length} app${appIds.length > 1 ? "s" : ""}`
        : null,
      blockIds.length > 0
        ? `${blockIds.length} block${blockIds.length > 1 ? "s" : ""}`
        : null,
    ]
      .filter(Boolean)
      .join(" and ")} from host...`;
  } else if (isLoadingInvite || isLoadingDeviceGrant) {
    msg = "Loading invitation...";
  } else if (isLoadingRecoveryKey) {
    msg = "Loading recovery key...";
  } else if (isProcessingApi && encrypted) {
    msg = `Processing on API host...`;
  }

  return (
    <div className="crypto-status">
      <p>{msg}</p>
    </div>
  );
};

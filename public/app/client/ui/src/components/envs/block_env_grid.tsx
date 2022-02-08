import React, { useMemo } from "react";
import { EnvManagerComponent } from "@ui_types";
import * as ui from "@ui";
import { SmallLoader } from "@images";
import { useFetchEnvs } from "./fetch_envs_hook";

export const BlockEnvGrid: EnvManagerComponent = (props) => {
  const fetchingEnvs = useFetchEnvs(props);

  if (fetchingEnvs) {
    return (
      <div className="loading-envs">
        <SmallLoader />
      </div>
    );
  }

  return (
    <div>
      {props.ui.startedOnboarding &&
      !props.ui.closedOnboardBlock &&
      !props.isSub &&
      !props.localsUserId &&
      !props.editingMultiline ? (
        <ui.BlockOnboard {...props} blockId={props.envParentId} />
      ) : (
        ""
      )}
      <ui.EnvGrid {...props} />
    </div>
  );
};

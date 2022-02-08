import React from "react";
import { EnvManagerComponent } from "@ui_types";
import * as ui from "@ui";
import { Model } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { SmallLoader } from "@images";
import { useFetchEnvs } from "./fetch_envs_hook";

export const AppEnvGrid: EnvManagerComponent = (props) => {
  const {
    core: { graph },
  } = props;

  const fetchingEnvs = useFetchEnvs(props);

  let hasConnectedBlocks = props.connectedBlocks.length > 0;

  if (!fetchingEnvs && props.isSub && hasConnectedBlocks) {
    const subConnected = props.connectedBlocks.filter((block) => {
      const blockEnvironmentIds = props.localsUserId
        ? [[block.id, props.localsUserId].join("|")]
        : props.visibleEnvironmentIds.flatMap((appEnvironmentId) => {
            const appEnvironment = props.localsUserId
              ? undefined
              : (graph[appEnvironmentId] as Model.Environment);

            const blockEnvironmentIds = g
              .getConnectedBlockEnvironmentsForApp(
                graph,
                props.envParentId,
                block.id,
                appEnvironmentId
              )
              .map(R.prop("id"));

            const blockEnvironmentId = appEnvironment?.isSub
              ? blockEnvironmentIds.find(
                  (id) => (graph[id] as Model.Environment).isSub
                )
              : blockEnvironmentIds[0];

            return blockEnvironmentId ?? "";
          });

      return blockEnvironmentIds.filter(Boolean).length > 0;
    });

    if (subConnected.length == 0) {
      hasConnectedBlocks = false;
    }
  }

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
      !props.ui.closedOnboardApp &&
      !props.isSub &&
      !props.localsUserId &&
      !props.editingMultiline ? (
        <ui.AppOnboard {...props} appId={props.envParentId} />
      ) : (
        ""
      )}
      {hasConnectedBlocks ? <ui.AppBlocks {...props} /> : ""}
      {hasConnectedBlocks && !props.editingMultiline ? (
        <div className="title-row">
          <span className="label">
            <small>App Variables</small>
          </span>
        </div>
      ) : (
        ""
      )}
      <ui.EnvGrid {...props} />
    </div>
  );
};

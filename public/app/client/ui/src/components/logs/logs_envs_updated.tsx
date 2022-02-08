import React, { useState } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Api, Client, Logs } from "@core/types";
import { SvgImage } from "@images";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import * as styles from "@styles";
import * as ui from "@ui";
import { getUpdatedEnvironmentIdsForBlobSet } from "@core/lib/blob";

export const LogsEnvsUpdated: OrgComponent<
  {},
  {
    loggedAction: Logs.LoggedAction;
    graphWithDeleted: Client.Graph.UserGraph;
    actor: Logs.Actor | undefined;
  }
> = (props) => {
  const [expanded, setExpanded] = useState(false);

  if (
    !("blobsUpdated" in props.loggedAction && props.loggedAction.blobsUpdated)
  ) {
    return <div />;
  }

  const renderEnvironments = () => {
    if (
      !expanded ||
      !("blobsUpdated" in props.loggedAction && props.loggedAction.blobsUpdated)
    ) {
      return;
    }

    return R.toPairs(
      R.groupBy(
        (environmentId) =>
          (props.graphWithDeleted[environmentId] as Model.Environment)
            ?.envParentId ?? environmentId.split("|")[0],
        getUpdatedEnvironmentIdsForBlobSet(props.loggedAction.blobsUpdated)
      )
    ).map(([envParentId, environmentIds]) => {
      const envParent = props.graphWithDeleted[envParentId] as Model.EnvParent;

      return (
        <div className="env-parent">
          <span>{envParent.name}</span>
          <div className="environments">
            {environmentIds.map((environmentId) => {
              const environment = props.graphWithDeleted[environmentId] as
                | Model.Environment
                | undefined;

              const isLocals =
                !environment && environmentId.includes(envParent.id);

              return (
                <span
                  className={
                    environment?.isSub
                      ? "sub"
                      : "" + (isLocals ? " locals" : "")
                  }
                >
                  {environment?.isSub
                    ? g.getEnvironmentName(
                        props.graphWithDeleted,
                        environment.parentEnvironmentId
                      ) + " > "
                    : ""}
                  {g.getEnvironmentName(props.graphWithDeleted, environmentId)}
                </span>
              );
            })}
          </div>
        </div>
      );
    });
  };

  let actorName: React.ReactNode;
  if (props.actor) {
    if (props.actor.type == "orgUser") {
      actorName = <span className="actor">{props.actor.firstName}</span>;
    } else {
      actorName = (
        <span className="actor">
          {g.getObjectName(props.graphWithDeleted, props.actor.id)}
        </span>
      );
    }
  } else {
    actorName = <span className="actor">unknown</span>;
  }

  return (
    <div className="log-envs-updated">
      <span
        className={"envs-updated-summary" + (expanded ? " expanded" : "")}
        onClick={() => setExpanded(!expanded)}
      >
        <SvgImage type="triangle" />
        {actorName}
        {props.loggedAction.actionType == Api.ActionType.UPDATE_ENVS
          ? "updated "
          : "re-encrypted "}
        {g.getBlobSetNumUpdatedSummary(
          props.graphWithDeleted,
          props.loggedAction.blobsUpdated
        )}
        {props.loggedAction.actionType == Api.ActionType.REENCRYPT_ENVS
          ? " after an access change."
          : "."}
      </span>
      <div className="envs-updated-list">{renderEnvironments()}</div>
    </div>
  );
};

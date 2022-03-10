import React, { useState, useEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Api } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import * as ui from "@ui";
import { capitalize } from "@core/lib/utils/string";
import * as styles from "@styles";
import { SvgImage, SmallLoader } from "@images";
import { wait } from "@core/lib/utils/wait";
import { logAndAlertError } from "@ui_lib/errors";

export const GroupSettings: OrgComponent<{ groupId: string }> = (props) => {
  const { graph } = props.core;
  const groupId = props.routeParams.groupId;
  const group = graph[groupId] as Model.Group;

  let label: string;
  if (group.objectType == "orgUser") {
    label = "Team";
  } else {
    label = capitalize(group.objectType) + " Group";
  }

  const [name, setName] = useState(group.name);

  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  const [renaming, setRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setName(group.name);
    setConfirmDeleteName("");
  }, [groupId]);

  useEffect(() => {
    if (renaming && group.name == name) {
      setRenaming(false);
    }
  }, [group.name]);

  const renderRename = () => {
    return (
      <div>
        <div className="field no-margin">
          <label>{label} Name</label>
          <input
            type="text"
            disabled={renaming}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="primary"
            disabled={!name.trim() || name == group.name || renaming}
            onClick={() => {
              setRenaming(true);

              props
                .dispatch({
                  type: Api.ActionType.RENAME_GROUP,
                  payload: { id: group.id, name },
                })
                .then((res) => {
                  if (!res.success) {
                    logAndAlertError(
                      `There was a problem renaming the team.`,
                      res.resultAction
                    );
                  }
                });
            }}
          >
            {renaming ? <SmallLoader /> : "Rename"}
          </button>
        </div>
      </div>
    );
  };

  const renderDelete = () => {
    return (
      <div className="field">
        <label>Delete {label}</label>
        <input
          type="text"
          value={confirmDeleteName}
          disabled={isDeleting}
          onChange={(e) => setConfirmDeleteName(e.target.value)}
          placeholder={`To confirm, enter ${label} name here...`}
        />
        <button
          className="primary"
          disabled={isDeleting || confirmDeleteName != group.name}
          onClick={async () => {
            setIsDeleting(true);
            await wait(500); // add a little delay for a smoother transition
            props.setUiState({ justDeletedObjectId: group.id });
            props
              .dispatch({
                type: Api.ActionType.DELETE_GROUP,
                payload: { id: group.id },
              })
              .then((res) => {
                if (!res.success) {
                  logAndAlertError(
                    `There was a problem deleting the team.`,
                    res.resultAction
                  );
                }
              });
          }}
        >
          {isDeleting ? <SmallLoader /> : `Delete ${label}`}
        </button>
      </div>
    );
  };

  const renderDangerZone = () => {
    return (
      <div className="danger-zone">
        <h3>Danger Zone</h3>
        {renderDelete()}
      </div>
    );
  };

  return (
    <div className={styles.OrgContainer}>
      <h3>
        {label} <strong>Settings</strong>
      </h3>
      {renderRename()}
      {renderDangerZone()}
    </div>
  );
};

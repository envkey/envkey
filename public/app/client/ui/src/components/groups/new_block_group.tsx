import React, { useState, useEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Api, Model } from "@core/types";
import * as g from "@core/lib/graph";
import * as styles from "@styles";
import { SmallLoader } from "@images";

export const NewBlockGroup: OrgComponent = (props) => {
  const { dispatch, core, history, orgRoute } = props;
  const { graph } = core;

  const [name, setName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string>();

  const canSubmit = name.trim();

  const created = createdId
    ? (graph[createdId] as Model.Group | undefined)
    : undefined;

  useEffect(() => {
    if (created) {
      history.push(orgRoute(`/groups/${created.id}/members`));
    }
  }, [Boolean(created)]);

  const onSubmit = async () => {
    if (!canSubmit || submitting || Boolean(createdId)) {
      return;
    }

    setSubmitting(true);

    const res = await dispatch({
      type: Api.ActionType.CREATE_GROUP,
      payload: {
        objectType: "block",
        name,
      },
    });

    if (res.success) {
      const { groups } = g.graphTypes(res.state.graph);
      const createdGroup = groups.find(
        ({ createdAt }) => createdAt === res.state.graphUpdatedAt
      );
      setCreatedId(createdGroup!.id);
    } else {
      console.log("Error creating block group", res.resultAction);
      alert("There was a problem creating the block group.");
    }
  };

  return (
    <div
      className={styles.OrgContainer}
      onKeyPress={(e) => {
        if (e.key == "Enter") {
          onSubmit();
        }
      }}
    >
      <div className="field">
        <label>Block Group Name</label>
        <input
          type="text"
          value={name}
          placeholder={"Enter block group name..."}
          disabled={Boolean(submitting || createdId)}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>

      <div className="buttons">
        <button
          className="primary"
          disabled={!canSubmit || submitting || Boolean(createdId)}
          onClick={onSubmit}
        >
          {submitting ? <SmallLoader /> : "Create Block Group"}
        </button>
      </div>
    </div>
  );
};

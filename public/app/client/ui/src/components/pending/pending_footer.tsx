import React, { useEffect, useState } from "react";
import { OrgComponent, OrgComponentProps } from "@ui_types";
import {
  getPendingUpdateDetails,
  getAllPendingConflicts,
} from "@core/lib/client";
import { Client } from "@core/types";
import { style } from "typestyle";
import { ReviewPending } from "./review_pending";
import * as styles from "@styles";
import * as R from "ramda";
import { SmallLoader } from "@images";

type Props = {
  pendingUpdateDetails: ReturnType<typeof getPendingUpdateDetails>;
  pendingConflicts: ReturnType<typeof getAllPendingConflicts>;
  numPendingConflicts: number;
};

const memoizeableProps = (props: OrgComponentProps<{}, Props>) => [
  props.core.graphUpdatedAt,
  props.ui.loadedAccountId,
  props.core.pendingEnvsUpdatedAt,
  props.ui.pendingFooterHeight,
  JSON.stringify(props.core.updateEnvsErrors),
];

export const PendingFooter: OrgComponent<{}, Props> = React.memo(
  (props) => {
    const { apps, blocks } = props.pendingUpdateDetails;

    const appIds = Array.from(apps);
    const blockIds = Array.from(blocks);

    const [isConfirmingCommitAll, setIsConfirmingCommitAll] = useState(false);
    const [isConfirmingResetAll, setIsConfirmingResetAll] = useState(false);
    const [isReviewing, setIsReviewing] = useState(false);
    const [commitMsg, setCommitMsg] = useState<string>("");

    const [dispatchedCommit, setDispatchedCommit] = useState(false);
    const [dispatchedReset, setDispatchedReset] = useState(false);

    const resetState = () => {
      setIsConfirmingCommitAll(false);
      setIsConfirmingResetAll(false);
      setIsReviewing(false);
      setCommitMsg("");

      setDispatchedCommit(false);
      setDispatchedReset(false);
    };

    useEffect(() => {
      if (appIds.length + blockIds.length > 0) {
        props.setUiState({
          pendingFooterHeight: isConfirmingCommitAll
            ? styles.layout.CONFIRM_PENDING_FOOTER_HEIGHT
            : styles.layout.DEFAULT_PENDING_FOOTER_HEIGHT,
        });
      }
    }, [isConfirmingCommitAll]);

    useEffect(() => {
      if (
        dispatchedCommit &&
        Object.keys(props.core.updateEnvsErrors).length > 0
      ) {
        setDispatchedCommit(false);
        const msg = "There was a problem comitting your changes.";
        alert(msg);
        console.log(msg, props.core.updateEnvsErrors);
      }
    }, [JSON.stringify(props.core.updateEnvsErrors)]);

    useEffect(() => {
      if (!isReviewing) {
        setTimeout(resetState, 500);
      }
    }, [props.pendingUpdateDetails]);

    const reviewPending = (
      <ReviewPending {...props} back={() => setIsReviewing(false)} />
    );

    const confirmingCommitAllContents = [
      <label>
        <strong>Commit all changes?</strong>
      </label>,
      <textarea
        placeholder="Commit message (optional)"
        value={commitMsg}
        autoFocus={true}
        onChange={(e) => setCommitMsg(e.target.value)}
        disabled={dispatchedCommit}
      />,
      <div className="actions">
        <button
          className="secondary"
          disabled={dispatchedCommit}
          onClick={() => setIsConfirmingCommitAll(false)}
        >
          Cancel
        </button>
        <button
          className="primary"
          disabled={dispatchedCommit}
          onClick={() => {
            props.dispatch({
              type: Client.ActionType.COMMIT_ENVS,
              payload: {
                message: commitMsg,
              },
            });
            setDispatchedCommit(true);
          }}
        >
          {dispatchedCommit ? <SmallLoader /> : "Commit"}
        </button>
      </div>,
    ];

    let footerContents: React.ReactNode[];

    if (isConfirmingCommitAll) {
      footerContents = confirmingCommitAllContents;
    } else if (isConfirmingResetAll) {
      footerContents = [
        <label>
          <strong>Reset all changes?</strong>
        </label>,
        <div className="actions">
          <button
            className="secondary"
            disabled={dispatchedReset}
            onClick={() => setIsConfirmingResetAll(false)}
          >
            Cancel
          </button>

          <button
            className="primary"
            disabled={dispatchedReset}
            onClick={() => {
              props.dispatch({
                type: Client.ActionType.RESET_ENVS,
                payload: {},
              });
              props.setUiState({
                envManager: {
                  ...props.ui.envManager,
                  committingToCore: {},
                },
              });
              setDispatchedReset(true);
            }}
          >
            Reset
          </button>
        </div>,
      ];
    } else {
      const summary: React.ReactNode[] = [
        <strong>Changes pending</strong>,

        <span className="sep">{"●"}</span>,
      ];
      if (apps.size) {
        summary.push(
          <strong>{`${apps.size} app${apps.size > 1 ? "s" : ""}`}</strong>
        );
        if (blocks.size > 0) {
          summary.push(", ");
        }
      }
      if (blocks.size) {
        summary.push(
          <strong>{`${blocks.size} block${blocks.size > 1 ? "s" : ""}`}</strong>
        );
      }

      // const numEnvironments = appEnvironments.size + blockEnvironments.size;
      // const numVars = appPaths.size + blockPaths.size;

      // summary.push(
      //   ` (${numEnvironments} environment${
      //     numEnvironments > 1 ? "s" : ""
      //   }, ${numVars} var${numVars > 1 ? "s" : ""})`
      // );

      if (props.numPendingConflicts > 0) {
        summary.push(
          <span className="conflicts">
            <span className="sep">{"●"}</span>
            {props.numPendingConflicts} conflict
            {props.numPendingConflicts == 1 ? "" : "s"}
          </span>
        );
      }

      footerContents = [
        <label>{summary}</label>,
        <div className="actions">
          <button className="secondary" onClick={() => setIsReviewing(true)}>
            Review
          </button>
          <button
            className="secondary"
            onClick={() => setIsConfirmingResetAll(true)}
          >
            Reset
          </button>
          <button
            className="primary"
            onClick={() => setIsConfirmingCommitAll(true)}
          >
            Commit
          </button>
        </div>,
      ];
    }

    return (
      <div>
        <div
          className={
            styles.PendingEnvsFooter +
            " " +
            style({
              height: props.ui.pendingFooterHeight,
            })
          }
        >
          {footerContents}
        </div>
        {isReviewing ? reviewPending : ""}
      </div>
    );
  },
  (prevProps, nextProps) => {
    const prev = memoizeableProps(prevProps);
    const next = memoizeableProps(nextProps);
    const sameResult = R.equals(prev, next);
    return sameResult;
  }
);

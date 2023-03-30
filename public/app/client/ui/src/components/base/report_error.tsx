import React, { useState } from "react";
import { OrgComponent } from "@ui_types";
import { ElectronWindow } from "@core/types/electron";
import { Model } from "@core/types";
import * as styles from "@styles";

declare var window: ElectronWindow;

export const ReportError: OrgComponent<
  {},
  {
    onClose: () => void;
  }
> = (props) => {
  const currentUserId = props.ui.loadedAccountId!;
  const currentUser = props.core.graph[currentUserId] as Model.OrgUser;

  const [userInput, setUserInput] = useState("");

  const handleSubmit = () => {
    window.electron.reportError(userInput, currentUserId, currentUser.email);
    alert(
      "Your error report has been submitted. EnvKey support has been alerted to the problem and will be in touch if they need more information. Sorry about any inconvenience, and thanks for your help!"
    );
    props.onClose();
  };

  const handleCancel = () => {
    props.onClose();
  };

  return (
    <div className={styles.ReportError}>
      <div className="overlay" onClick={handleCancel} />
      <div className="modal">
        <div className="modal-header">
          <h3>
            Report A <strong>Problem</strong>
          </h3>
        </div>
        <div className="modal-body">
          <div className="field">
            <label htmlFor="error-description">Describe the issue:</label>
            <textarea
              autoFocus={true}
              className="textarea"
              id="error-description"
              placeholder="Please describe the issue you encountered..."
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
            />
          </div>
        </div>
        <p>
          Sending an error report will alert EnvKey support to the problem and
          upload recent logs from $HOME/.envkey/logs. No sensitive data is
          included in these logs.
        </p>
        <p>You can also email support@envkey.com for help.</p>
        <div className="buttons">
          <button className="secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button className="primary" onClick={handleSubmit}>
            Send Error Report
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportError;

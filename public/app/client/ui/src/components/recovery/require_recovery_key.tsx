import React, { useEffect } from "react";
import { OrgComponent } from "@ui_types";
import * as g from "@core/lib/graph";
import { ManageRecoveryKey } from "./manage_recovery_key";
import { Client } from "@core/types";
import * as styles from "@styles";
import { HomeContainer } from "../home/home_container";
import { logAndAlertError } from "@ui_lib/errors";

export const RequireRecoveryKey: OrgComponent<{}, { onClear?: () => any }> = (
  props
) => {
  useEffect(() => {
    props
      .dispatch({ type: Client.ActionType.CREATE_RECOVERY_KEY })
      .then((res) => {
        if (!res.success) {
          logAndAlertError(
            `There was a problem generating the recovery key.`,
            res.resultAction
          );
        }
      });
  }, []);

  return (
    <HomeContainer overlay={true}>
      <div className={styles.RequireRecoveryKey}>
        <h3>
          Your New <strong>Recovery Key</strong>
        </h3>
        <ManageRecoveryKey {...props} requireRecoveryKey={true} />
      </div>
    </HomeContainer>
  );
};

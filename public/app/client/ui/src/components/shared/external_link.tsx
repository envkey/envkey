import React from "react";
import * as styles from "@styles";
import { Client } from "@core/types";
import { Component } from "@ui_types";
import { logAndAlertError } from "@ui_lib/errors";

type Props = {
  to: string;
  className?: string;
};

export const ExternalLink: Component<{}, Props> = ({
  to,
  className,
  children,
  dispatch,
}) => {
  return (
    <a
      onClick={(e) => {
        e.preventDefault();
        dispatch({
          type: Client.ActionType.OPEN_URL,
          payload: { url: to },
        }).then((res) => {
          if (!res.success) {
            logAndAlertError(
              `There was a problem opening the url '${to}'.`,
              res.resultAction
            );
          }
        });
      }}
      className={styles.ExternalLink + (className ? " " + className : "")}
    >
      {children}
    </a>
  );
};

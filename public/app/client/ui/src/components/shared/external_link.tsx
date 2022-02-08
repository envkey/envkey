import React from "react";
import * as styles from "@styles";
import { Client } from "@core/types";
import { ElectronWindow } from "@core/types/electron";
import { Component } from "@ui_types";

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
        });
      }}
      className={styles.ExternalLink + (className ? " " + className : "")}
    >
      {children}
    </a>
  );
};

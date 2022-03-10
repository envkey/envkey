import React from "react";
import { Component } from "@ui_types";
import { Link } from "react-router-dom";
import { Client } from "@core/types";
import { logAndAlertError } from "@ui_lib/errors";

export const LockLink: Component = ({ core, dispatch, children }) => (
  <Link
    to="/lock-set-passphrase"
    onClick={(e) => {
      if (core.requiresPassphrase) {
        e.preventDefault();
        dispatch({
          type: Client.ActionType.LOCK_DEVICE,
        }).then((res) => {
          if (!res.success) {
            logAndAlertError(
              `There was a problem locking the device.`,
              res.resultAction
            );
          }
        });
      }
    }}
  >
    {children}
  </Link>
);

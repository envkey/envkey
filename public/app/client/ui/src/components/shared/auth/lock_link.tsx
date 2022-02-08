import React from "react";
import { Component } from "@ui_types";
import { Link } from "react-router-dom";
import { Client } from "@core/types";

export const LockLink: Component = ({ core, dispatch, children }) => (
  <Link
    to="/lock-set-passphrase"
    onClick={(e) => {
      if (core.requiresPassphrase) {
        e.preventDefault();
        dispatch({
          type: Client.ActionType.LOCK_DEVICE,
        });
      }
    }}
  >
    {children}
  </Link>
);

import React, { useState } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Api, Client, Logs, Rbac } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import * as styles from "@styles";
import * as ui from "@ui";

export const LogsRevokeTrusted: OrgComponent<
  {},
  { loggedAction: Logs.LoggedAction }
> = (props) => {
  return <div></div>;
};

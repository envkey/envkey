import React, { useLayoutEffect } from "react";
import { OrgComponent } from "@ui_types";

export const AppCliUsersContainer: OrgComponent<{ appId: string }> = (
  props
) => {
  useLayoutEffect(() => {
    if (props.location.pathname.endsWith("/cli-keys")) {
      props.history.replace(props.location.pathname + "/list");
    }
  }, [props.location.pathname]);

  return <div></div>;
};

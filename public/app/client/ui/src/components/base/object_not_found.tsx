import React, { useLayoutEffect } from "react";
import { OrgComponent } from "@ui_types";
import * as R from "ramda";
import { style } from "typestyle";

export const ObjectNotFound: OrgComponent = (props) => {
  useLayoutEffect(() => {
    if (props.ui.justDeletedObjectId) {
      props.setUiState(R.omit(["justDeletedObjectId"], props.ui));
    } else {
      alert("This object has been removed or you have lost access.");
    }

    props.history.replace(props.orgRoute(""));
  }, []);

  return <div>This object has been removed or you have lost access.</div>;
};

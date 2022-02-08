import React, { useEffect } from "react";
import { OrgComponent } from "@ui_types";
import { useAppCollaboratorsTabs } from "./app_collaborators_tabs";

export const AppCollaboratorsContainer: OrgComponent<{ appId: string }> = (
  props
) => {
  const appId = props.routeParams.appId;

  const { tabsComponent } = useAppCollaboratorsTabs(props, appId);

  return typeof tabsComponent == "string" ? <div></div> : tabsComponent;
};

import React from "react";
import { OrgComponent } from "@ui_types";
import { SvgImage } from "@images";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { Rbac } from "@core/types";

export const RoleInfoLink: OrgComponent<
  {},
  { roleType?: "orgRoles" | "appRoles" | "environmentRoles"; roleId?: string }
> = (props) => {
  const { graph } = props.core;

  let roleId: string;
  if (props.roleId) {
    roleId = props.roleId;
  } else {
    let roles = R.reverse(
      g.graphTypes(graph)[props.roleType ?? "orgRoles"] as (
        | Rbac.OrgRole
        | Rbac.AppRole
        | Rbac.EnvironmentRole
      )[]
    );

    if (props.roleType == "appRoles") {
      roles = roles.filter(
        (role) =>
          !(
            role.defaultName &&
            ["Org Owner", "Org Admin"].includes(role.defaultName)
          )
      );
    }

    roleId = roles[0].id;
  }

  return (
    <span
      className="modal-link"
      onClick={() => {
        props.history.push(
          props.location.pathname + `?showRoleInfoId=${roleId}`
        );
      }}
      title="Role info"
    >
      <SvgImage type="info" />
      <span>Role Info</span>
    </span>
  );
};

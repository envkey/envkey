import React, { useState, useRef, useLayoutEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Rbac } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import * as styles from "@styles";
import { SvgImage } from "@images";

type Role = Rbac.OrgRole | Rbac.AppRole | Rbac.EnvironmentRole;

export const RbacInfo: OrgComponent = (props) => {
  const { graph } = props.core;

  const searchParams = new URLSearchParams(props.location.search);
  const showRoleInfoId = searchParams.get("showRoleInfoId")!;

  const selectedRole = graph[showRoleInfoId] as
    | Rbac.OrgRole
    | Rbac.AppRole
    | Rbac.EnvironmentRole;

  let roles = g.graphTypes(graph)[
    (selectedRole.type + "s") as "orgRoles" | "appRoles" | "environmentRoles"
  ] as Role[];

  if (selectedRole.type != "environmentRole") {
    roles = R.reverse<Role>(roles);
  }

  const roleTypesLabel = {
    orgRole: "Org Role",
    appRole: "App Role",
    environmentRole: "Environment Role",
  }[selectedRole.type];

  const autoAppRole =
    selectedRole.type == "orgRole" && selectedRole.autoAppRoleId
      ? (graph[selectedRole.autoAppRoleId] as Rbac.AppRole)
      : undefined;

  const allOrgPermissions = Object.keys(Rbac.orgPermissions);
  const orgPermissionOrder = R.invertObj(allOrgPermissions);
  const allAppPermissions = Object.keys(Rbac.appPermissions);
  const appPermissionOrder = R.invertObj(allAppPermissions);
  const allEnvironmentPermissions = Object.keys(Rbac.environmentPermissions);
  const environmentPermissionOrder = R.invertObj(allEnvironmentPermissions);

  const detailsRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    detailsRef.current?.scrollTo(0, 0);
  }, [selectedRole.id]);

  const renderAppRoleFields = (appRole: Rbac.AppRole) => {
    const permissions = Array.from(g.getAppPermissions(graph, appRole.id));
    return [
      <div className="field">
        <label>App Permissions</label>
        <span>
          {selectedRole.defaultName == "Org Owner" ||
          permissions.length == allAppPermissions.length
            ? "All App Permissions"
            : R.sortBy(
                (permission) =>
                  parseInt(appPermissionOrder[permission as string]),
                permissions
              ).map((permission) => (
                <span className="permission">
                  <span className="bullet">●</span>
                  {`Can ${Rbac.appPermissions[permission].description}.`}
                </span>
              ))}
        </span>
      </div>,

      <div className="field">
        <label>Can Invite App Roles</label>
        <span>
          {selectedRole.defaultName == "Org Owner"
            ? "All App Roles"
            : appRole.canInviteAppRoleIds.length > 0
            ? appRole.canInviteAppRoleIds
                .map((id) => (graph[id] as Rbac.OrgRole).name)
                .join(", ")
            : "None"}
        </span>
      </div>,

      <div className="field">
        <label>Can Update Or Remove App Roles</label>
        <span>
          {selectedRole.defaultName == "Org Owner"
            ? "All App Roles"
            : appRole.canManageAppRoleIds.length > 0
            ? appRole.canManageAppRoleIds
                .map((id) => (graph[id] as Rbac.OrgRole).name)
                .join(", ")
            : "None"}
        </span>
      </div>,

      ...g.graphTypes(graph).environmentRoles.map((environmentRole) => {
        const permissions = g.getAppRoleEnvironmentRolePermissions(
          graph,
          appRole.id,
          environmentRole.id
        );
        return (
          <div className="field">
            <label>{environmentRole.name} Permissions</label>
            {appRole.hasFullEnvironmentPermissions ||
            permissions.length == allEnvironmentPermissions.length
              ? "All Environment Permissions"
              : R.sortBy(
                  (permission) =>
                    environmentPermissionOrder[permission as string],
                  permissions
                ).map((permission) => (
                  <span className="permission">
                    <span className="bullet">●</span>
                    {`Can ${Rbac.environmentPermissions[permission].description}.`}
                  </span>
                ))}
          </div>
        );
      }),
    ];
  };

  return (
    <div className={styles.RbacInfo}>
      <div
        className="overlay"
        onClick={(e) => {
          props.history.push(
            props.location.pathname +
              props.location.search.replace(
                `showRoleInfoId=${showRoleInfoId}`,
                ""
              )
          );
        }}
      >
        <span className="back">
          <span>← Back</span>
        </span>
      </div>

      <div className="modal">
        <h4>
          {roleTypesLabel + "s"}
          <SvgImage type="down-caret" />
          <select
            value={selectedRole.type}
            onChange={(e) => {
              const selected = (e.target.value + "s") as
                | "orgRoles"
                | "appRoles"
                | "environmentRoles";

              const selectedRoles = g.graphTypes(graph)[selected];
              const role =
                selected == "environmentRoles"
                  ? selectedRoles[0]
                  : R.last<Role>(selectedRoles);

              return props.history.push(
                props.location.pathname +
                  props.location.search.replace(
                    `showRoleInfoId=${showRoleInfoId}`,
                    `showRoleInfoId=${role!.id}`
                  )
              );
            }}
          >
            <option value={"orgRole"}>Org Roles</option>
            <option value={"appRole"}>App Roles</option>
            <option value={"environmentRole"}>Environment Roles</option>
          </select>
        </h4>
        <div>
          <section className="roles">
            {roles.map((role) => {
              if (
                role.type == "appRole" &&
                role.defaultName &&
                ["Org Owner", "Org Admin"].includes(role.defaultName)
              ) {
                return "";
              }

              return (
                <div
                  key={role.id}
                  onClick={() =>
                    props.history.push(
                      props.location.pathname +
                        props.location.search.replace(
                          `showRoleInfoId=${showRoleInfoId}`,
                          `showRoleInfoId=${role.id}`
                        )
                    )
                  }
                  className={selectedRole.id == role.id ? "selected" : ""}
                >
                  {role.name}
                </div>
              );
            })}
          </section>
          <section ref={detailsRef} className="details">
            <h3>
              {roleTypesLabel} <SvgImage type="right-caret" />{" "}
              <strong>{selectedRole.name}</strong>
            </h3>
            <div className="field">
              <label>Description</label>
              <span>{selectedRole.description}</span>
            </div>

            {selectedRole.type == "orgRole"
              ? [
                  <div className="field">
                    <label>Org Permissions</label>
                    {selectedRole.defaultName == "Org Owner" ? (
                      <span>All Org Permissions</span>
                    ) : (
                      R.sortBy(
                        (permission) =>
                          parseInt(orgPermissionOrder[permission as string]),
                        Array.from(g.getOrgPermissions(graph, selectedRole.id))
                      ).map((permission) => (
                        <span className="permission">
                          <span className="bullet">●</span>
                          {`Can ${Rbac.orgPermissions[permission].description}.`}
                        </span>
                      ))
                    )}
                  </div>,

                  <div className="field">
                    <label>Can Invite Org Roles</label>
                    {selectedRole.canInviteAllOrgRoles ? (
                      <span>All Org Roles</span>
                    ) : (
                      <span>
                        {selectedRole.canInviteOrgRoleIds.length > 0
                          ? selectedRole.canInviteOrgRoleIds
                              .map((id) => (graph[id] as Rbac.OrgRole).name)
                              .join(", ")
                          : "None"}
                      </span>
                    )}
                  </div>,

                  <div className="field">
                    <label>Can Update Or Remove Org Roles</label>
                    {selectedRole.canManageAllOrgRoles ? (
                      <span>All Org Roles</span>
                    ) : (
                      <span>
                        {selectedRole.canManageOrgRoleIds.length > 0
                          ? selectedRole.canManageOrgRoleIds
                              .map((id) => (graph[id] as Rbac.OrgRole).name)
                              .join(", ")
                          : "None"}
                      </span>
                    )}
                  </div>,
                ]
              : ""}

            {selectedRole.type == "orgRole" && autoAppRole
              ? [
                  <h3 className="auto-app-role">Automatic App Role</h3>,

                  <div className="field">
                    <span>
                      Users with this org role automatically have an app role
                      assigned to all apps in the org.
                    </span>
                  </div>,

                  ...renderAppRoleFields(autoAppRole),
                ]
              : ""}

            {selectedRole.type == "appRole"
              ? renderAppRoleFields(selectedRole)
              : ""}

            {selectedRole.type == "environmentRole"
              ? g.graphTypes(graph).appRoles.map((appRole) => {
                  if (
                    appRole.defaultName &&
                    ["Org Owner", "Org Admin"].includes(appRole.defaultName)
                  ) {
                    return "";
                  }

                  const permissions = g.getAppRoleEnvironmentRolePermissions(
                    graph,
                    appRole.id,
                    selectedRole.id
                  );
                  return (
                    <div className="field">
                      <label>{appRole.name} Permissions</label>
                      {appRole.hasFullEnvironmentPermissions ||
                      permissions.length == allEnvironmentPermissions.length
                        ? "All Environment Permissions"
                        : R.sortBy(
                            (permission) =>
                              environmentPermissionOrder[permission as string],
                            permissions
                          ).map((permission) => (
                            <span className="permission">
                              <span className="bullet">●</span>
                              {`Can ${Rbac.environmentPermissions[permission].description}.`}
                            </span>
                          ))}
                    </div>
                  );
                })
              : ""}
          </section>
        </div>
      </div>
    </div>
  );
};

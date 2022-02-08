import React, { useState, useEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Rbac } from "@core/types";
import { EnvImportForm } from "./env_import_form";
import * as styles from "@styles";

export const NewEnvParentImporter: OrgComponent<
  {},
  {
    envParentType: Model.EnvParent["type"];
    environmentRoleIds: string[];
    environmentRoleIdsSet: Set<string>;
    validByEnvironmentRoleId: Record<string, boolean | undefined>;
    valuesByEnvironmentRoleId: Record<string, string>;
    parsedByEnvironmentRoleId: Record<
      string,
      Record<string, string> | undefined
    >;
    disabled?: true;
    onChange: (
      values: Record<string, string>,
      valid: Record<string, boolean | undefined>,
      parsed: Record<string, Record<string, string> | undefined>
    ) => void;
  }
> = (props) => {
  const { graph } = props.core;
  const [selectedId, setSelectedId] = useState<string>();

  const selectedRole = selectedId
    ? (graph[selectedId] as Rbac.EnvironmentRole)
    : undefined;

  useEffect(() => {
    if (!selectedId || !props.environmentRoleIdsSet.has(selectedId)) {
      setSelectedId(props.environmentRoleIds[0]);
    }
  }, [props.environmentRoleIds]);

  return (
    <div className={styles.NewEnvParentImporter}>
      <div className="tabs">
        {props.environmentRoleIds.map((id) => {
          const role = graph[id] as Rbac.EnvironmentRole;
          let validSpan: React.ReactNode | undefined;
          const valid = props.validByEnvironmentRoleId[id];
          if (valid === true) {
            validSpan = <span className="valid">✓</span>;
          } else if (valid === false) {
            validSpan = <span className="invalid">🚫</span>;
          }

          return (
            <span
              className={selectedId == id ? "selected" : ""}
              onClick={() => setSelectedId(id)}
            >
              {role.name}
              {validSpan}
            </span>
          );
        })}
      </div>
      <EnvImportForm
        {...props}
        envParentType={props.envParentType}
        environmentName={selectedRole?.name ?? ""}
        value={
          selectedId ? props.valuesByEnvironmentRoleId[selectedId] ?? "" : ""
        }
        onChange={(value, valid, parsed) => {
          if (!selectedId) {
            return;
          }

          props.onChange(
            { ...props.valuesByEnvironmentRoleId, [selectedId]: value },
            {
              ...props.validByEnvironmentRoleId,
              [selectedId]: value ? valid : undefined,
            },
            { ...props.parsedByEnvironmentRoleId, [selectedId]: parsed }
          );
        }}
      />
    </div>
  );
};

import React, { useState, useEffect, useLayoutEffect, useMemo } from "react";
import { OrgComponent } from "@ui_types";
import { Api, Client, Model, Rbac } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { pick } from "@core/lib/utils/pick";
import { getEnvParentPath } from "@ui_lib/paths";
import { SvgImage } from "@images";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { wait } from "@core/lib/utils/wait";
import * as styles from "@styles";

type PermissionsByAppRoleId = Record<string, Rbac.EnvironmentPermission[]>;

const BASE_ENV_PERMISSIONS_BY_ACCESS_LEVEL = {
  none: ["read_inherits"],
  read_meta_only: ["read_inherits", "read_meta"],
  read_only: ["read_inherits", "read_meta", "read"],
  read_write: ["read_inherits", "read_meta", "read", "read_history", "write"],
};

const SUB_ENV_PERMISSIONS_BY_ACCESS_LEVEL = {
  none: [],
  read_meta_only: ["read_branches_inherits", "read_branches_meta"],
  read_only: ["read_branches_inherits", "read_branches_meta", "read_branches"],
  read_write: [
    "read_branches_inherits",
    "read_branches_meta",
    "read_branches",
    "read_branches_history",
    "write_branches",
  ],
};

type AccessLevel = keyof typeof BASE_ENV_PERMISSIONS_BY_ACCESS_LEVEL;

const ACCESS_LEVELS = Object.keys(
  BASE_ENV_PERMISSIONS_BY_ACCESS_LEVEL
) as AccessLevel[];

export const EnvironmentRoleForm: OrgComponent<{
  appId?: string;
  blockId?: string;
  editingId?: string;
}> = (props) => {
  const envParentId = props.routeParams.appId ?? props.routeParams.blockId;

  const { graph, graphUpdatedAt } = props.core;

  const editing = props.routeParams.editingId
    ? (graph[props.routeParams.editingId] as Rbac.EnvironmentRole)
    : undefined;
  const envParent = envParentId
    ? (graph[envParentId] as Model.EnvParent)
    : undefined;

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { appRoles, permissionsByAppRoleId, defaultPermissionsByAppRoleId } =
    useMemo(() => {
      let { appRoles, appRoleEnvironmentRoles } = g.graphTypes(graph);

      appRoles = appRoles.filter(
        R.complement(R.prop("hasFullEnvironmentPermissions"))
      );
      const appRoleIds = new Set(appRoles.map(R.prop("id")));

      return {
        appRoles,
        permissionsByAppRoleId: editing
          ? appRoleEnvironmentRoles.reduce(
              (agg, { environmentRoleId, appRoleId, permissions }) =>
                environmentRoleId == editing.id && appRoleIds.has(appRoleId)
                  ? { ...agg, [appRoleId]: permissions }
                  : agg,
              {} as PermissionsByAppRoleId
            )
          : undefined,

        defaultPermissionsByAppRoleId: editing
          ? {}
          : appRoles.reduce(
              (agg, { id: appRoleId }) => ({
                ...agg,
                [appRoleId]: ["read_inherits"] as Rbac.EnvironmentPermission[],
              }),
              {} as PermissionsByAppRoleId
            ),
      };
    }, [graphUpdatedAt, editing?.id]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [hasLocalKeys, setHasLocalKeys] = useState(false);
  const [hasServers, setHasServers] = useState(true);
  const [userModifiedServerName, setUserModifiedServerName] = useState(false);

  const [defaultAllApps, setDefaultAllApps] = useState(false);
  const [defaultAllBlocks, setDefaultAllBlocks] = useState(false);

  const [autoCommit, setAutoCommit] = useState(false);

  const [permissionsByAppRoleIdState, setPermissionsByAppRoleIdState] =
    useState(permissionsByAppRoleId ?? defaultPermissionsByAppRoleId);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");

    setHasServers(editing?.hasServers ?? true);
    setUserModifiedServerName(false);

    setHasLocalKeys(editing?.hasLocalKeys ?? false);

    setDefaultAllApps(editing?.defaultAllApps ?? !envParent);
    setDefaultAllBlocks(editing?.defaultAllBlocks ?? !envParent);

    setAutoCommit(editing?.settings?.autoCommit ?? false);
    setPermissionsByAppRoleIdState(
      permissionsByAppRoleId ?? defaultPermissionsByAppRoleId
    );
  }, [editing?.id]);

  const hasUpdate =
    !editing ||
    !R.equals(
      {
        name,
        description,
        hasLocalKeys,
        hasServers,
        defaultAllApps,
        defaultAllBlocks,
        autoCommit,
        permissionsByAppRoleId: permissionsByAppRoleIdState,
      },
      {
        ...pick(
          [
            "name",
            "description",
            "hasLocalKeys",
            "hasServers",
            "defaultAllApps",
            "defaultAllBlocks",
          ],
          editing
        ),
        autoCommit: editing.settings?.autoCommit ?? false,
        permissionsByAppRoleId,
      }
    );

  const canSubmit = Boolean(!submitting && hasUpdate && name.trim());

  let submitLabel: string;
  if (editing) {
    submitLabel = submitting ? "Updating" : "Update";
  } else {
    submitLabel = submitting ? "Creating" : "Create";
  }

  const goBack = () => {
    props.history.push(
      props.orgRoute(
        envParent
          ? getEnvParentPath(envParent) + "/settings"
          : "/my-org/environment-settings"
      )
    );
  };

  const renderAppRole = (appRole: Rbac.AppRole) => {
    const permissions = permissionsByAppRoleIdState[appRole.id];

    const permissionsSet = new Set(permissions);

    let baseAccessLevel: AccessLevel = "none";
    for (let level of ACCESS_LEVELS) {
      const levelPermissions = BASE_ENV_PERMISSIONS_BY_ACCESS_LEVEL[
        level
      ] as Rbac.EnvironmentPermission[];

      if (
        R.intersection(permissions, levelPermissions).length ==
        levelPermissions.length
      ) {
        baseAccessLevel = level;
      }
    }

    let subAccessLevel: AccessLevel = "none";
    for (let level of ACCESS_LEVELS) {
      const levelPermissions = SUB_ENV_PERMISSIONS_BY_ACCESS_LEVEL[
        level
      ] as Rbac.EnvironmentPermission[];

      if (
        R.intersection(permissions, levelPermissions).length ==
        levelPermissions.length
      ) {
        subAccessLevel = level;
      }
    }

    return (
      <div>
        <h4>{appRole.name} Permissions</h4>

        <div>
          <div className="field">
            {baseAccessLevel == "none" ? (
              ""
            ) : (
              <label>Base Environment Permissions</label>
            )}

            <div className="select">
              <select
                disabled={appRole.hasFullEnvironmentPermissions || submitting}
                onChange={(e) => {
                  const selectedLevel = e.target.value as AccessLevel;
                  let basePermissions = BASE_ENV_PERMISSIONS_BY_ACCESS_LEVEL[
                    selectedLevel
                  ] as Rbac.EnvironmentPermission[];
                  let subPermissions = SUB_ENV_PERMISSIONS_BY_ACCESS_LEVEL[
                    selectedLevel
                  ] as Rbac.EnvironmentPermission[];

                  if (
                    basePermissions.includes("read") &&
                    !basePermissions.includes("read_history")
                  ) {
                    basePermissions = basePermissions.concat(["read_history"]);
                  }

                  if (
                    subPermissions.includes("read_branches") &&
                    !subPermissions.includes("read_branches_history")
                  ) {
                    subPermissions = subPermissions.concat([
                      "read_branches_history",
                    ]);
                  }

                  setPermissionsByAppRoleIdState({
                    ...permissionsByAppRoleIdState,
                    [appRole.id]: basePermissions.concat(subPermissions),
                  });
                }}
                value={baseAccessLevel}
              >
                <option value="none">No Access</option>
                <option value="read_meta_only">Read Metadata Only</option>
                <option value="read_only">Read Only</option>
                <option value="read_write">Read / Write</option>
              </select>
              <SvgImage type="down-caret" />
            </div>
          </div>
          {permissionsSet.has("read") && !permissionsSet.has("write") ? (
            <div
              className={
                "field checkbox" +
                (permissionsSet.has("read_history") ? " selected" : "") +
                (submitting ? " disabled" : "")
              }
              onClick={() => {
                setPermissionsByAppRoleIdState({
                  ...permissionsByAppRoleIdState,
                  [appRole.id]: permissionsSet.has("read_history")
                    ? R.without(["read_history"], permissions)
                    : [...permissions, "read_history"],
                });
              }}
            >
              <label>Can read version history</label>
              <input
                type="checkbox"
                checked={permissionsSet.has("read_history")}
              />
            </div>
          ) : (
            ""
          )}
        </div>

        {baseAccessLevel == "none" ? (
          ""
        ) : (
          <div>
            <div className="field">
              <label>Branch Permissions</label>
              <div className="select">
                <select
                  disabled={appRole.hasFullEnvironmentPermissions || submitting}
                  onChange={(e) => {
                    const selectedLevel = e.target.value as AccessLevel;
                    const basePermissions =
                      BASE_ENV_PERMISSIONS_BY_ACCESS_LEVEL[
                        baseAccessLevel
                      ] as Rbac.EnvironmentPermission[];
                    const subPermissions = SUB_ENV_PERMISSIONS_BY_ACCESS_LEVEL[
                      selectedLevel
                    ] as Rbac.EnvironmentPermission[];

                    if (
                      subPermissions.includes("read_branches") &&
                      !subPermissions.includes("read_branches_history")
                    ) {
                      subPermissions.push("read_branches_history");
                    }

                    setPermissionsByAppRoleIdState({
                      ...permissionsByAppRoleIdState,
                      [appRole.id]: basePermissions.concat(subPermissions),
                    });
                  }}
                  value={subAccessLevel}
                >
                  <option value="none">No Access</option>
                  <option value="read_meta_only">Read Metadata Only</option>
                  {permissionsSet.has("read") ? (
                    <option value="read_only">Read Only</option>
                  ) : (
                    ""
                  )}
                  {permissionsSet.has("write") ? (
                    <option value="read_write">Read / Write</option>
                  ) : (
                    ""
                  )}
                </select>
                <SvgImage type="down-caret" />
              </div>
            </div>
            {permissionsSet.has("read_branches") &&
            !permissionsSet.has("write_branches") ? (
              <div
                className={
                  "field checkbox" +
                  (permissionsSet.has("read_branches_history")
                    ? " selected"
                    : "") +
                  (submitting ? " disabled" : "")
                }
                onClick={() => {
                  setPermissionsByAppRoleIdState({
                    ...permissionsByAppRoleIdState,
                    [appRole.id]: permissionsSet.has("read_branches_history")
                      ? R.without(["read_branches_history"], permissions)
                      : [...permissions, "read_branches_history"],
                  });
                }}
              >
                <label>Can read sub-envs version history</label>
                <input
                  type="checkbox"
                  checked={permissionsSet.has("read_branches_history")}
                />
              </div>
            ) : (
              ""
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.OrgContainer}>
      {editing ? (
        <h3>
          Editing <strong>{editing.name}</strong>
        </h3>
      ) : (
        <h3>
          New <strong>Environment</strong>
        </h3>
      )}

      {editing?.isDefault ? (
        <div>
          <div className="field">
            <label>Default Name</label>
            <p>{editing.defaultName}</p>
          </div>
          <div className="field">
            <label>Default Description</label>
            <p>{editing.defaultDescription}</p>
          </div>
        </div>
      ) : (
        ""
      )}

      <div className="field">
        <label>{editing?.isDefault ? "Visible Name" : "Name"}</label>
        <input
          type="text"
          disabled={submitting}
          autoFocus={!editing}
          placeholder="Enter environment name (required)..."
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <label>
          {editing?.isDefault ? "Visible Description" : "Description"}
        </label>
        <textarea
          placeholder="Enter a description (optional)... "
          disabled={submitting}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* <div
        className={
          "field checkbox" +
          (hasLocalKeys ? " selected" : "") +
          (submitting || editing?.isDefault ? " disabled" : "")
        }
        onClick={() => {
          if (editing?.isDefault) {
            return;
          }
          setHasLocalKeys(!hasLocalKeys);
        }}
      >
        <label>Is Local Development Environment</label>
        <input type="checkbox" checked={hasLocalKeys} />
      </div> */}

      {/* <div
        className={
          "field checkbox" +
          (hasServers ? " selected" : "") +
          (submitting || editing?.isDefault ? " disabled" : "")
        }
        onClick={() => {
          if (editing?.isDefault) {
            return;
          }
          setHasServers(!hasServers);
        }}
      >
        <label>Can Have Servers</label>
        <input type="checkbox" checked={hasServers} />
      </div> */}

      <div
        className={
          "field checkbox" +
          (defaultAllApps ? " selected" : "") +
          (submitting ? " disabled" : "")
        }
        onClick={() => {
          setDefaultAllApps(!defaultAllApps);
        }}
      >
        <label>Include In All Apps By Default</label>
        <input type="checkbox" checked={defaultAllApps} />
      </div>

      <div
        className={
          "field checkbox" +
          (defaultAllBlocks ? " selected" : "") +
          (submitting ? " disabled" : "")
        }
        onClick={() => {
          setDefaultAllBlocks(!defaultAllBlocks);
        }}
      >
        <label>Include In All Blocks By Default</label>
        <input type="checkbox" checked={defaultAllBlocks} />
      </div>

      {/* <div
        className={
          "field checkbox" +
          (autoCommit ? " selected" : "") +
          (submitting ? " disabled" : "")
        }
        onClick={() => {
          setAutoCommit(!autoCommit);
        }}
      >
        <label>Default Auto-Commit On Change</label>
        <input type="checkbox" checked={autoCommit} />
      </div> */}

      <div>{appRoles.map(renderAppRole)}</div>

      <div className="buttons">
        <button className="secondary" onClick={goBack}>
          ← Back
        </button>
        <button
          className="primary"
          disabled={!canSubmit || submitting}
          onClick={async () => {
            setSubmitting(true);

            const basePayload = {
              name,
              description,
              hasLocalKeys,
              settings: { autoCommit },
              defaultAllApps,
              defaultAllBlocks,
              appRoleEnvironmentRoles: permissionsByAppRoleIdState,
              hasServers,
            };

            const minDelayPromise = wait(MIN_ACTION_DELAY_MS);

            const res = await props.dispatch(
              editing
                ? {
                    type: Client.ActionType.RBAC_UPDATE_ENVIRONMENT_ROLE,
                    payload: { ...basePayload, id: editing.id },
                  }
                : {
                    type: Api.ActionType.RBAC_CREATE_ENVIRONMENT_ROLE,
                    payload: basePayload,
                  }
            );

            if (
              !editing &&
              envParent &&
              res.success &&
              ((envParent.type == "app" && !defaultAllApps) ||
                (envParent.type == "block" && !defaultAllBlocks))
            ) {
              const created = g
                .graphTypes(res.state.graph)
                .environmentRoles.find(
                  ({ createdAt }) => createdAt === res.state.graphUpdatedAt
                );
              if (created) {
                await props.dispatch({
                  type: Api.ActionType.CREATE_ENVIRONMENT,
                  payload: {
                    environmentRoleId: created.id,
                    envParentId: envParent.id,
                  },
                });
              }
            }

            await minDelayPromise;

            if (editing) {
              setSubmitting(false);
            } else {
              goBack();
            }
          }}
        >
          {submitLabel} Environment{submitting ? "..." : ""}
        </button>
      </div>
    </div>
  );
};

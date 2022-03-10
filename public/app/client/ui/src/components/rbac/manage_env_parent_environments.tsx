import React, { useState, useMemo, useEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Api, Rbac } from "@core/types";
import { Link } from "react-router-dom";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { stripUndefinedRecursive } from "@core/lib/utils/object";
import { SvgImage, SmallLoader } from "@images";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { wait } from "@core/lib/utils/wait";
import { logAndAlertError } from "@ui_lib/errors";

export const ManageEnvParentEnvironments: OrgComponent<
  { appId: string } | { blockId: string }
> = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const envParentId =
    "appId" in props.routeParams
      ? props.routeParams.appId
      : props.routeParams.blockId;
  const currentUserId = props.ui.loadedAccountId!;

  const {
    baseEnvironmentsByRoleId,
    baseEnvironmentSettingsByRoleId,
    environmentRoles,
    environmentRolesById,
  } = useMemo(() => {
    const baseEnvironments = g.authz.getVisibleBaseEnvironments(
      graph,
      currentUserId,
      envParentId
    );

    const baseEnvironmentsByRoleId = R.indexBy(
      R.prop("environmentRoleId"),
      baseEnvironments
    );

    const environmentRoles = g.graphTypes(graph).environmentRoles;

    return {
      baseEnvironmentsByRoleId,
      baseEnvironmentSettingsByRoleId: R.mapObjIndexed(
        (environment) => (environment.isSub ? {} : environment.settings),
        baseEnvironmentsByRoleId
      ),
      environmentRoles,
      environmentRolesById: R.indexBy(R.prop("id"), environmentRoles),
    };
  }, [graphUpdatedAt, envParentId, currentUserId]);

  const [addingEnvironmentsByRoleId, setAddingEnvironmentsByRoleId] = useState<
    Record<string, boolean>
  >({});

  const [removingEnvironmentsByRoleId, setRemovingEnvironmentsByRoleId] =
    useState<Record<string, boolean>>({});

  const [
    updatingEnvironmentSettingsByRoleId,
    setUpdatingEnvironmentSettingsByRoleId,
  ] = useState<Record<string, boolean>>({});

  const [
    environmentSettingsByRoleIdState,
    setEnvironmentSettingsByRoleIdState,
  ] = useState(baseEnvironmentSettingsByRoleId);

  const [awaitingMinDelayByRoleId, setAwaitingMinDelayByRoleId] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    setAddingEnvironmentsByRoleId({});
    setRemovingEnvironmentsByRoleId({});
    setUpdatingEnvironmentSettingsByRoleId({});
    setEnvironmentSettingsByRoleIdState(baseEnvironmentSettingsByRoleId);
  }, [envParentId]);

  const environmentSettingsUpdated = (roleId: string) => {
    const environment = baseEnvironmentsByRoleId[roleId];
    if (
      !environment ||
      environment.isSub ||
      !environmentSettingsByRoleIdState[roleId]
    ) {
      return false;
    }
    const settings = environment.settings;
    return !R.equals(
      stripUndefinedRecursive(settings),
      stripUndefinedRecursive(environmentSettingsByRoleIdState[roleId])
    );
  };

  const dispatchEnvironmentSettingsUpdate = () => {
    for (let roleId in environmentSettingsByRoleIdState) {
      if (
        updatingEnvironmentSettingsByRoleId[roleId] ||
        !environmentSettingsUpdated(roleId)
      ) {
        continue;
      }

      setUpdatingEnvironmentSettingsByRoleId({
        ...updatingEnvironmentSettingsByRoleId,
        [roleId]: true,
      });
      setAwaitingMinDelayByRoleId({
        ...awaitingMinDelayByRoleId,
        [roleId]: true,
      });
      wait(MIN_ACTION_DELAY_MS).then(() =>
        setAwaitingMinDelayByRoleId({
          ...awaitingMinDelayByRoleId,
          [roleId]: false,
        })
      );

      const environment = baseEnvironmentsByRoleId[roleId];
      props
        .dispatch({
          type: Api.ActionType.UPDATE_ENVIRONMENT_SETTINGS,
          payload: {
            id: environment.id,
            settings: environmentSettingsByRoleIdState[roleId],
          },
        })
        .then((res) => {
          if (!res.success) {
            logAndAlertError(
              `There was a problem updating environment settings.`,
              res.resultAction
            );
          }
        });
    }
  };

  useEffect(() => {
    dispatchEnvironmentSettingsUpdate();
  }, [JSON.stringify(environmentSettingsByRoleIdState)]);

  useEffect(() => {
    for (let roleId in environmentSettingsByRoleIdState) {
      if (
        updatingEnvironmentSettingsByRoleId[roleId] &&
        !awaitingMinDelayByRoleId[roleId]
      ) {
        setUpdatingEnvironmentSettingsByRoleId(
          R.omit([roleId], updatingEnvironmentSettingsByRoleId)
        );
      }
    }
  }, [
    JSON.stringify(baseEnvironmentSettingsByRoleId),
    JSON.stringify(awaitingMinDelayByRoleId),
  ]);

  useEffect(() => {
    const toOmitAdding = Object.keys(addingEnvironmentsByRoleId).filter(
      (roleId) => baseEnvironmentsByRoleId[roleId]
    );

    const awaitingMinDelay = Object.values(awaitingMinDelayByRoleId).some(
      Boolean
    );

    if (toOmitAdding.length > 0 && !awaitingMinDelay) {
      setAddingEnvironmentsByRoleId(
        R.omit(toOmitAdding, addingEnvironmentsByRoleId)
      );
    }

    const toOmitRemoving = Object.keys(removingEnvironmentsByRoleId).filter(
      (roleId) => !baseEnvironmentsByRoleId[roleId]
    );
    if (toOmitRemoving.length > 0 && !awaitingMinDelay) {
      setRemovingEnvironmentsByRoleId(
        R.omit(toOmitRemoving, removingEnvironmentsByRoleId)
      );
    }
  }, [
    JSON.stringify(baseEnvironmentsByRoleId),
    JSON.stringify(awaitingMinDelayByRoleId),
  ]);

  const renderEnvironmentRoleSettings = (role: Rbac.EnvironmentRole) => {
    let included: boolean;
    let includedEnvironment: Model.Environment | undefined;
    let removing = false;
    let adding = false;
    if (removingEnvironmentsByRoleId[role.id]) {
      included = false;
      removing = true;
    } else if (addingEnvironmentsByRoleId[role.id]) {
      included = true;
      adding = true;
    } else {
      includedEnvironment = baseEnvironmentsByRoleId[role.id];
      included = Boolean(includedEnvironment);
    }
    const updatingSettings = Boolean(
      updatingEnvironmentSettingsByRoleId[role.id]
    );
    const updating = removing || adding || updatingSettings;

    let autoCommitOption: "inherit" | "overrideTrue" | "overrideFalse";
    const autoCommit = environmentSettingsByRoleIdState[role.id]?.autoCommit;
    if (typeof autoCommit == "undefined") {
      autoCommitOption = "inherit";
    } else {
      autoCommitOption = autoCommit ? "overrideTrue" : "overrideFalse";
    }

    return (
      <div>
        <h4>
          {role.name} {updating ? <SmallLoader /> : ""}
        </h4>
        <div
          className={
            "field checkbox" +
            (included ? " selected" : "") +
            (updating ? " disabled" : "")
          }
          onClick={() => {
            if (updating) {
              return;
            }

            if (!awaitingMinDelayByRoleId[role.id]) {
              setAwaitingMinDelayByRoleId({
                ...awaitingMinDelayByRoleId,
                [role.id]: true,
              });
              wait(MIN_ACTION_DELAY_MS).then(() =>
                setAwaitingMinDelayByRoleId({
                  ...awaitingMinDelayByRoleId,
                  [role.id]: false,
                })
              );
            }

            if (included && includedEnvironment) {
              setRemovingEnvironmentsByRoleId({
                ...removingEnvironmentsByRoleId,
                [role.id]: true,
              });
              props
                .dispatch({
                  type: Api.ActionType.DELETE_ENVIRONMENT,
                  payload: { id: includedEnvironment.id },
                })
                .then((res) => {
                  if (!res.success) {
                    logAndAlertError(
                      `There was a problem deleting the environment.`,
                      res.resultAction
                    );
                  }
                });
            } else {
              setAddingEnvironmentsByRoleId({
                ...addingEnvironmentsByRoleId,
                [role.id]: true,
              });
              props
                .dispatch({
                  type: Api.ActionType.CREATE_ENVIRONMENT,
                  payload: { envParentId, environmentRoleId: role.id },
                })
                .then((res) => {
                  if (!res.success) {
                    logAndAlertError(
                      `There was a problem adding the environment.`,
                      res.resultAction
                    );
                  }
                });
            }
          }}
        >
          <label>Include environment</label>
          <input type="checkbox" checked={included} disabled={updating} />
        </div>
        {/* {includedEnvironment ? (
          <div className="field">
            <label>Auto-Commit On Change?</label>
            <div className="select">
              <select
                value={autoCommitOption}
                disabled={updating}
                onChange={(e) => {
                  let val: boolean | undefined;

                  if (e.target.value == "inherit") {
                    val = undefined;
                  } else {
                    val = e.target.value == "overrideTrue";
                  }

                  setEnvironmentSettingsByRoleIdState({
                    ...environmentSettingsByRoleIdState,
                    [role.id]: stripUndefinedRecursive({
                      ...environmentSettingsByRoleIdState[role.id],
                      autoCommit: val,
                    }),
                  });
                }}
              >
                <option value="inherit">
                  Inherit from org settings (
                  {environmentRolesById[role.id].settings?.autoCommit
                    ? "Yes"
                    : "No"}
                  )
                </option>
                <option value="overrideTrue">Yes</option>
                <option value="overrideFalse">No</option>
              </select>
              <SvgImage type="down-caret" />
            </div>
          </div>
        ) : (
          ""
        )} */}
      </div>
    );
  };

  return (
    <div>
      <div>
        <h3>
          Manage <strong>Environments</strong>
        </h3>

        {environmentRoles.map(renderEnvironmentRoleSettings)}
      </div>

      {g.authz.hasOrgPermission(
        graph,
        currentUserId,
        "org_manage_environment_roles"
      ) ? (
        <div className="buttons">
          <Link
            className="primary"
            to={props.match.url.replace(
              /\/settings$/,
              "/settings/environment-role-form"
            )}
          >
            Add Base Environment
          </Link>

          <Link
            className="tertiary"
            to={props.orgRoute("/my-org/environment-settings")}
          >
            Manage Org Environments
          </Link>
        </div>
      ) : (
        ""
      )}
    </div>
  );
};

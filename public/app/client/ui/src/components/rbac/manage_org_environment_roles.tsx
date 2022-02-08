import React, { useState, useMemo, useEffect, useLayoutEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Api, Rbac } from "@core/types";
import { stripUndefinedRecursive } from "@core/lib/utils/object";
import { Link } from "react-router-dom";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DroppableProvided,
} from "react-beautiful-dnd";
import { SmallLoader, SvgImage } from "@images";
import { MIN_ACTION_DELAY_MS } from "@constants";
import { wait } from "@core/lib/utils/wait";
import * as styles from "@styles";

export const ManageOrgEnvironmentRoles: OrgComponent = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const {
    environmentRoles,
    environmentRoleIds,
    environmentRolesById,
    environmentRoleSettingsById,
  } = useMemo(() => {
    const environmentRoles = g.graphTypes(graph).environmentRoles;
    const environmentRolesById = R.indexBy(R.prop("id"), environmentRoles);
    return {
      environmentRoles,
      environmentRoleIds: environmentRoles.map(R.prop("id")),
      environmentRolesById,
      environmentRoleSettingsById: R.mapObjIndexed(
        R.prop("settings"),
        environmentRolesById
      ),
    };
  }, [graphUpdatedAt, currentUserId]);

  const [
    updatingEnvironmentRoleSettingsById,
    setUpdatingEnvironmentRoleSettingsById,
  ] = useState<Record<string, true>>({});

  const [
    environmentRoleSettingsByIdState,
    setEnvironmentRoleSettingsByIdState,
  ] = useState(environmentRoleSettingsById);

  const [deletingEnvironmentRolesById, setDeletingEnvironmentRolesById] =
    useState<Record<string, true>>({});

  const [awaitingMinDelayByRoleId, setAwaitingMinDelayByRoleId] = useState<
    Record<string, boolean>
  >({});

  const [order, setOrder] = useState<string[]>(environmentRoleIds);
  const [updatingOrder, setUpdatingOrder] = useState(false);

  const orderedEnvironmentRoles = useMemo(
    () => R.sortBy(({ id }) => order.indexOf(id), environmentRoles),
    [order, environmentRoles]
  );

  useEffect(() => {
    const isEqual = R.equals(environmentRoleIds, order);
    if (updatingOrder) {
      if (isEqual && !Object.values(awaitingMinDelayByRoleId).some(Boolean)) {
        setUpdatingOrder(false);
      }
    } else {
      setOrder(environmentRoleIds);
    }
  }, [environmentRoleIds, JSON.stringify(awaitingMinDelayByRoleId)]);

  useEffect(() => {
    const toOmitDeleting: string[] = [];
    for (let id in deletingEnvironmentRolesById) {
      if (!environmentRolesById[id]) {
        toOmitDeleting.push(id);
      }
    }
    if (toOmitDeleting.length > 0) {
      setDeletingEnvironmentRolesById(
        R.omit(toOmitDeleting, deletingEnvironmentRolesById)
      );
    }

    const toOmitSettings: string[] = [];
    for (let id in environmentRoleSettingsByIdState) {
      if (!environmentRolesById[id]) {
        toOmitSettings.push(id);
      }
    }
    if (toOmitSettings.length > 0) {
      setEnvironmentRoleSettingsByIdState(
        R.omit(toOmitSettings, environmentRoleSettingsByIdState)
      );
    }
  }, [environmentRolesById, JSON.stringify(awaitingMinDelayByRoleId)]);

  const environmentRoleSettingsUpdated = (roleId: string) => {
    const environmentRole = environmentRolesById[roleId];

    const settings = environmentRole.settings;
    return !R.equals(
      stripUndefinedRecursive(settings),
      stripUndefinedRecursive(environmentRoleSettingsByIdState[roleId])
    );
  };

  const dispatchEnvironmentSettingsUpdate = () => {
    if (
      Object.values(updatingEnvironmentRoleSettingsById).some(Boolean) ||
      Object.values(deletingEnvironmentRolesById).some(Boolean) ||
      updatingOrder
    ) {
      return;
    }

    for (let roleId in environmentRoleSettingsByIdState) {
      if (!environmentRoleSettingsUpdated(roleId)) {
        continue;
      }

      setUpdatingEnvironmentRoleSettingsById({ [roleId]: true });
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

      const environmentRole = environmentRolesById[roleId];
      props.dispatch({
        type: Api.ActionType.RBAC_UPDATE_ENVIRONMENT_ROLE_SETTINGS,
        payload: {
          id: environmentRole.id,
          settings: environmentRoleSettingsByIdState[roleId],
        },
      });
    }
  };

  useEffect(() => {
    dispatchEnvironmentSettingsUpdate();
  }, [JSON.stringify(environmentRoleSettingsByIdState)]);

  useEffect(() => {
    for (let roleId in environmentRoleSettingsByIdState) {
      if (
        updatingEnvironmentRoleSettingsById[roleId] &&
        !awaitingMinDelayByRoleId[roleId]
      ) {
        setUpdatingEnvironmentRoleSettingsById(
          R.omit([roleId], updatingEnvironmentRoleSettingsById)
        );
      }
    }
  }, [
    JSON.stringify(environmentRoleSettingsById),
    JSON.stringify(awaitingMinDelayByRoleId),
  ]);

  const reorder = (startIndex: number, endIndex: number) => {
    if (
      Object.values(updatingEnvironmentRoleSettingsById).some(Boolean) ||
      Object.values(deletingEnvironmentRolesById).some(Boolean)
    ) {
      return;
    }

    const res = Array.from(order);
    const [removed] = res.splice(startIndex, 1);
    res.splice(endIndex, 0, removed);
    if (!R.equals(order, res)) {
      setOrder(res);
      setUpdatingOrder(true);
      for (let roleId in environmentRoleSettingsById) {
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
      }

      const newOrder = R.map(parseInt, R.invertObj(res)) as Record<
        string,
        number
      >;
      props.dispatch({
        type: Api.ActionType.RBAC_REORDER_ENVIRONMENT_ROLES,
        payload: newOrder,
      });
    }
  };

  const renderEnvironmentRole = (role: Rbac.EnvironmentRole, i: number) => {
    const updating = Boolean(updatingEnvironmentRoleSettingsById[role.id]);
    const autoCommit = environmentRoleSettingsByIdState[role.id]?.autoCommit;

    if (deletingEnvironmentRolesById[role.id]) {
      return (
        <div>
          <h4>
            {role.name} <SmallLoader />
          </h4>
        </div>
      );
    }

    return (
      <div>
        <Draggable key={role.id} draggableId={role.id} index={i}>
          {(provided, snapshot) => {
            const renderActions = () => {
              if (
                Object.values(updatingEnvironmentRoleSettingsById).some(
                  Boolean
                ) ||
                Object.values(deletingEnvironmentRolesById).some(Boolean) ||
                updatingOrder
              ) {
                return;
              }

              return (
                <div className="actions">
                  {role.isDefault ? (
                    ""
                  ) : (
                    <span
                      className="delete"
                      onClick={() => {
                        if (
                          Object.values(
                            updatingEnvironmentRoleSettingsById
                          ).some(Boolean) ||
                          Object.values(deletingEnvironmentRolesById).some(
                            Boolean
                          ) ||
                          updatingOrder
                        ) {
                          return;
                        }

                        if (
                          confirm(
                            `Delete the ${role.name} Environment across all your organization's apps and blocks?`
                          )
                        ) {
                          setDeletingEnvironmentRolesById({
                            ...deletingEnvironmentRolesById,
                            [role.id]: true,
                          });
                          props.dispatch({
                            type: Api.ActionType.RBAC_DELETE_ENVIRONMENT_ROLE,
                            payload: { id: role.id },
                          });
                        }
                      }}
                    >
                      <SvgImage type="x" />
                      <span>Delete</span>
                    </span>
                  )}
                  <Link
                    className="edit"
                    to={props.match.url.replace(
                      /\/environment-settings$/,
                      "/environment-settings/environment-role-form/" + role.id
                    )}
                  >
                    <SvgImage type="edit" />
                    <span>Edit {role.name} Details</span>
                  </Link>

                  <span
                    className="reorder"
                    {...(provided.dragHandleProps ?? {})}
                  >
                    <SvgImage type="reorder" />
                    <span>Drag To Change Default Order</span>
                  </span>
                </div>
              );
            };

            return (
              <div ref={provided.innerRef} {...provided.draggableProps}>
                <h4>
                  {role.name}

                  {updating || updatingOrder ? (
                    <SmallLoader />
                  ) : (
                    renderActions()
                  )}
                </h4>

                {role.description ? (
                  <div className="field no-margin">
                    <p>{role.description}</p>
                  </div>
                ) : (
                  ""
                )}

                {/* <div
                  className={
                    "field checkbox" +
                    (updating || updatingOrder ? " disabled" : "") +
                    (autoCommit ? " selected" : "")
                  }
                  onClick={() =>
                    setEnvironmentRoleSettingsByIdState({
                      ...environmentRoleSettingsByIdState,
                      [role.id]: stripUndefinedRecursive({
                        ...(environmentRoleSettingsByIdState[role.id] ?? {}),
                        autoCommit: !autoCommit,
                      }),
                    })
                  }
                >
                  <label>Default Auto-Commit On Change</label>
                  <input type="checkbox" checked={autoCommit} />
                </div> */}
              </div>
            );
          }}
        </Draggable>
      </div>
    );
  };

  return (
    <div className={styles.OrgContainer}>
      <h3>
        Manage Org <strong>Environments</strong>
      </h3>
      <DragDropContext
        onDragEnd={(res) => {
          // dropped outside the list
          if (!res.destination) {
            return;
          }
          reorder(res.source.index, res.destination.index);
        }}
      >
        <Droppable droppableId="droppable">
          {(provided, snapshot) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              {orderedEnvironmentRoles.map(renderEnvironmentRole)}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <div className="buttons">
        <Link
          className="primary"
          to={props.match.url.replace(
            /\/environment-settings$/,
            "/environment-settings/environment-role-form"
          )}
        >
          Add Base Environment
        </Link>
      </div>
    </div>
  );
};

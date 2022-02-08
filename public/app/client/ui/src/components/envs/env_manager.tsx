import React, { useEffect, useMemo, useState } from "react";
import {
  OrgComponent,
  EnvManagerProps,
  EnvManagerRouteProps,
  EnvsJustUpdated,
  emptyEnvManagerState,
} from "@ui_types";
import { Model, Client } from "@core/types";
import * as ui from "@ui";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { layout } from "@styles";
import { isMultiline } from "@core/lib/utils/string";
import { pick } from "@core/lib/utils/pick";
import { twitterShortTs } from "@core/lib/utils/date";
import * as styles from "@styles";
import { style } from "typestyle";
import { SvgImage } from "@images";
import { getEnvWithMeta } from "@core/lib/client";

export const EnvManager: OrgComponent<EnvManagerRouteProps> = (props) => {
  const { routeParams, core } = props;
  const { graph, graphUpdatedAt } = core;

  const searchParams = new URLSearchParams(props.location.search);
  const currentUserId = props.ui.loadedAccountId!;
  const currentDeviceId = props.core.orgUserAccounts[currentUserId]?.deviceId;

  const isSub = routeParams.subRoute == "sub-environments";
  const subEnvironmentId = routeParams.subEnvironmentId;

  const [envParentType, envParentId] = (
    "appId" in routeParams
      ? ["app", routeParams.appId]
      : ["block", routeParams.blockId]
  ) as [Model.EnvParent["type"], string];

  const envParent = graph[envParentId] as Model.EnvParent;
  const localsUserId = routeParams.userId;

  const [
    initialEnvsUpdatedAtByEnvParentId,
    setInitialEnvsUpdatedAtByEnvParentId,
  ] = useState<Record<string, number | undefined>>({});

  const [
    initialEnvWithMetaByEnvironmentId,
    setInitialEnvWithMetaByEnvironmentId,
  ] = useState<Record<string, Client.Env.EnvWithMeta>>({});

  const [envsJustUpdated, setEnvsJustUpdated] = useState<EnvsJustUpdated>();

  const [showRecentDiffs, setShowRecentDiffs] = useState(false);

  const setEnvManagerState: EnvManagerProps["setEnvManagerState"] = (
    update
  ) => {
    props.setUiState({
      envManager: { ...props.ui.envManager, ...update },
    });
  };

  const setEntryFormState: EnvManagerProps["setEntryFormState"] = (update) => {
    setEnvManagerState({
      entryForm: {
        ...props.ui.envManager.entryForm,
        ...update,
      },
    });
  };

  // clear env manager state when parent changes
  useEffect(
    () =>
      setEnvManagerState({
        ...emptyEnvManagerState,
        hideValues: props.ui.envManager.hideValues ?? true,
      }),
    [envParentId, localsUserId]
  );

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      const cell = (e.target as HTMLElement).closest(".cell");

      if (cell) {
        return;
      } else if (
        props.ui.envManager.editingEntryKey ||
        props.ui.envManager.editingEnvParentId ||
        props.ui.envManager.entryForm.editingEntryKey ||
        props.ui.envManager.entryForm.editingEnvironmentId
      ) {
        setEnvManagerState({
          editingEntryKey: undefined,
          editingEnvParentId: undefined,
          editingEnvironmentId: undefined,
          editingInputVal: undefined,
          clickedToEdit: undefined,
          entryForm: {
            ...props.ui.envManager.entryForm,
            editingEntryKey: undefined,
            editingEnvironmentId: undefined,
            clickedToEdit: undefined,
          },
        });
      }
    };
    document.documentElement.addEventListener("click", fn);
    return () => {
      document.documentElement.removeEventListener("click", fn);
    };
  }, [props.ui.envManager]);

  const { connectedBlocks, connectedBlockIds } = useMemo(() => {
    if (envParentType == "block") {
      return {
        connectedBlocks: [],
        connectedBlockIds: [],
      };
    }
    const connectedBlocks = g.getConnectedBlocksForApp(graph, envParentId);

    return {
      connectedBlocks,
      connectedBlockIds: connectedBlocks.map(R.prop("id")),
    };
  }, [envParentId, graphUpdatedAt]);

  useEffect(() => {
    const tempInitialEnvsUpdatedAtByEnvParentId: typeof initialEnvsUpdatedAtByEnvParentId =
      {};
    const tempInitialEnvWithMetaByEnvironmentId: typeof initialEnvWithMetaByEnvironmentId =
      {};

    for (let { envsOrLocalsUpdatedAt, id, localsUpdatedAtByUserId } of [
      envParent,
      ...connectedBlocks,
    ]) {
      tempInitialEnvsUpdatedAtByEnvParentId[id] = envsOrLocalsUpdatedAt;

      const environments = g.getEnvironmentsByEnvParentId(graph)[id] ?? [];
      for (let environment of environments) {
        tempInitialEnvWithMetaByEnvironmentId[environment.id] = getEnvWithMeta(
          core,
          { envParentId: id, environmentId: environment.id }
        );
      }

      for (let localsUserId in localsUpdatedAtByUserId) {
        const composite = [id, localsUserId].join("|");

        tempInitialEnvWithMetaByEnvironmentId[composite] = getEnvWithMeta(
          core,
          {
            envParentId: id,
            environmentId: composite,
          }
        );
      }
    }

    setInitialEnvsUpdatedAtByEnvParentId(tempInitialEnvsUpdatedAtByEnvParentId);
    setInitialEnvWithMetaByEnvironmentId(tempInitialEnvWithMetaByEnvironmentId);
  }, [envParentId, JSON.stringify(connectedBlockIds)]);

  useEffect(() => {
    let latestJustUpdatedAt = 0;
    const updatedEnvironmentIds: string[] = [];
    let updatedById: string | undefined;

    const tempInitialEnvsUpdatedAtByEnvParentId: typeof initialEnvsUpdatedAtByEnvParentId =
      {};
    const tempInitialEnvWithMetaByEnvironmentId: typeof initialEnvWithMetaByEnvironmentId =
      {};

    for (let envParentId in initialEnvsUpdatedAtByEnvParentId) {
      const initialUpdatedAt = initialEnvsUpdatedAtByEnvParentId[envParentId];
      const fetchedAt = props.core.envsFetchedAt[envParentId];

      if (fetchedAt && initialUpdatedAt != fetchedAt) {
        let encryptedById: string | undefined;
        let updatedEnvironmentId: string | undefined;

        const updatedEnvironment = (
          g.getEnvironmentsByEnvParentId(graph)[envParentId] ?? []
        ).find(({ envUpdatedAt }) => envUpdatedAt == fetchedAt);

        if (updatedEnvironment) {
          updatedEnvironmentId = updatedEnvironment.id;
          encryptedById = updatedEnvironment.encryptedById!;
        } else {
          for (let localsUserId in envParent.localsUpdatedAtByUserId) {
            if (envParent.localsUpdatedAtByUserId[localsUserId] == fetchedAt) {
              updatedEnvironmentId = [envParent.id, localsUserId].join("|");
              encryptedById = envParent.localsEncryptedBy[localsUserId];
            }
          }
        }

        if (
          encryptedById &&
          encryptedById != currentDeviceId &&
          updatedEnvironmentId
        ) {
          updatedEnvironmentIds.push(updatedEnvironmentId);

          if (fetchedAt > latestJustUpdatedAt) {
            updatedById = encryptedById;
            latestJustUpdatedAt = fetchedAt;
          }
        }

        tempInitialEnvsUpdatedAtByEnvParentId[envParentId] = fetchedAt;
        const environments =
          g.getEnvironmentsByEnvParentId(graph)[envParentId] ?? [];
        for (let environment of environments) {
          tempInitialEnvWithMetaByEnvironmentId[environment.id] =
            getEnvWithMeta(core, {
              envParentId,
              environmentId: environment.id,
            });
        }
      }
    }

    if (latestJustUpdatedAt && updatedById) {
      setEnvsJustUpdated({
        updatedAt: latestJustUpdatedAt,
        compareEnvWithMetaByEnvironmentId: initialEnvWithMetaByEnvironmentId,
        updatedEnvironmentIds,
        updatedById,
      });

      setInitialEnvsUpdatedAtByEnvParentId(
        tempInitialEnvsUpdatedAtByEnvParentId
      );
      setInitialEnvWithMetaByEnvironmentId(
        tempInitialEnvWithMetaByEnvironmentId
      );
    }
  }, [
    envParentId,
    JSON.stringify(connectedBlockIds),
    JSON.stringify(
      Object.values(
        pick([envParentId, ...connectedBlockIds], props.core.envsFetchedAt)
      )
    ),
  ]);

  const tentativeEnvironmentIds = useMemo(() => {
    if (subEnvironmentId && subEnvironmentId != "new") {
      return [subEnvironmentId];
    }

    if (props.routeParams.environmentId) {
      return [props.routeParams.environmentId];
    }

    return g.authz.getVisibleBaseEnvironmentAndLocalIds(
      graph,
      props.ui.loadedAccountId!,
      envParentId,
      localsUserId
    );
  }, [
    graphUpdatedAt,
    envParentId,
    localsUserId,
    props.ui.loadedAccountId,
    props.routeParams.environmentId,
    props.routeParams.subEnvironmentId,
  ]);

  const getUiProps = (environmentIds: string[]) => {
    const sidebarWidth = styles.layout.SIDEBAR_WIDTH;
    const viewWidth = props.winWidth - sidebarWidth;
    const entryColWidth = Math.min(
      Math.max(
        viewWidth * props.ui.envManager.entryColPct,
        layout.ENTRY_COL_MIN_WIDTH
      ),
      layout.ENTRY_COL_MAX_WIDTH
    );
    let tentativeValColsWidth = viewWidth - entryColWidth * (isSub ? 2 : 1);

    const showLeftNav =
      environmentIds.length > 1 &&
      props.ui.envManager.environmentStartIndex > 0;

    const tentativeShowRightNav =
      environmentIds.length > 1 &&
      props.ui.envManager.environmentStartIndex != environmentIds.length - 1;

    if (showLeftNav) {
      tentativeValColsWidth =
        tentativeValColsWidth - styles.layout.ENV_LABEL_ROW_BUTTON_WIDTH;
    }
    if (tentativeShowRightNav) {
      tentativeValColsWidth =
        tentativeValColsWidth - styles.layout.ENV_LABEL_ROW_BUTTON_WIDTH;
    }

    const tentativeMaxValCols = isSub
      ? 1
      : Math.max(
          1,
          Math.floor(tentativeValColsWidth / layout.ENV_MIN_COL_WIDTH)
        );
    const tentativeNumValCols = Math.min(
      environmentIds.length,
      tentativeMaxValCols
    );

    const tentativeVisibleEnvironmentIds =
      environmentIds.length > tentativeNumValCols
        ? environmentIds.slice(
            props.ui.envManager.environmentStartIndex,
            props.ui.envManager.environmentStartIndex + tentativeNumValCols
          )
        : environmentIds;

    const showRightNav =
      tentativeShowRightNav &&
      R.last(environmentIds) != R.last(tentativeVisibleEnvironmentIds);

    let valColsWidth = viewWidth - entryColWidth * (isSub ? 2 : 1);

    if (showLeftNav) {
      valColsWidth = valColsWidth - styles.layout.ENV_LABEL_ROW_BUTTON_WIDTH;
    }
    if (showRightNav) {
      valColsWidth = valColsWidth - styles.layout.ENV_LABEL_ROW_BUTTON_WIDTH;
    }

    const maxValCols = isSub
      ? 1
      : Math.max(1, Math.floor(valColsWidth / layout.ENV_MIN_COL_WIDTH));
    let numValCols = Math.min(environmentIds.length, maxValCols);

    const visibleEnvironmentIds =
      environmentIds.length > numValCols
        ? environmentIds.slice(
            props.ui.envManager.environmentStartIndex,
            props.ui.envManager.environmentStartIndex + numValCols
          )
        : environmentIds;

    if (numValCols > visibleEnvironmentIds.length) {
      numValCols = visibleEnvironmentIds.length;
    }

    const valColWidth = valColsWidth / numValCols;

    const headerHeight = layout.MAIN_HEADER_HEIGHT;
    const labelRowHeight = layout.ENV_LABEL_ROW_HEIGHT;

    const viewHeight =
      props.winHeight - (headerHeight + props.ui.pendingFooterHeight);

    const gridHeight = viewHeight - (labelRowHeight + 1);

    const subEnvsListWidth = entryColWidth * 1.1666;

    return {
      viewWidth,
      viewHeight,
      headerHeight,
      labelRowHeight,
      gridHeight,
      numValCols,
      entryColWidth,
      valColWidth,
      subEnvsListWidth,
      showLeftNav,
      showRightNav,
      visibleEnvironmentIds,
    };
  };

  let {
    viewWidth,
    viewHeight,
    headerHeight,
    labelRowHeight,
    gridHeight,
    numValCols,
    entryColWidth,
    valColWidth,
    subEnvsListWidth,
    showLeftNav,
    showRightNav,
    visibleEnvironmentIds,
  } = getUiProps(tentativeEnvironmentIds);

  const parentEnvironmentId = isSub
    ? props.routeParams.environmentId!
    : undefined;

  const editingMultiline = useMemo(
    () =>
      Boolean(
        (props.ui.envManager.editingEnvironmentId &&
          isMultiline(
            props.ui.envManager.editingInputVal ?? "",
            valColWidth
          )) ||
          (props.ui.envManager.entryForm.editingEnvironmentId &&
            isMultiline(
              props.ui.envManager.entryForm.vals[
                props.ui.envManager.entryForm.editingEnvironmentId
              ]?.val ?? "",
              valColWidth
            ))
      ),
    [
      props.ui.envManager.editingEnvironmentId,
      props.ui.envManager.editingInputVal,
      props.ui.envManager.entryForm.editingEnvironmentId,
      props.ui.envManager.entryForm.vals,
      valColWidth,
    ]
  );

  const allEnvironmentIds = editingMultiline
    ? [
        props.ui.envManager.editingEnvironmentId ??
          props.ui.envManager.entryForm.editingEnvironmentId!,
      ]
    : tentativeEnvironmentIds;

  if (editingMultiline) {
    ({
      viewWidth,
      viewHeight,
      headerHeight,
      labelRowHeight,
      gridHeight,
      numValCols,
      entryColWidth,
      valColWidth,
      subEnvsListWidth,
      showLeftNav,
      showRightNav,
      visibleEnvironmentIds,
    } = getUiProps(allEnvironmentIds));
  }

  const envManagerProps: EnvManagerProps = {
    envParentType,
    envParentId,
    localsUserId,
    setEnvManagerState,
    setEntryFormState,
    viewWidth,
    viewHeight,
    headerHeight,
    labelRowHeight,
    envRowHeight: layout.ENV_ROW_HEIGHT,
    gridHeight,
    numValCols,
    entryColWidth,
    valColWidth,
    subEnvsListWidth,
    editingMultiline,
    isSub,
    parentEnvironmentId,
    showLeftNav,
    showRightNav,
    allEnvironmentIds,
    visibleEnvironmentIds,
    connectedBlocks,
    connectedBlockIds,
    envsJustUpdated,
  };

  const renderEnvsJustUpdated = () => {
    if (envsJustUpdated) {
      return (
        <div className="envs-just-updated">
          <div
            className={
              "title-row " +
              style({
                width: `calc(100% - ${isSub ? entryColWidth : 0}px)`,
              })
            }
          >
            <label>
              Environments updated{" "}
              {twitterShortTs(envsJustUpdated?.updatedAt ?? 0, props.ui.now)}
              {" by " + g.getUserName(graph, envsJustUpdated.updatedById)}
              <span
                className="link-button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowRecentDiffs(true);
                }}
              >
                See changes
              </span>
            </label>

            <div className="actions">
              <span
                className="remove"
                onClick={() => {
                  setEnvsJustUpdated(undefined);
                }}
              >
                <SvgImage type="x" />
              </span>
            </div>
          </div>
        </div>
      );
    }
  };

  const childProps = { ...props, ...envManagerProps };

  let contents: React.ReactNode[] = [];

  contents.push(
    renderEnvsJustUpdated(),
    envsJustUpdated && showRecentDiffs ? (
      <ui.DiffsModal
        {...props}
        envParentId={envParentId}
        compareEnvWithMetaByEnvironmentId={
          envsJustUpdated.compareEnvWithMetaByEnvironmentId
        }
        back={() => setShowRecentDiffs(false)}
      />
    ) : (
      ""
    ),
    <ui.LabelRow {...childProps} />,
    props.ui.envManager.showAddForm ? <ui.AddTabs {...childProps} /> : ""
  );

  if (isSub) {
    contents.push(<ui.SubEnvs {...childProps} />);
  } else if (
    !(
      editingMultiline &&
      props.ui.envManager.showAddForm &&
      props.ui.envManager.entryForm.editingEnvironmentId
    )
  ) {
    contents.push(
      envParentType == "app" ? (
        <ui.AppEnvGrid {...childProps} />
      ) : (
        <ui.BlockEnvGrid {...childProps} />
      )
    );
  }

  if (searchParams.get("exportEnvironmentId")) {
    contents.push(<ui.EnvExport {...props} />);
  } else if (searchParams.get("importEnvironmentId")) {
    contents.push(<ui.EnvImport {...props} />);
  }

  if (editingMultiline) {
    contents.push(
      <ui.MultilineCopy
        width={entryColWidth}
        left={props.ui.sidebarWidth + (isSub ? subEnvsListWidth : 0)}
        top={
          headerHeight +
          labelRowHeight +
          layout.ENV_ROW_HEIGHT +
          (props.ui.envManager.showAddForm ? layout.ENV_ROW_HEIGHT : 0)
        }
      />
    );
  }

  return (
    <div
      className={
        styles.EnvManager +
        (props.ui.envManager.showAddForm ? " showing-add-form" : "") +
        (isSub ? " is-sub" : "") +
        (editingMultiline ? " editing-multiline" : "") +
        (props.ui.envManager.editingEntryKey ? " editing" : "") +
        " " +
        style({
          paddingBottom: editingMultiline ? 0 : props.ui.pendingFooterHeight,
          transition: "paddingBottom",
          transitionDuration: "0.2s",
        })
      }
    >
      {contents}
    </div>
  );
};

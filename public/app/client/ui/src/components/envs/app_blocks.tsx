import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { EnvManagerComponent } from "@ui_types";
import { Model, Api } from "@core/types";
import * as ui from "@ui";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import * as styles from "@styles";
import { SvgImage, SmallLoader } from "@images";
import { getCurrentUserEntryKeys } from "@core/lib/client";
import { logAndAlertError } from "@ui_lib/errors";

export const AppBlocks: EnvManagerComponent = (props) => {
  const {
    connectedBlocks,
    connectedBlockIds,
    core: { graph, graphUpdatedAt },
  } = props;

  const currentUserId = props.ui.loadedAccountId!;

  const filter = props.ui.envManager.filter?.trim().toLowerCase();

  const [order, setOrder] = useState<string[]>(connectedBlockIds);
  const [updatingOrder, setUpdatingOrder] = useState(false);
  const [removingId, setRemovingId] = useState<string>();

  const getEnvironmentMapFn =
    (block: Model.Block) => (appEnvironmentId: string) => {
      const appEnvironment = props.localsUserId
        ? undefined
        : (graph[appEnvironmentId] as Model.Environment);

      const blockEnvironmentIds = g
        .getConnectedBlockEnvironmentsForApp(
          graph,
          props.envParentId,
          block.id,
          appEnvironmentId
        )
        .map(R.prop("id"));

      const blockEnvironmentId = appEnvironment?.isSub
        ? blockEnvironmentIds.find(
            (id) => (graph[id] as Model.Environment).isSub
          )
        : blockEnvironmentIds[0];

      return blockEnvironmentId ?? "";
    };

  const allConnectedEnvironmentIdsByBlockId = useMemo(() => {
    const res: Record<string, string[]> = {};

    for (let block of connectedBlocks) {
      const connectedBlockEnvironmentIds = props.localsUserId
        ? [[block.id, props.localsUserId].join("|")]
        : props.allEnvironmentIds.flatMap(getEnvironmentMapFn(block));

      res[block.id] = connectedBlockEnvironmentIds;
    }

    return res;
  }, [
    graphUpdatedAt,
    props.envParentId,
    props.localsUserId,
    JSON.stringify(props.allEnvironmentIds),
  ]);

  const visibleConnectedEnvironmentIdsByBlockId = useMemo(() => {
    const res: Record<string, string[]> = {};

    for (let block of connectedBlocks) {
      const connectedBlockEnvironmentIds = props.localsUserId
        ? [[block.id, props.localsUserId].join("|")]
        : props.visibleEnvironmentIds.flatMap(getEnvironmentMapFn(block));

      res[block.id] = connectedBlockEnvironmentIds;
    }

    return res;
  }, [
    graphUpdatedAt,
    props.envParentId,
    props.localsUserId,
    JSON.stringify(props.visibleEnvironmentIds),
  ]);

  const orderedConnected = useMemo(() => {
    let connected = connectedBlocks;

    if (props.isSub) {
      connected = connected.filter((block) => {
        const visibleBlockEnvironmentIds = (
          visibleConnectedEnvironmentIdsByBlockId[block.id] ?? []
        ).filter(Boolean);
        return visibleBlockEnvironmentIds.length > 0;
      });
    }

    if (filter) {
      connected = connected.filter((block) => {
        const keys = getCurrentUserEntryKeys(
          props.core,
          props.ui.loadedAccountId!,
          allConnectedEnvironmentIdsByBlockId[block.id] ?? [],
          true
        );

        const filtered = keys.filter((entryKey) =>
          entryKey.toLowerCase().includes(filter)
        );

        return filtered.length > 0;
      });
    }

    return R.sortBy(({ id }) => order.indexOf(id), connected);
  }, [order, graphUpdatedAt, filter]);

  useEffect(() => {
    const isEqual = R.equals(connectedBlockIds, order);
    if (updatingOrder) {
      if (isEqual) {
        setUpdatingOrder(false);
      }
    } else {
      setOrder(connectedBlockIds);
    }

    if (removingId && !connectedBlockIds.includes(removingId)) {
      setRemovingId(undefined);
    }
  }, [connectedBlockIds]);

  const reorder = (startIndex: number, endIndex: number) => {
    const res = Array.from(order);
    const [removed] = res.splice(startIndex, 1);
    res.splice(endIndex, 0, removed);

    if (R.equals(order, res)) {
      return;
    }

    setOrder(res);
    setUpdatingOrder(true);
    const newOrder = R.map(parseInt, R.invertObj(res)) as Record<
      string,
      number
    >;
    props
      .dispatch({
        type: Api.ActionType.REORDER_BLOCKS,
        payload: {
          appId: props.envParentId,
          order: newOrder,
        },
      })
      .then((res) => {
        if (!res.success) {
          logAndAlertError(
            `There was a problem reordering blocks.`,
            (res.resultAction as any).payload
          );
        }
      });
  };

  const renderBlock = (block: Model.Block, i: number) => {
    const connectedBlockEnvironmentIds =
      allConnectedEnvironmentIdsByBlockId[block.id] ?? [];

    const visibleConnectedBlockEnvironmentIds =
      visibleConnectedEnvironmentIdsByBlockId[block.id] ?? [];

    if (
      props.isSub &&
      visibleConnectedBlockEnvironmentIds.filter(Boolean).length == 0
    ) {
      return;
    }

    if (props.editingMultiline) {
      if (
        !props.ui.envManager.editingEnvironmentId ||
        !visibleConnectedBlockEnvironmentIds.includes(
          props.ui.envManager.editingEnvironmentId
        )
      ) {
        return;
      }
    }

    return (
      <div className="env-block">
        <BlockItem
          {...props}
          currentUserId={currentUserId}
          appId={props.envParentId}
          block={block}
          connectedBlockEnvironmentIds={connectedBlockEnvironmentIds}
          visibleConnectedBlockEnvironmentIds={
            visibleConnectedBlockEnvironmentIds
          }
          editingEnvironmentId={props.ui.envManager.editingEnvironmentId}
          updatingOrder={updatingOrder}
          i={i}
          setRemovingId={setRemovingId}
          removingId={removingId}
        />
      </div>
    );
  };

  let toggleBlocks = props.editingMultiline ? (
    ""
  ) : (
    <div
      className={
        "title-row toggle-blocks" +
        (props.ui.envManager.showBlocks ? " expanded" : " collapsed")
      }
      onClick={(e) => {
        e.stopPropagation();

        props.setEnvManagerState({
          showBlocks: !props.ui.envManager.showBlocks,
          userSetShowBlocks: props.ui.envManager.showBlocks ? undefined : true,
        });
      }}
    >
      <span className="label">
        {orderedConnected.length > 0 ? <SvgImage type="triangle" /> : ""}
        <SvgImage type="block" />
        <label>
          {orderedConnected.length} Connected Block
          {orderedConnected.length == 1 ? "" : "s"}
        </label>
      </span>
    </div>
  );

  if (props.connectedBlocks.length > 0 && !props.ui.envManager.showBlocks) {
    return <div className={styles.EnvBlocks}>{toggleBlocks}</div>;
  }

  return (
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
          <div
            className={styles.EnvBlocks}
            {...provided.droppableProps}
            ref={provided.innerRef}
          >
            {[toggleBlocks, ...orderedConnected.map(renderBlock)]}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};

const BlockItem: EnvManagerComponent<
  {},
  {
    currentUserId: string;
    appId: string;
    block: Model.Block;
    connectedBlockEnvironmentIds: string[];
    visibleConnectedBlockEnvironmentIds: string[];
    editingMultiline: boolean;
    editingEnvironmentId?: string;
    i: number;
    updatingOrder: boolean;
    removingId: string | undefined;
    setRemovingId: (id: string) => void;
  }
> = (props) => {
  const {
    currentUserId,
    appId,
    block,
    connectedBlockEnvironmentIds,
    visibleConnectedBlockEnvironmentIds,
    editingMultiline,
    editingEnvironmentId,
    updatingOrder,
    i,
    removingId,
    setRemovingId,
    core: { graph },
  } = props;

  return (
    <Draggable key={block.id} draggableId={block.id} index={i}>
      {(provided, snapshot) => {
        let actionsContent: React.ReactNode;
        if (removingId == block.id || updatingOrder) {
          actionsContent = <SmallLoader />;
        } else {
          actionsContent = [
            <span
              className="edit"
              onClick={() => {
                props.history.push(
                  props.match.url.replace(
                    `/apps/${props.envParentId}`,
                    `/blocks/${block.id}`
                  )
                );
              }}
            >
              <SvgImage type="edit" />
              <span>Edit</span>
            </span>,

            g.authz.canDisconnectBlock(graph, currentUserId, {
              appId,
              blockId: block.id,
            }) ? (
              <span
                className="remove"
                onClick={(e) => {
                  const appBlock =
                    g.getAppBlocksByComposite(graph)[
                      [props.envParentId, block.id].join("|")
                    ];
                  if (!appBlock) {
                    return;
                  }
                  setRemovingId(block.id);
                  props
                    .dispatch({
                      type: Api.ActionType.DISCONNECT_BLOCK,
                      payload: {
                        id: appBlock.id,
                      },
                    })
                    .then((res) => {
                      if (!res.success) {
                        logAndAlertError(
                          `There was a problem disconnecting the block.`,
                          (res.resultAction as any).payload
                        );
                      }
                    });
                }}
              >
                <SvgImage type="x" />
                <span>Disconnect</span>
              </span>
            ) : (
              ""
            ),

            g.authz.canReorderBlocks(graph, currentUserId, appId) ? (
              <span className="reorder" {...(provided.dragHandleProps ?? {})}>
                <SvgImage type="reorder" />
                <span>Reorder</span>
              </span>
            ) : (
              ""
            ),
          ];
        }

        return (
          <div ref={provided.innerRef} {...provided.draggableProps}>
            <div className="title-row">
              <Link
                className="label"
                to={props.match.url.replace(
                  `/apps/${props.envParentId}`,
                  `/blocks/${block.id}`
                )}
              >
                <SvgImage type="block" />
                <span>
                  <small>Connected Block</small>
                  <SvgImage type="right-caret" />
                  <label>{block.name}</label>
                </span>
              </Link>

              <div
                className={
                  "actions" + (removingId || updatingOrder ? " disabled" : "")
                }
              >
                {actionsContent}
              </div>
            </div>
            <ui.EnvGrid
              {...{
                ...props,
                envParentType: "block",
                envParentId: block.id,
                visibleEnvironmentIds:
                  editingMultiline && editingEnvironmentId
                    ? [editingEnvironmentId]
                    : visibleConnectedBlockEnvironmentIds,
                isConnectedBlock: true,
                connectedBlockEnvironmentIds,
              }}
            />
          </div>
        );
      }}
    </Draggable>
  );
};

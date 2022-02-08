import { apiAction } from "../handler";
import { Api, Rbac } from "@core/types";
import * as graphKey from "../graph_key";
import { pick } from "@core/lib/utils/pick";
import {
  graphTypes,
  getAppBlocksByComposite,
  deleteGraphObjects,
  getDeleteBlockProducer,
  authz,
  getEnvironmentsByEnvParentId,
  getConnectedActiveGeneratedEnvkeys,
  getActiveGeneratedEnvkeysByAppId,
} from "@core/lib/graph";
import { v4 as uuid } from "uuid";
import * as R from "ramda";
import produce from "immer";
import { log } from "@core/lib/utils/logger";
import { getScope } from "@core/lib/blob";

apiAction<
  Api.Action.RequestActions["CreateBlock"],
  Api.Net.ApiResultTypes["CreateBlock"]
>({
  type: Api.ActionType.CREATE_BLOCK,
  graphAction: true,
  authenticated: true,
  graphScopes: [(auth) => () => [auth.user.skey + "$"]],
  graphAuthorizer: async (action, orgGraph, userGraph, auth) =>
    authz.canCreateBlock(userGraph, auth.user.id),
  graphHandler: async (action, orgGraph, auth, now) => {
    const blockId = uuid(),
      allEnvironmentRoles = graphTypes(orgGraph).environmentRoles,
      defaultEnvironmentRoles = allEnvironmentRoles.filter(
        R.propEq("defaultAllBlocks", true as boolean)
      ),
      environments = defaultEnvironmentRoles.map<Api.Db.Environment>(
        ({ id: environmentRoleId }) => {
          const id = uuid();
          return {
            type: "environment",
            id,
            ...graphKey.environment(auth.org.id, blockId, id),
            envParentId: blockId,
            environmentRoleId,
            isSub: false,
            settings: {},
            createdAt: now,
            updatedAt: now,
          };
        }
      ),
      block: Api.Db.Block = {
        type: "block",
        id: blockId,
        ...graphKey.block(auth.org.id, blockId),
        ...pick(["name", "settings"], action.payload),
        localsUpdatedAtByUserId: {},
        localsEncryptedBy: {},
        localsReencryptionRequiredAt: {},
        createdAt: now,
        updatedAt: now,
      };

    return {
      type: "graphHandlerResult",
      handlerContext: {
        type: action.type,
        createdId: blockId,
      },
      graph: {
        ...orgGraph,
        ...R.indexBy(R.prop("id"), [block, ...environments]),
      },
      logTargetIds: [blockId],
    };
  },
});

apiAction<
  Api.Action.RequestActions["RenameBlock"],
  Api.Net.ApiResultTypes["RenameBlock"]
>({
  type: Api.ActionType.RENAME_BLOCK,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) =>
    authz.canRenameBlock(userGraph, auth.user.id, id),
  graphHandler: async ({ payload: { id, name } }, orgGraph, auth, now) => {
    return {
      type: "graphHandlerResult",
      graph: {
        ...orgGraph,
        [id]: {
          ...orgGraph[id],
          name,
          updatedAt: now,
        },
      },
      logTargetIds: [id],
    };
  },
});

apiAction<
  Api.Action.RequestActions["UpdateBlockSettings"],
  Api.Net.ApiResultTypes["UpdateBlockSettings"]
>({
  type: Api.ActionType.UPDATE_BLOCK_SETTINGS,
  graphAction: true,
  authenticated: true,
  graphScopes: [
    (auth, { payload: { id } }) =>
      () =>
        [auth.user.skey + "$", graphKey.block(auth.org.id, id).skey + "$"],
  ],
  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) =>
    authz.canUpdateBlockSettings(userGraph, auth.user.id, id),
  graphHandler: async (action, orgGraph, auth, now) => {
    const block = orgGraph[action.payload.id] as Api.Db.Block;

    return {
      type: "graphHandlerResult",
      graph: {
        ...orgGraph,
        [block.id]: {
          ...block,
          settings: {
            ...block.settings,
            ...action.payload.settings,
          },
          updatedAt: now,
        },
      },
      logTargetIds: [action.payload.id],
    };
  },
});

apiAction<
  Api.Action.RequestActions["DeleteBlock"],
  Api.Net.ApiResultTypes["DeleteBlock"]
>({
  type: Api.ActionType.DELETE_BLOCK,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) =>
    authz.canDeleteBlock(userGraph, auth.user.id, id),
  graphHandler: async (action, orgGraph, auth, now) => {
    const blockId = action.payload.id;

    const transactionItems: Api.Db.ObjectTransactionItems = {
      hardDeleteEncryptedBlobParams: [
        {
          orgId: auth.org.id,
          envParentId: blockId,
          blobType: "env",
        },
        {
          orgId: auth.org.id,
          envParentId: blockId,
          blobType: "changeset",
        },
      ],
      hardDeleteScopes: [
        {
          pkey: `encryptedKeys|${auth.org.id}`,
          pkeyPrefix: true,
          scope: getScope({
            envParentId: blockId,
            blobType: "env",
          }),
        },
        {
          pkey: `encryptedKeys|${auth.org.id}`,
          pkeyPrefix: true,
          scope: getScope({
            envParentId: blockId,
            blobType: "changeset",
          }),
        },
      ],
    };

    return {
      type: "graphHandlerResult",
      graph: produce(orgGraph, getDeleteBlockProducer(blockId, now)),
      transactionItems,
      logTargetIds: [blockId],
      updatedGeneratedEnvkeyIds: getUpdatedGeneratedEnvkeyIds(
        orgGraph,
        orgGraph,
        blockId
      ),
    };
  },
});

apiAction<
  Api.Action.RequestActions["ConnectBlock"],
  Api.Net.ApiResultTypes["ConnectBlock"]
>({
  type: Api.ActionType.CONNECT_BLOCK,
  graphAction: true,
  authenticated: true,
  reorderBlobsIfNeeded: true,
  graphAuthorizer: async (
    { payload: { blockId, appId } },
    orgGraph,
    userGraph,
    auth
  ) => authz.canConnectBlock(userGraph, auth.user.id, appId, blockId),
  graphHandler: async (action, orgGraph, auth, now) => {
    const appBlockId = uuid();
    const { appId, blockId, orderIndex } = action.payload;
    const appBlock: Api.Db.AppBlock = {
      type: "appBlock",
      id: appBlockId,
      ...graphKey.appBlock(auth.org.id, appId, blockId, appBlockId),
      appId,
      blockId,
      orderIndex,
      createdAt: now,
      updatedAt: now,
    };

    const scope: Rbac.OrgAccessScope = {
      envParentIds: new Set([appBlock.blockId, appBlock.appId]),
      userIds: "all",
      keyableParentIds: "all",
    };

    const updatedGraph = {
      ...orgGraph,
      [appBlockId]: appBlock,
    };

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      handlerContext: {
        type: action.type,
        createdId: appBlockId,
      },
      logTargetIds: [appId, blockId],
      encryptedKeysScope: scope,
    };
  },
});

apiAction<
  Api.Action.RequestActions["DisconnectBlock"],
  Api.Net.ApiResultTypes["DisconnectBlock"]
>({
  type: Api.ActionType.DISCONNECT_BLOCK,
  graphAction: true,
  authenticated: true,
  reorderBlobsIfNeeded: true,
  shouldClearOrphanedLocals: true,
  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) =>
    authz.canDisconnectBlock(userGraph, auth.user.id, { appBlockId: id }),
  graphHandler: async (action, orgGraph, auth, now) => {
    const existingAppBlock = orgGraph[action.payload.id] as Api.Db.AppBlock;

    const scope: Rbac.OrgAccessScope = {
      envParentIds: new Set([existingAppBlock.blockId, existingAppBlock.appId]),
      userIds: "all",
      keyableParentIds: "all",
    };

    return {
      type: "graphHandlerResult",
      graph: deleteGraphObjects(orgGraph, [existingAppBlock.id], now),
      encryptedKeysScope: scope,
      logTargetIds: [existingAppBlock.appId, existingAppBlock.blockId],
    };
  },
});

apiAction<
  Api.Action.RequestActions["ReorderBlocks"],
  Api.Net.ApiResultTypes["ReorderBlocks"]
>({
  type: Api.ActionType.REORDER_BLOCKS,
  graphAction: true,
  authenticated: true,
  reorderBlobsIfNeeded: true,
  graphAuthorizer: async (
    { payload: { appId, order } },
    orgGraph,
    userGraph,
    auth
  ) => authz.canReorderBlocks(userGraph, auth.user.id, appId, order),
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    const updatedGraph = produce(orgGraph, (draft) => {
      for (let blockId in payload.order) {
        const draftAppBlock =
          getAppBlocksByComposite(draft)[[payload.appId, blockId].join("|")];

        draftAppBlock!.orderIndex = payload.order[blockId];
        draftAppBlock!.updatedAt = now;
      }
    });

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      logTargetIds: [payload.appId],
      updatedGeneratedEnvkeyIds: (
        getActiveGeneratedEnvkeysByAppId(orgGraph)[payload.appId] ?? []
      ).map(R.prop("id")),
    };
  },
});

const getUpdatedGeneratedEnvkeyIds = (
  previousOrgGraph: Api.Graph.OrgGraph,
  targetOrgGraph: Api.Graph.OrgGraph,
  blockId: string,
  appId?: string
) => {
  const block = previousOrgGraph[blockId] as Api.Db.Block;

  const updatedGeneratedEnvkeyIds = new Set<string>();
  const blockEnvironments =
    getEnvironmentsByEnvParentId(previousOrgGraph)[blockId] ?? [];

  for (let blockEnvironment of blockEnvironments) {
    const environmentRole = previousOrgGraph[
      blockEnvironment.environmentRoleId
    ] as Rbac.EnvironmentRole;

    if (
      blockEnvironment.envUpdatedAt ||
      (environmentRole.hasLocalKeys && block.localsUpdatedAt)
    ) {
      const generatedEnvkeys = getConnectedActiveGeneratedEnvkeys(
        targetOrgGraph,
        blockEnvironment.id
      );
      for (let {
        id,
        keyableParentType,
        appId: generatedEnvkeyAppId,
      } of generatedEnvkeys) {
        if (appId && appId != generatedEnvkeyAppId) {
          continue;
        }

        if (blockEnvironment.envUpdatedAt || keyableParentType == "localKey") {
          updatedGeneratedEnvkeyIds.add(id);
        }
      }
    }
  }

  return Array.from(updatedGeneratedEnvkeyIds);
};

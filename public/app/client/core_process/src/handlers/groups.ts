import * as R from "ramda";
import { Client, Api, Model, Rbac } from "@core/types";
import { clientAction } from "../handler";
import { stripEmptyRecursive, pick } from "@core/lib/utils/object";
import { removeObjectProducers, reorderStatusProducers } from "../lib/status";
import { deleteProposer } from "../lib/graph";
import { getAuth } from "@core/lib/client";
import * as g from "@core/lib/graph";
import {
  getOrgAccessScopeForGroupMembership,
  getOrgAccessScopeForGroupMembers,
  getConnectedBlocksForApp,
  mergeAccessScopes,
} from "@core/lib/graph";
import { log } from "@core/lib/utils/logger";
import { initLocalsIfNeeded } from "../lib/envs";

clientAction<Client.Action.ClientActions["CreateGroupMemberships"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.CREATE_GROUP_MEMBERSHIPS,
  serialAction: true,
  stateProducer: (draft, { payload }) => {
    for (let path of createMembershipStatusPaths(payload)) {
      draft.isCreatingGroupMemberships = R.assocPath(
        path,
        true,
        draft.isCreatingGroupMemberships
      );

      draft.createGroupMembershipErrors = R.dissocPath(
        path,
        draft.createGroupMembershipErrors
      );
    }

    draft.createGroupMembershipErrors = stripEmptyRecursive(
      draft.createGroupMembershipErrors
    );
  },
  failureStateProducer: (draft, { meta: { rootAction }, payload }) => {
    for (let path of createMembershipStatusPaths(rootAction.payload)) {
      draft.createGroupMembershipErrors = R.assocPath(
        path,
        {
          error: payload,
          payload: rootAction.payload,
        },
        draft.createGroupMembershipErrors
      );
    }
  },
  endStateProducer: (draft, { meta: { rootAction } }) => {
    for (let path of createMembershipStatusPaths(rootAction.payload)) {
      draft.isCreatingGroupMemberships = R.dissocPath(
        path,
        draft.isCreatingGroupMemberships
      );
    }
    draft.isCreatingGroupMemberships = stripEmptyRecursive(
      draft.isCreatingGroupMemberships
    );
  },
  bulkApiDispatcher: true,
  apiActionCreator: async (payload) => ({
    action: {
      type: Api.ActionType.CREATE_GROUP_MEMBERSHIP,
      payload: pick(["groupId", "objectId", "orderIndex"], payload),
    },
  }),
  successHandler: async (state, action, res, context) => {
    const auth = getAuth(state, context.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }

    await initLocalsIfNeeded(state, auth.userId, context);
  },
});

clientAction<Api.Action.RequestActions["CreateGroupMembership"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_GROUP_MEMBERSHIP,
  bulkDispatchOnly: true,
  graphProposer:
    ({ payload: { groupId, objectId, orderIndex } }) =>
    (graphDraft) => {
      const now = Date.now(),
        proposalId = [groupId, objectId].join("|"),
        group = graphDraft[groupId] as Model.Group;

      graphDraft[proposalId] = {
        type: "groupMembership",
        id: proposalId,
        groupId,
        objectId,
        orderIndex: group.objectType == "block" ? now : undefined,
        createdAt: now,
        updatedAt: now,
      };
    },

  encryptedKeysScopeFn: (graph, { payload: { groupId, objectId } }) =>
    g.getOrgAccessScopeForGroupMembership(graph, groupId, objectId),
});

clientAction<
  Api.Action.RequestActions["CreateGroup"],
  Api.Net.ApiResultTypes["CreateGroup"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_GROUP,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  stateProducer: (draft, { payload: { objectType } }) => {
    draft.isCreatingGroup[objectType] = true;
    delete draft.createGroupErrors[objectType];
  },
  failureStateProducer: (
    draft,
    {
      meta: {
        rootAction: {
          payload: { objectType },
        },
      },
      payload,
    }
  ) => {
    draft.createGroupErrors[objectType] = payload;
  },
  endStateProducer: (
    draft,
    {
      meta: {
        rootAction: {
          payload: { objectType },
        },
      },
    }
  ) => {
    delete draft.isCreatingGroup[objectType];
  },
});

clientAction<
  Api.Action.RequestActions["DeleteGroup"],
  Api.Net.ApiResultTypes["DeleteGroup"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_GROUP,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
  graphProposer: ({ payload: { id } }) =>
    g.getDeleteGroupProducer(id, Date.now()),
  encryptedKeysScopeFn: (graph, { payload: { id } }) =>
    getOrgAccessScopeForGroupMembers(graph, id),
});

clientAction<
  Api.Action.RequestActions["DeleteGroupMembership"],
  Api.Net.ApiResultTypes["DeleteGroupMembership"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_GROUP_MEMBERSHIP,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
  graphProposer: deleteProposer,
  encryptedKeysScopeFn: (graph, { payload: { id } }) => {
    const { groupId, objectId } = graph[id] as Model.GroupMembership;
    return getOrgAccessScopeForGroupMembership(graph, groupId, objectId);
  },
});

clientAction<
  Api.Action.RequestActions["DeleteAppUserGroup"],
  Api.Net.ApiResultTypes["DeleteAppUserGroup"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_APP_USER_GROUP,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
  graphProposer: deleteProposer,
  encryptedKeysScopeFn: (graph, { payload: { id } }) => {
    const { appId, userGroupId } = graph[id] as Model.AppUserGroup;
    return mergeAccessScopes(
      getOrgAccessScopeForGroupMembers(graph, userGroupId),
      {
        envParentIds: new Set([
          appId,
          ...getConnectedBlocksForApp(graph, appId).map(R.prop("id")),
        ]),
      }
    );
  },
});

clientAction<
  Api.Action.RequestActions["DeleteAppGroupUser"],
  Api.Net.ApiResultTypes["DeleteAppGroupUser"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_APP_GROUP_USER,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
  graphProposer: deleteProposer,
  encryptedKeysScopeFn: (graph, { payload: { id } }) => {
    const { userId, appGroupId } = graph[id] as Model.AppGroupUser;
    return mergeAccessScopes(
      getOrgAccessScopeForGroupMembers(graph, appGroupId, true),
      {
        userIds: new Set([userId]),
      }
    );
  },
});

clientAction<
  Api.Action.RequestActions["DeleteAppGroupUserGroup"],
  Api.Net.ApiResultTypes["DeleteAppGroupUserGroup"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_APP_GROUP_USER_GROUP,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
  graphProposer: deleteProposer,
  encryptedKeysScopeFn: (graph, { payload: { id } }) => {
    const { userGroupId, appGroupId } = graph[id] as Model.AppGroupUserGroup;
    return mergeAccessScopes(
      getOrgAccessScopeForGroupMembers(graph, appGroupId, true),
      getOrgAccessScopeForGroupMembers(graph, userGroupId)
    );
  },
});

clientAction<
  Api.Action.RequestActions["DeleteAppBlockGroup"],
  Api.Net.ApiResultTypes["DeleteAppBlockGroup"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_APP_BLOCK_GROUP,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
  graphProposer: deleteProposer,
  encryptedKeysScopeFn: (graph, { payload: { id } }) => {
    const { appId, blockGroupId } = graph[id] as Model.AppBlockGroup;

    const scope = mergeAccessScopes(
      getOrgAccessScopeForGroupMembers(graph, blockGroupId),
      {
        userIds: "all",
        keyableParentIds: "all",
        envParentIds: new Set([appId]),
      }
    );

    return scope;
  },
});

clientAction<
  Api.Action.RequestActions["DeleteAppGroupBlock"],
  Api.Net.ApiResultTypes["DeleteAppGroupBlock"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_APP_GROUP_BLOCK,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
  graphProposer: deleteProposer,
  encryptedKeysScopeFn: (graph, { payload: { id } }) => {
    const { appGroupId, blockId } = graph[id] as Model.AppGroupBlock;
    return mergeAccessScopes(
      getOrgAccessScopeForGroupMembers(graph, appGroupId),
      {
        userIds: "all",
        keyableParentIds: "all",
        envParentIds: new Set([blockId]),
      }
    );
  },
});

clientAction<
  Api.Action.RequestActions["DeleteAppGroupBlockGroup"],
  Api.Net.ApiResultTypes["DeleteAppGroupBlockGroup"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_APP_GROUP_BLOCK_GROUP,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
  graphProposer: deleteProposer,
  encryptedKeysScopeFn: (graph, { payload: { id } }) => {
    const { blockGroupId, appGroupId } = graph[id] as Model.AppGroupBlockGroup;
    return mergeAccessScopes(
      getOrgAccessScopeForGroupMembers(graph, appGroupId),
      getOrgAccessScopeForGroupMembers(graph, blockGroupId),
      {
        userIds: "all",
        keyableParentIds: "all",
      }
    );
  },
});

clientAction<
  Api.Action.RequestActions["ReorderAppBlockGroups"],
  Api.Net.ApiResultTypes["ReorderAppBlockGroups"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.REORDER_APP_BLOCK_GROUPS,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...reorderStatusProducers("appBlockGroup"),
});

clientAction<
  Api.Action.RequestActions["ReorderAppGroupBlocks"],
  Api.Net.ApiResultTypes["ReorderAppGroupBlocks"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.REORDER_APP_GROUP_BLOCKS,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...reorderStatusProducers("appGroupBlock"),
});

clientAction<
  Api.Action.RequestActions["ReorderAppGroupBlockGroups"],
  Api.Net.ApiResultTypes["ReorderAppGroupBlockGroups"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.REORDER_APP_GROUP_BLOCK_GROUPS,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...reorderStatusProducers("appGroupBlockGroup"),
});

clientAction<
  Api.Action.RequestActions["ReorderGroupMemberships"],
  Api.Net.ApiResultTypes["ReorderGroupMemberships"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.REORDER_GROUP_MEMBERSHIPS,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...reorderStatusProducers("groupMembership"),
});

const createMembershipStatusPaths = (
  payload: Client.Action.ClientActions["CreateGroupMemberships"]["payload"]
) => {
  const res: string[][] = [];

  for (let { groupId, objectId } of payload) {
    res.push([groupId, objectId], [objectId, groupId]);
  }

  return res;
};

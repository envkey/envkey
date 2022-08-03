import { Draft } from "immer";
import { deleteProposer } from "../lib/graph";
import { stripEmptyRecursive, pickDefined } from "@core/lib/utils/object";
import { getAuth } from "@core/lib/client";
import * as R from "ramda";
import { Client, Api, Model } from "@core/types";
import { clientAction, dispatch } from "../handler";
import {
  statusProducers,
  renameObjectProducers,
  removeObjectProducers,
  updateSettingsProducers,
  updateFirewallProducers,
} from "../lib/status";
import {
  getDeleteAppProducer,
  getConnectedBlocksForApp,
  mergeAccessScopes,
  getOrgAccessScopeForGroupMembers,
  graphTypes,
  getEnvironmentsByEnvParentId,
  authz,
} from "@core/lib/graph";
import { log } from "@core/lib/utils/logger";
import fs from "fs";
import path from "path";
import { initLocalsIfNeeded } from "../lib/envs";

clientAction<Client.Action.ClientActions["CreateApp"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.CREATE_APP,
  serialAction: true,
  ...statusProducers("isCreatingApp", "createAppError"),
  handler: async (
    state,
    action,
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    const auth = getAuth(state, context.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }

    const res = await dispatch<Api.Action.RequestActions["CreateApp"]>(
      {
        type: Api.ActionType.CREATE_APP,
        payload: R.omit(["path"], action.payload),
      },
      context
    );

    if (res.success) {
      if (action.payload.path) {
        const app = graphTypes(res.state.graph).apps.find(
          R.propEq("createdAt", res.state.graphUpdatedAt)
        )!;

        try {
          await new Promise<void>((resolve, reject) =>
            fs.writeFile(
              path.join(action.payload.path!, ".envkey"),
              JSON.stringify({ orgId: auth.orgId, appId: app.id }),
              (err) => {
                if (err) {
                  return reject(err);
                }
                resolve();
              }
            )
          );
        } catch (err) {
          log("Couldn't create new app .envkey config file", {
            path: action.payload.path!,
            err,
          });
        }
      }

      return dispatchSuccess(null, context);
    } else {
      return dispatchFailure((res.resultAction as any)?.payload, context);
    }
  },

  successHandler: async (state, action, res, context) => {
    const auth = getAuth(state, context.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }

    const app = R.last(
      R.sortBy(R.prop("createdAt"), graphTypes(state.graph).apps)
    )!;

    const environmentIds = (
      getEnvironmentsByEnvParentId(state.graph)[app.id] ?? []
    ).map(R.prop("id"));

    const localIds = graphTypes(state.graph)
      .orgUsers.filter((user) =>
        authz.canUpdateLocals(state.graph, auth.userId, app.id, user.id)
      )
      .map((user) => `${app.id}|${user.id}`);

    await dispatch<Client.Action.ClientActions["CommitEnvs"]>(
      {
        type: Client.ActionType.COMMIT_ENVS,
        payload: {
          pendingEnvironmentIds: environmentIds.concat(localIds),
          initEnvs: true,
        },
      },
      context
    );
  },
});

clientAction<
  Api.Action.RequestActions["CreateApp"],
  Api.Net.ApiResultTypes["CreateApp"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_APP,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
});

clientAction<
  Api.Action.RequestActions["RenameApp"],
  Api.Net.ApiResultTypes["RenameApp"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.RENAME_APP,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...renameObjectProducers,
});

clientAction<
  Api.Action.RequestActions["UpdateAppSettings"],
  Api.Net.ApiResultTypes["UpdateAppSettings"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.UPDATE_APP_SETTINGS,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...updateSettingsProducers,
});

clientAction<
  Api.Action.RequestActions["SetAppAllowedIps"],
  Api.Net.ApiResultTypes["SetAppAllowedIps"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.SET_APP_ALLOWED_IPS,
  loggableType: "orgAction",
  loggableType2: "updateFirewallAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...updateFirewallProducers,
});

clientAction<
  Api.Action.RequestActions["DeleteApp"],
  Api.Net.ApiResultTypes["DeleteApp"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_APP,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
  graphProposer: ({ payload: { id } }) => getDeleteAppProducer(id, Date.now()),
  encryptedKeysScopeFn: (graph, { payload: { id } }) => ({
    envParentIds: new Set([
      id,
      ...getConnectedBlocksForApp(graph, id).map(R.prop("id")),
    ]),
    userIds: "all",
    keyableParentIds: "all",
  }),
});

clientAction<
  Api.Action.RequestActions["RemoveAppAccess"],
  Api.Net.ApiResultTypes["RemoveAppAccess"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.REMOVE_APP_ACCESS,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
  graphProposer: deleteProposer,
  encryptedKeysScopeFn: (graph, { payload: { id } }) => {
    const { appId, userId } = graph[id] as Model.AppUserGrant;

    return {
      envParentIds: new Set([
        appId,
        ...getConnectedBlocksForApp(graph, appId).map(R.prop("id")),
      ]),
      userIds: new Set([userId]),
      environmentIds: "all",
      keyableParentIds: "all",
    };
  },
});

clientAction<Client.Action.ClientActions["GrantAppsAccess"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.GRANT_APPS_ACCESS,
  serialAction: true,
  stateProducer: (draft, { payload }) => {
    for (let path of appAccessStatusPaths(payload)) {
      draft.isGrantingAppAccess = R.assocPath(
        path,
        true,
        draft.isGrantingAppAccess
      );

      draft.grantAppAccessErrors = R.dissocPath(
        path,
        draft.grantAppAccessErrors
      );
    }

    draft.grantAppAccessErrors = stripEmptyRecursive(
      draft.grantAppAccessErrors
    );
  },

  failureStateProducer: (draft, { meta: { rootAction }, payload }) => {
    for (let path of appAccessStatusPaths(rootAction.payload)) {
      draft.grantAppAccessErrors = R.assocPath(
        path,
        {
          error: payload,
          payload: rootAction.payload,
        },
        draft.grantAppAccessErrors
      );
    }
  },

  endStateProducer: (draft, { meta: { rootAction } }) => {
    for (let path of appAccessStatusPaths(rootAction.payload)) {
      draft.isGrantingAppAccess = R.dissocPath(path, draft.isGrantingAppAccess);
    }
    draft.isGrantingAppAccess = stripEmptyRecursive(draft.isGrantingAppAccess);
  },

  bulkApiDispatcher: true,
  apiActionCreator: async (payload) => {
    const { appId, appGroupId, userId, userGroupId } = payload as any;

    type GrantAppAccessAction = Api.Action.GraphActions[
      | "GrantAppAccess"
      | "CreateAppUserGroup"
      | "CreateAppGroupUser"
      | "CreateAppGroupUserGroup"];

    let actionType: GrantAppAccessAction["type"];

    if (appId && userId) {
      actionType = Api.ActionType.GRANT_APP_ACCESS;
    } else if (appId && userGroupId) {
      actionType = Api.ActionType.CREATE_APP_USER_GROUP;
    } else if (appGroupId && userId) {
      actionType = Api.ActionType.CREATE_APP_GROUP_USER;
    } else if (appGroupId && userGroupId) {
      actionType = Api.ActionType.CREATE_APP_GROUP_USER_GROUP;
    }

    return {
      action: {
        type: actionType!,
        payload: pickDefined(
          ["appId", "appGroupId", "userId", "userGroupId", "appRoleId"],
          payload as any
        ),
      },
    };
  },
  successHandler: async (state, action, res, context) => {
    const auth = getAuth(state, context.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }

    await initLocalsIfNeeded(state, auth.userId, context);
  },
});

const getGraphProposer =
  (objectType: Client.Graph.UserGraphObject["type"]) =>
  (action: { payload: any }) =>
  (graphDraft: Draft<Client.Graph.UserGraph>) => {
    const now = Date.now(),
      { appId, appGroupId, userId, userGroupId, appRoleId } = action.payload,
      proposalId = [appId, appGroupId, userId, userGroupId]
        .filter(Boolean)
        .join("|"),
      object = {
        type: objectType,
        id: proposalId,
        createdAt: now,
        updatedAt: now,
        appRoleId,
        ...pickDefined(
          ["appId", "appGroupId", "userId", "userGroupId"],
          action.payload
        ),
      } as Client.Graph.UserGraphObject;

    graphDraft[proposalId] = object;
  };

clientAction<Api.Action.RequestActions["GrantAppAccess"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.GRANT_APP_ACCESS,
  bulkDispatchOnly: true,
  graphProposer: getGraphProposer("appUserGrant"),
  encryptedKeysScopeFn: (graph, { payload: { appId, userId } }) => ({
    envParentIds: new Set([
      appId,
      ...getConnectedBlocksForApp(graph, appId).map(R.prop("id")),
    ]),
    userIds: new Set([userId]),
    environmentIds: "all",
    keyableParentIds: "all",
  }),
});

clientAction<Api.Action.RequestActions["CreateAppUserGroup"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_APP_USER_GROUP,
  bulkDispatchOnly: true,
  graphProposer: getGraphProposer("appUserGroup"),
  encryptedKeysScopeFn: (graph, { payload: { appId, userGroupId } }) =>
    mergeAccessScopes(getOrgAccessScopeForGroupMembers(graph, userGroupId), {
      envParentIds: new Set([
        appId,
        ...getConnectedBlocksForApp(graph, appId).map(R.prop("id")),
      ]),
    }),
});

clientAction<Api.Action.RequestActions["CreateAppGroupUser"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_APP_GROUP_USER,
  bulkDispatchOnly: true,
  graphProposer: getGraphProposer("appGroupUser"),
  encryptedKeysScopeFn: (graph, { payload: { appGroupId, userId } }) =>
    mergeAccessScopes(
      getOrgAccessScopeForGroupMembers(graph, appGroupId, true),
      {
        userIds: new Set([userId]),
      }
    ),
});

clientAction<Api.Action.RequestActions["CreateAppGroupUserGroup"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_APP_GROUP_USER_GROUP,
  bulkDispatchOnly: true,
  graphProposer: getGraphProposer("appGroupUserGroup"),
  encryptedKeysScopeFn: (graph, { payload: { appGroupId, userGroupId } }) =>
    mergeAccessScopes(
      getOrgAccessScopeForGroupMembers(graph, appGroupId, true),
      getOrgAccessScopeForGroupMembers(graph, userGroupId)
    ),
});

const appAccessStatusPaths = (
  payload: Client.Action.ClientActions["GrantAppsAccess"]["payload"]
) => {
  const res: string[][] = [];

  // index status by both app and user
  for (let params of payload) {
    let appTargetId: string, userTargetId: string;
    if ("appId" in params) {
      appTargetId = params.appId;
    } else {
      appTargetId = params.appGroupId;
    }

    if ("userId" in params) {
      userTargetId = params.userId;
    } else {
      userTargetId = params.userGroupId;
    }

    res.push(
      [appTargetId, params.appRoleId, userTargetId],
      [userTargetId, params.appRoleId, appTargetId]
    );
  }

  return res;
};

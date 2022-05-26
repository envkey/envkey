import { getScope } from "@core/lib/blob";
import { getFetchActionBackgroundLogTargetIdsFn } from "./../models/logs";
import produce from "immer";
import { v4 as uuid } from "uuid";
import { apiAction } from "../handler";
import { Api, Blob, Model, Auth, Client, Rbac } from "@core/types";
import * as R from "ramda";
import { getFetchActionLogTargetIdsFn } from "../models/logs";
import {
  getEnvironmentsByEnvParentId,
  getEnvironmentPermissions,
  getConnectedBlocksForApp,
  deleteGraphObjects,
  authz,
  getDeleteEnvironmentProducer,
  environmentCompositeId,
  getConnectedActiveGeneratedEnvkeys,
  getAllConnectedKeyableParents,
  getActiveGeneratedEnvkeysByKeyableParentId,
  getConnectedBlockEnvironmentsForApp,
} from "@core/lib/graph";
import { pick } from "@core/lib/utils/pick";
import * as graphKey from "../graph_key";
import { log } from "@core/lib/utils/logger";
import { setEnvsUpdatedFields } from "../graph";

apiAction<
  Api.Action.RequestActions["UpdateEnvs"],
  Api.Net.ApiResultTypes["UpdateEnvs"]
>({
  type: Api.ActionType.UPDATE_ENVS,
  graphAction: true,
  authenticated: true,
  // no graphAuthorizer needed here since blob updates are authorized at the handler level
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    const { updatedGraph, updatingEnvironmentIds } = setEnvsUpdatedFields(
      auth,
      orgGraph,
      payload.blobs,
      now
    );

    const hardDeleteSecondaryIndices: string[] = [];
    const hardDeleteTertiaryIndices: string[] = [];

    // for any base environment we're updating, clear out any inheritance overrides
    // set for it on sibling environments that are not included in the update
    for (let environmentId of updatingEnvironmentIds) {
      const environment = orgGraph[environmentId] as Model.Environment;
      if (environment.isSub) {
        continue;
      }

      const envParent = orgGraph[environment.envParentId] as Model.EnvParent,
        envParentEnvironments =
          getEnvironmentsByEnvParentId(orgGraph)[environment.envParentId] ?? [];

      for (let envParentEnvironment of envParentEnvironments) {
        if (envParentEnvironment.id == environment.id) {
          continue;
        }

        if (
          R.path(
            [
              envParent.id,
              "environments",
              envParentEnvironment.id,
              "inheritanceOverrides",
              environment.id,
            ],
            payload.blobs
          )
        ) {
          continue;
        }

        // inheritance overrides encrypted blobs
        const index = `inheritanceOverrides|${envParent.id}|${environment.id}`;
        hardDeleteSecondaryIndices.push(index);
        if (envParent.type == "block") {
          hardDeleteTertiaryIndices.push(index);
        }
      }
    }

    const logTargetIds = new Set<string>();
    const updatedGeneratedEnvkeyIds = new Set<string>();

    for (let envParentId in payload.blobs) {
      logTargetIds.add(envParentId);
      const { environments, locals } = payload.blobs[envParentId];

      if (environments) {
        for (let environmentId in environments) {
          const environment = orgGraph[environmentId] as Model.Environment;

          logTargetIds.add(environment.environmentRoleId);

          if (environment.isSub) {
            logTargetIds.add(environmentCompositeId(environment));
          }

          const connectedGeneratedEnvkeys = getConnectedActiveGeneratedEnvkeys(
            orgGraph,
            environmentId
          );
          for (let { id } of connectedGeneratedEnvkeys) {
            updatedGeneratedEnvkeyIds.add(id);
          }

          const update = environments[environmentId];
          if (update.inheritanceOverrides) {
            for (let overrideEnvironmentId in update.inheritanceOverrides) {
              const overrideConnectedGeneratedEnvkeys =
                getConnectedActiveGeneratedEnvkeys(
                  orgGraph,
                  overrideEnvironmentId
                );
              for (let { id } of overrideConnectedGeneratedEnvkeys) {
                updatedGeneratedEnvkeyIds.add(id);
              }
            }
          }
        }
      }

      if (locals) {
        const localsEnvironment = (
          getEnvironmentsByEnvParentId(orgGraph)[envParentId] ?? []
        ).find(
          ({ environmentRoleId }) =>
            (orgGraph[environmentRoleId] as Rbac.EnvironmentRole).hasLocalKeys
        );

        for (let localsUserId in locals) {
          logTargetIds.add("locals");
          logTargetIds.add(localsUserId);

          if (localsEnvironment) {
            for (let keyableParent of getAllConnectedKeyableParents(
              orgGraph,
              localsEnvironment.id
            )) {
              if (
                keyableParent.type == "localKey" &&
                keyableParent.userId == localsUserId
              ) {
                const generatedEnvkey =
                  getActiveGeneratedEnvkeysByKeyableParentId(orgGraph)[
                    keyableParent.id
                  ];
                if (generatedEnvkey) {
                  updatedGeneratedEnvkeyIds.add(generatedEnvkey.id);
                }
              }
            }
          }
        }
      }
    }

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      transactionItems: {
        hardDeleteSecondaryIndices,
        hardDeleteTertiaryIndices,
      },
      logTargetIds: Array.from(logTargetIds),
      updatedGeneratedEnvkeyIds: Array.from(updatedGeneratedEnvkeyIds),
    };
  },
});

apiAction<
  Api.Action.RequestActions["FetchEnvs"],
  Api.Net.ApiResultTypes["FetchEnvs"]
>({
  type: Api.ActionType.FETCH_ENVS,
  graphAction: true,
  authenticated: true,
  // graphScopes: [
  //   (auth, { payload: { byEnvParentId } }) =>
  //     () =>
  //       [
  //         auth.user.skey + "$",
  //         "g|block|",
  //         "g|environment|",
  //         "g|group|",
  //         "g|groupMembership|",
  //         "g|appGroupBlockGroup|",
  //         "g|appGroupBlock|",
  //         "g|appGroupUserGroup|",
  //         "g|appGroupUser|",

  //         ...Object.keys(byEnvParentId).flatMap((envParentId) => [
  //           graphKey.app(auth.org.id, envParentId).skey + "$",
  //           `g|appBlock|${envParentId}`,
  //           `g|appBlockGroup|${envParentId}`,
  //           `g|appUserGrant|${envParentId}`,
  //           `g|appUserGroup|${envParentId}`,
  //         ]),
  //       ],
  // ],
  graphResponse: "envsAndOrChangesets",
  graphAuthorizer: async (action, orgGraph, userGraph, auth) => {
    for (let envParentId in action.payload.byEnvParentId) {
      if (!userGraph[envParentId]) {
        return false;
      }
    }

    return true;
  },
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    let envs: Api.HandlerEnvsResponse | undefined,
      inheritanceOverrides: Api.HandlerEnvsResponse | undefined,
      changesets: Api.HandlerChangesetsResponse | undefined;

    const envEnvParentIds: string[] = [];
    const changesetEnvParentIds: string[] = [];
    const changesetsCreatedAfterByEnvParentId: Record<
      string,
      number | undefined
    > = {};

    for (let envParentId in payload.byEnvParentId) {
      const envParentParams = payload.byEnvParentId[envParentId];
      if (envParentParams.envs) {
        envEnvParentIds.push(envParentId);
      }
      if (envParentParams.changesets) {
        changesetEnvParentIds.push(envParentId);

        changesetsCreatedAfterByEnvParentId[envParentId] =
          envParentParams.changesetOptions?.createdAfter;
      }
    }

    if (envEnvParentIds.length > 0) {
      envs = getHandlerEnvsResponse(orgGraph, envEnvParentIds, "env");
      inheritanceOverrides = getHandlerEnvsResponse(
        orgGraph,
        envEnvParentIds,
        "inheritanceOverrides"
      );
    }

    if (changesetEnvParentIds.length > 0) {
      changesets = getHandlerEnvsResponse(
        orgGraph,
        changesetEnvParentIds,
        "changeset",
        changesetsCreatedAfterByEnvParentId
      );
    }

    return {
      type: "graphHandlerResult",
      graph: orgGraph,
      envs,
      changesets,
      inheritanceOverrides,
      logTargetIds: getFetchActionLogTargetIdsFn(orgGraph),
      backgroundLogTargetIds: getFetchActionBackgroundLogTargetIdsFn(orgGraph),
    };
  },
});

apiAction<
  Api.Action.RequestActions["CreateVariableGroup"],
  Api.Net.ApiResultTypes["CreateVariableGroup"]
>({
  type: Api.ActionType.CREATE_VARIABLE_GROUP,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async (
    { payload: { envParentId, subEnvironmentId } },
    orgGraph,
    userGraph,
    auth
  ) =>
    canCreateOrDeleteVariableGroup(
      userGraph,
      auth,
      envParentId,
      subEnvironmentId
    ),
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    const id = uuid(),
      variableGroup: Api.Db.VariableGroup = {
        type: "variableGroup",
        id,
        ...graphKey.variableGroup(auth.org.id, payload.envParentId, id),
        ...pick(["envParentId", "subEnvironmentId", "name"], payload),
        createdAt: now,
        updatedAt: now,
      };

    return {
      type: "graphHandlerResult",
      graph: {
        ...orgGraph,
        [variableGroup.id]: variableGroup,
      },
      logTargetIds: [],
    };
  },
});

apiAction<
  Api.Action.RequestActions["DeleteVariableGroup"],
  Api.Net.ApiResultTypes["DeleteVariableGroup"]
>({
  type: Api.ActionType.DELETE_VARIABLE_GROUP,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) => {
    const variableGroup = userGraph[id];
    if (!variableGroup || variableGroup.type != "variableGroup") {
      return false;
    }

    return canCreateOrDeleteVariableGroup(
      userGraph,
      auth,
      variableGroup.envParentId,
      variableGroup.subEnvironmentId
    );
  },
  graphHandler: async (action, orgGraph, auth, now) => {
    return {
      type: "graphHandlerResult",
      graph: deleteGraphObjects(orgGraph, [action.payload.id], now),
      logTargetIds: [],
    };
  },
});

apiAction<
  Api.Action.RequestActions["CreateEnvironment"],
  Api.Net.ApiResultTypes["CreateEnvironment"]
>({
  type: Api.ActionType.CREATE_ENVIRONMENT,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async ({ payload }, orgGraph, userGraph, auth) =>
    payload.isSub
      ? authz.canCreateSubEnvironment(
          userGraph,
          auth.user.id,
          payload.parentEnvironmentId
        )
      : authz.canCreateBaseEnvironment(
          userGraph,
          auth.user.id,
          payload.envParentId,
          payload.environmentRoleId
        ),
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    const id = uuid(),
      environment: Api.Db.Environment = {
        ...graphKey.environment(auth.org.id, payload.envParentId, id),
        ...(pick(
          [
            "envParentId",
            "environmentRoleId",
            "isSub",
            "parentEnvironmentId",
            "subName",
          ],
          payload
        ) as Model.Environment),
        type: "environment",
        id,
        createdAt: now,
        updatedAt: now,
      },
      envParent = orgGraph[environment.envParentId] as Model.EnvParent,
      updatedGraph = {
        ...orgGraph,
        [environment.id]: environment,
      };

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      logTargetIds: [
        envParent.id,
        environment.environmentRoleId,
        environment.isSub ? environmentCompositeId(environment) : undefined,
      ].filter((id): id is string => Boolean(id)),
    };
  },
});

apiAction<
  Api.Action.RequestActions["DeleteEnvironment"],
  Api.Net.ApiResultTypes["DeleteEnvironment"]
>({
  type: Api.ActionType.DELETE_ENVIRONMENT,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) =>
    authz.canDeleteEnvironment(userGraph, auth.user.id, id),
  graphHandler: async (action, orgGraph, auth, now) => {
    const environment = orgGraph[action.payload.id] as Model.Environment;
    const envParent = orgGraph[environment.envParentId] as Model.EnvParent;

    let updatedGeneratedEnvkeyIds: string[] | undefined;
    let clearEnvkeySockets: Api.ClearEnvkeySocketParams[] | undefined;

    if (envParent.type == "app") {
      const generatedEnvkeys = getConnectedActiveGeneratedEnvkeys(
        orgGraph,
        environment.id
      );

      clearEnvkeySockets = generatedEnvkeys.map(
        ({ id: generatedEnvkeyId }) => ({
          orgId: auth.org.id,
          generatedEnvkeyId,
        })
      );
    } else {
      const ids = new Set<string>();

      const generatedEnvkeys = getConnectedActiveGeneratedEnvkeys(
        orgGraph,
        environment.id
      );

      for (let generatedEnvkey of generatedEnvkeys) {
        const blockEnvironments = getConnectedBlockEnvironmentsForApp(
          orgGraph,
          generatedEnvkey.appId,
          generatedEnvkey.environmentId
        );

        if (
          blockEnvironments.some(({ envUpdatedAt }) => Boolean(envUpdatedAt))
        ) {
          ids.add(generatedEnvkey.id);
        }
      }

      updatedGeneratedEnvkeyIds = Array.from(ids);
    }

    const updatedGraph = produce(
      orgGraph,
      getDeleteEnvironmentProducer(action.payload.id, now)
    ) as Api.Graph.OrgGraph;

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      transactionItems: {
        hardDeleteEncryptedBlobParams: [
          {
            orgId: auth.org.id,
            envParentId: environment.envParentId,
            environmentId: environment.id,
            blobType: "env",
          },
          {
            orgId: auth.org.id,
            envParentId: environment.envParentId,
            environmentId: environment.id,
            blobType: "changeset",
          },
        ],
        hardDeleteScopes: [
          {
            pkey: `encryptedKeys|${auth.org.id}`,
            pkeyPrefix: true,
            scope: getScope({
              envParentId: environment.envParentId,
              environmentId: environment.id,
              blobType: "env",
            }),
          },
          {
            pkey: `encryptedKeys|${auth.org.id}`,
            pkeyPrefix: true,
            scope: getScope({
              envParentId: environment.envParentId,
              environmentId: environment.id,
              blobType: "changeset",
            }),
          },
        ],
      },
      logTargetIds: [
        envParent.id,
        environment.environmentRoleId,
        environment.isSub ? environmentCompositeId(environment) : undefined,
      ].filter((id): id is string => Boolean(id)),
      updatedGeneratedEnvkeyIds,
      clearEnvkeySockets,
    };
  },
});

apiAction<
  Api.Action.RequestActions["UpdateEnvironmentSettings"],
  Api.Net.ApiResultTypes["UpdateEnvironmentSettings"]
>({
  type: Api.ActionType.UPDATE_ENVIRONMENT_SETTINGS,
  authenticated: true,
  graphAction: true,
  graphAuthorizer: async ({ payload }, orgGraph, userGraph, auth) => {
    const environment = userGraph[payload.id];
    if (
      !environment ||
      environment.type != "environment" ||
      environment.isSub
    ) {
      return false;
    }
    const envParent = orgGraph[environment.envParentId] as Model.EnvParent;

    return envParent.type == "app"
      ? authz.hasAppPermission(
          orgGraph,
          auth.user.id,
          environment.envParentId,
          "app_manage_environments"
        )
      : authz.hasOrgPermission(
          orgGraph,
          auth.user.id,
          "blocks_manage_environments"
        );
  },
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    const environment = orgGraph[payload.id] as Api.Db.Environment;
    return {
      type: "graphHandlerResult",
      graph: {
        ...orgGraph,
        [payload.id]: {
          ...environment,
          settings: payload.settings,
          updatedAt: now,
        },
      },
      logTargetIds: [
        environment.envParentId,
        environment.environmentRoleId,
        environment.isSub ? environmentCompositeId(environment) : undefined,
      ].filter((id): id is string => Boolean(id)),
    };
  },
});

const canCreateOrDeleteVariableGroup = (
    userGraph: Client.Graph.UserGraph,
    auth: Auth.DefaultAuthContext,
    envParentId: string,
    subEnvironmentId?: string
  ) => {
    const envParent = userGraph[envParentId];
    if (!envParent) {
      return false;
    }

    if (subEnvironmentId) {
      const subEnvironment = userGraph[subEnvironmentId];
      if (!subEnvironment) {
        return false;
      }

      const permissions = getEnvironmentPermissions(
        userGraph,
        subEnvironmentId,
        auth.user.id
      );
      return permissions.has("write");
    }

    const environments =
      getEnvironmentsByEnvParentId(userGraph)[envParentId] || [];
    if (environments.length == 0) {
      return false;
    }

    for (let environment of environments) {
      const permissions = getEnvironmentPermissions(
        userGraph,
        environment.id,
        auth.user.id
      );
      if (!permissions.has("write")) {
        return false;
      }
    }

    return true;
  },
  getHandlerEnvsResponse = <
    BlobType extends "env" | "inheritanceOverrides" | "changeset"
  >(
    orgGraph: Api.Graph.OrgGraph,
    envParentIds: string[],
    blobType: BlobType,
    changesetsCreatedAfterByEnvParentId?: Record<string, number | undefined>
  ) => {
    return {
      scopes: R.flatten(
        envParentIds.map((envParentId) => {
          const envParent = orgGraph[envParentId] as Model.EnvParent;
          let connectedScopes: Blob.ScopeParams[];
          if (envParent.type == "app") {
            const blockIds = getConnectedBlocksForApp(
              orgGraph,
              envParentId
            ).map(R.prop("id"));
            connectedScopes = blockIds.map(
              (blockId) =>
                ({
                  blobType,
                  envParentId: blockId,
                  ...(blobType == "changeset" &&
                  changesetsCreatedAfterByEnvParentId?.[blockId]
                    ? {
                        createdAfter:
                          changesetsCreatedAfterByEnvParentId[blockId],
                      }
                    : {}),
                } as Blob.ScopeParams)
            );
          } else {
            connectedScopes = [];
          }

          return [
            {
              blobType,
              envParentId,
              ...(blobType == "changeset" &&
              changesetsCreatedAfterByEnvParentId?.[envParentId]
                ? {
                    createdAfter:
                      changesetsCreatedAfterByEnvParentId[envParentId],
                  }
                : {}),
            },
            ...connectedScopes,
          ];
        })
      ),
    } as BlobType extends "changeset"
      ? Api.HandlerChangesetsResponse
      : Api.HandlerEnvsResponse;
  };

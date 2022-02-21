import { parseUserEncryptedKeyOrBlobComposite } from "@core/lib/blob";
import { pick, stripNullsRecursive } from "@core/lib/utils/object";
import { getAuth, getEnvWithMeta } from "@core/lib/client";
import * as R from "ramda";
import { Client, Api, Model, Crypto, Rbac } from "@core/types";
import { clientAction, dispatch } from "../handler";
import {
  removeObjectProducers,
  renameObjectProducers,
  statusProducers,
} from "../lib/status";
import * as g from "@core/lib/graph";
import {
  encryptSymmetricWithKey,
  decryptSymmetricWithKey,
} from "@core/lib/crypto/proxy";
import { secureRandomAlphanumeric } from "@core/lib/crypto/utils";
import { fetchRequiredEnvs } from "@core_proc/lib/envs";
import { log } from "@core/lib/utils/logger";
import fs from "fs";
import { wait } from "@core/lib/utils/wait";

clientAction<Client.Action.ClientActions["UpdateUserRoles"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.UPDATE_USER_ROLES,
  serialAction: true,
  stateProducer: (draft, { payload, meta }) => {
    for (let { id, orgRoleId } of payload) {
      draft.isUpdatingUserRole[id] = orgRoleId;
      delete draft.updateUserRoleErrors[id];
    }
  },
  failureStateProducer: (draft, { meta: { rootAction }, payload }) => {
    for (let { id } of rootAction.payload) {
      draft.updateUserRoleErrors[id] = {
        payload: rootAction.payload,
        error: payload,
      };
    }
  },
  endStateProducer: (draft, { meta: { rootAction } }) => {
    for (let { id } of rootAction.payload) {
      delete draft.isUpdatingUserRole[id];
    }
  },
  bulkApiDispatcher: true,
  apiActionCreator: async (payload) => ({
    action: {
      type: Api.ActionType.UPDATE_USER_ROLE,
      payload: pick(["id", "orgRoleId"], payload),
    },
  }),
});

clientAction<Api.Action.RequestActions["UpdateUserRole"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.UPDATE_USER_ROLE,
  bulkDispatchOnly: true,
  graphProposer:
    ({ payload }) =>
    (graphDraft) => {
      (graphDraft[payload.id] as Model.OrgUser | Model.CliUser).orgRoleId =
        payload.orgRoleId;
    },
  encryptedKeysScopeFn: (graph, { payload: { id } }) => ({
    userIds: new Set([id]),
    envParentIds: "all",
    keyableParentIds: "all",
  }),
});

clientAction<
  Api.Action.RequestActions["RenameOrg"],
  Api.Net.ApiResultTypes["RenameOrg"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.RENAME_ORG,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  stateProducer: (draft, { meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    draft.isRenaming[auth.orgId] = true;
    delete draft.renameErrors[auth.orgId];
  },
  failureStateProducer: (draft, { payload, meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    draft.renameErrors[auth.orgId] = payload;
  },
  endStateProducer: (draft, { meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    delete draft.isRenaming[auth.orgId];
  },
});

clientAction<
  Api.Action.RequestActions["UpdateOrgSettings"],
  Api.Net.ApiResultTypes["UpdateOrgSettings"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.UPDATE_ORG_SETTINGS,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  stateProducer: (draft, { meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    draft.isUpdatingSettings[auth.orgId] = true;
    delete draft.updateSettingsErrors[auth.orgId];
  },
  successStateProducer: (draft, { meta }) => {
    const accountId = meta.accountIdOrCliKey,
      rootActionPayload = meta.rootAction.payload,
      cryptoSettings = rootActionPayload.crypto;

    if (cryptoSettings) {
      const authDraft = getAuth(draft, accountId);

      if (authDraft && authDraft.type == "clientUserAuth") {
        if (typeof cryptoSettings.requiresPassphrase == "boolean") {
          authDraft.requiresPassphrase = cryptoSettings.requiresPassphrase;
        }

        if (typeof cryptoSettings.requiresLockout == "boolean") {
          authDraft.requiresLockout = cryptoSettings.requiresLockout;

          if (!cryptoSettings.requiresLockout) {
            delete authDraft.lockoutMs;
          }
        }

        if (typeof cryptoSettings.lockoutMs == "number") {
          authDraft.lockoutMs = cryptoSettings.lockoutMs;
        }
      }
    }
  },
  failureStateProducer: (draft, { payload, meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    draft.updateSettingsErrors[auth.orgId] = payload;
  },
  endStateProducer: (draft, { meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    delete draft.isUpdatingSettings[auth.orgId];
  },
});

clientAction<
  Api.Action.RequestActions["RenameUser"],
  Api.Net.ApiResultTypes["RenameUser"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.RENAME_USER,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...renameObjectProducers,
});

clientAction<
  Api.Action.RequestActions["RemoveFromOrg"],
  Api.Net.ApiResultTypes["RemoveFromOrg"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.REMOVE_FROM_ORG,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
  successStateProducer: (
    draft,
    {
      meta: {
        accountIdOrCliKey,
        rootAction: {
          payload: { id },
        },
      },
    }
  ) => {
    const auth = getAuth(draft, accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }

    if (id in draft.orgUserAccounts) {
      let defaultAccountId =
        draft.defaultAccountId === id ? undefined : draft.defaultAccountId;
      const orgUserAccounts = R.omit([id], draft.orgUserAccounts),
        remainingAccounts =
          Object.values<Client.ClientUserAuth>(orgUserAccounts);

      if (remainingAccounts.length == 1) {
        defaultAccountId = remainingAccounts[0]!.userId;
      }

      if (id == auth.userId) {
        return {
          ...draft,
          ...Client.defaultAccountState,
          ...Client.defaultClientState,
          orgUserAccounts,
          defaultAccountId,
        };
      } else {
        return {
          ...draft,
          orgUserAccounts,
          defaultAccountId,
        };
      }
    }
  },
});

clientAction<
  Api.Action.RequestActions["DeleteOrg"],
  Api.Net.ApiResultTypes["DeleteOrg"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_ORG,
  loggableType: "authAction",
  loggableType2: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  stateProducer: (draft, { meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    draft.isRemoving[auth.orgId] = true;
    delete draft.removeErrors[auth.orgId];
  },
  successStateProducer: (draft, { meta: { accountIdOrCliKey } }) => ({
    ...draft,
    ...Client.defaultAccountState,
    ...Client.defaultClientState,
    orgUserAccounts: R.omit([accountIdOrCliKey!], draft.orgUserAccounts),
  }),
  failureStateProducer: (draft, { payload, meta }) => {
    const auth = getAuth(draft, meta.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }
    draft.removeErrors[auth.orgId] = payload;
    delete draft.isRemoving[auth.orgId];
  },
});

clientAction<Client.Action.ClientActions["ImportOrg"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.IMPORT_ORG,
  stateProducer: (draft) => {
    draft.isImportingOrg = true;
  },
  failureStateProducer: (draft, { payload }) => {
    draft.importOrgError = payload;
  },
  endStateProducer: (draft) => {
    delete draft.importOrgStatus;
    delete draft.isImportingOrg;
  },
  handler: async (
    initialState,
    { payload: { filePath, encryptionKey, importOrgUsers } },
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    let state = initialState;

    const updateStatus = async (status: string) => {
      await dispatch(
        {
          type: Client.ActionType.SET_IMPORT_ORG_STATUS,
          payload: { status },
        },
        context
      );
      await wait(1500);
    };

    await updateStatus("Decrypting and parsing archive");

    let encryptedJson: string;
    try {
      encryptedJson = await new Promise<string>((resolve, reject) => {
        fs.readFile(filePath, null, (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(data.toString());
          }
        });
      });
    } catch (err) {
      return dispatchFailure(err, context);
    }

    const encrypted = JSON.parse(encryptedJson) as Crypto.EncryptedData;
    const archiveJson = await decryptSymmetricWithKey({
      encrypted,
      encryptionKey,
    });
    const archive = JSON.parse(archiveJson) as Client.OrgArchiveV1;
    const byType = g.graphTypes(state.graph);
    const license = byType.license;

    if (byType.org.id == archive.org.id) {
      return dispatchFailure(
        {
          type: "clientError",
          error: {
            name: "Import error",
            message: "Cannot import back into the same org",
          },
        },
        context
      );
    }

    const now = Date.now();

    const licenseExpired = license.expiresAt != -1 && now > license.expiresAt;

    if (licenseExpired) {
      return dispatchFailure(
        {
          type: "clientError",
          error: { name: "License error", message: "License expired" },
        },
        context
      );
    }

    const numActiveDevices = byType.org.deviceLikeCount;
    const numActiveServerEnvkeys = byType.org.serverEnvkeyCount;

    if (
      (license.maxDevices != -1 &&
        numActiveDevices + archive.orgUsers.length + archive.cliUsers.length >
          license.maxDevices) ||
      (license.maxServerEnvkeys != -1 &&
        numActiveServerEnvkeys + archive.servers.length >
          license.maxServerEnvkeys)
    ) {
      return dispatchFailure(
        {
          type: "clientError",
          error: { name: "License error", message: "License limits exceeded" },
        },
        context
      );
    }

    const idMap: Record<string, string> = {};

    const rolesByComposite = R.indexBy(
      (role) => (role.isDefault ? [role.type, role.defaultName].join("|") : ""),
      [byType.orgRoles, byType.appRoles, byType.environmentRoles].flat()
    );
    const existingOrgUsersByEmail = R.indexBy(R.prop("email"), byType.orgUsers);

    for (let [type, archiveRoles] of [
      ["orgRole", archive.defaultOrgRoles],
      ["appRole", archive.defaultAppRoles],
      ["environmentRole", archive.defaultEnvironmentRoles],
    ] as [
      string,
      Client.OrgArchiveV1[
        | "defaultOrgRoles"
        | "defaultAppRoles"
        | "defaultEnvironmentRoles"]
    ][]) {
      for (let archiveRole of archiveRoles) {
        if (!archiveRole.defaultName) {
          continue;
        }

        const existingRole =
          rolesByComposite[[type, archiveRole.defaultName].join("|")];

        idMap[archiveRole.id] = existingRole.id;

        if (
          existingRole.type == "environmentRole" &&
          "settings" in archiveRole &&
          !R.equals(
            existingRole.settings,
            (archiveRole as Client.OrgArchiveV1["defaultEnvironmentRoles"][0])
              .settings
          )
        ) {
          const res = await dispatch(
            {
              type: Api.ActionType.RBAC_UPDATE_ENVIRONMENT_ROLE_SETTINGS,
              payload: {
                id: existingRole.id,
                settings: (
                  archiveRole as Client.OrgArchiveV1["defaultEnvironmentRoles"][0]
                ).settings,
              },
            },
            context
          );
          if (res.success) {
            state = res.state;
          } else {
            return dispatchFailure((res.resultAction as any).payload, context);
          }
        }
      }
    }

    const orgNameNeedsUpdate = archive.org.name != byType.org.name;
    const orgSettingsNeedUpdate = !R.equals(
      archive.org.settings,
      byType.org.settings
    );
    if (orgNameNeedsUpdate || orgSettingsNeedUpdate) {
      await updateStatus("Importing org settings");
      if (orgNameNeedsUpdate) {
        const res = await dispatch(
          {
            type: Api.ActionType.RENAME_ORG,
            payload: { name: archive.org.name },
          },
          context
        );
        if (res.success) {
          state = res.state;
        } else {
          return dispatchFailure((res.resultAction as any).payload, context);
        }
      }

      if (orgSettingsNeedUpdate) {
        const res = await dispatch(
          {
            type: Api.ActionType.UPDATE_ORG_SETTINGS,
            payload: archive.org.settings,
          },
          context
        );
        if (res.success) {
          state = res.state;
        } else {
          return dispatchFailure((res.resultAction as any).payload, context);
        }
      }
    }

    if (archive.apps.length > 0) {
      await updateStatus("Importing apps");
      for (let archiveApp of archive.apps) {
        const res = await dispatch(
          {
            type: Api.ActionType.CREATE_APP,
            payload: { name: archiveApp.name, settings: archiveApp.settings },
          },
          context
        );

        if (res.success) {
          state = res.state;

          const createdApp = g
            .graphTypes(res.state.graph)
            .apps.find(R.propEq("createdAt", res.state.graphUpdatedAt))!;

          idMap[archiveApp.id] = createdApp.id;
        } else {
          return dispatchFailure((res.resultAction as any).payload, context);
        }
      }
    }

    if (archive.blocks.length > 0) {
      await updateStatus("Importing blocks");
      for (let archiveBlock of archive.blocks) {
        const res = await dispatch(
          {
            type: Api.ActionType.CREATE_BLOCK,
            payload: {
              name: archiveBlock.name,
              settings: archiveBlock.settings,
            },
          },
          context
        );

        if (res.success) {
          state = res.state;

          const createdBlock = g
            .graphTypes(res.state.graph)
            .blocks.find(R.propEq("createdAt", res.state.graphUpdatedAt))!;

          idMap[archiveBlock.id] = createdBlock.id;
        } else {
          return dispatchFailure((res.resultAction as any).payload, context);
        }
      }
    }

    if (archive.appBlocks.length > 0) {
      await updateStatus("Importing app-block connections");

      for (let batch of R.splitEvery(
        25,
        archive.appBlocks.filter(
          ({ appId, blockId }) => idMap[appId] && idMap[blockId]
        )
      )) {
        const res = await dispatch(
          {
            type: Client.ActionType.CONNECT_BLOCKS,
            payload: batch.map(({ appId, blockId, orderIndex }, i) => ({
              appId: idMap[appId],
              blockId: idMap[blockId],
              orderIndex,
            })),
          },
          context
        );

        if (res.success) {
          state = res.state;
        } else {
          return dispatchFailure((res.resultAction as any).payload, context);
        }
      }
    }

    if (
      archive.nonDefaultEnvironmentRoles.length > 0 ||
      archive.baseEnvironments.length > 0 ||
      archive.subEnvironments.length > 0
    ) {
      await updateStatus("Importing environment and sub-environment metadata");

      const defaultAppRoleEnvironmentRolesByEnvironmentRoleId = R.groupBy(
        R.prop("environmentRoleId"),
        byType.appRoleEnvironmentRoles
      );

      const nonDefaultAppRoleEnvironmentRolesByEnvironmentRoleId = R.groupBy(
        R.prop("environmentRoleId"),
        archive.nonDefaultAppRoleEnvironmentRoles
      );

      for (let role of archive.nonDefaultEnvironmentRoles) {
        const nonDefaultEnvironmentRoles =
          nonDefaultAppRoleEnvironmentRolesByEnvironmentRoleId[role.id] ?? [];
        const defaultEnvironmentRoles =
          defaultAppRoleEnvironmentRolesByEnvironmentRoleId[role.id] ?? [];

        const appRoleEnvironmentRoles = R.fromPairs(
          (
            [...nonDefaultEnvironmentRoles, ...defaultEnvironmentRoles] as Pick<
              Rbac.AppRoleEnvironmentRole,
              "permissions" | "appRoleId"
            >[]
          )
            .map(
              ({ permissions, appRoleId }) =>
                [idMap[appRoleId] ?? appRoleId, permissions] as [
                  string,
                  Rbac.AppRoleEnvironmentRole["permissions"]
                ]
            )
            .filter(
              ([appRoleId]) =>
                !(state.graph[appRoleId] as Rbac.AppRole)
                  .hasFullEnvironmentPermissions
            )
        );

        const res = await dispatch(
          {
            type: Api.ActionType.RBAC_CREATE_ENVIRONMENT_ROLE,
            payload: {
              ...R.omit(["id"], role),
              appRoleEnvironmentRoles,
            },
          },
          context
        );

        if (res.success) {
          state = res.state;

          const createdRole = g
            .graphTypes(res.state.graph)
            .environmentRoles.find(
              R.propEq("createdAt", res.state.graphUpdatedAt)
            )!;

          idMap[role.id] = createdRole.id;
        } else {
          return dispatchFailure((res.resultAction as any).payload, context);
        }
      }

      const existingBaseEnvironmentsByComposite = R.indexBy(
        ({ envParentId, environmentRoleId }) =>
          envParentId + "|" + environmentRoleId,
        g
          .graphTypes(state.graph)
          .environments.filter(R.complement(R.prop("isSub")))
      );

      for (let archiveEnvironment of archive.baseEnvironments) {
        const mappedEnvParentId = idMap[archiveEnvironment.envParentId];
        const mappedEnvironmentRoleId =
          idMap[archiveEnvironment.environmentRoleId];
        const composite = [mappedEnvParentId, mappedEnvironmentRoleId].join(
          "|"
        );
        const existingBaseEnvironment =
          existingBaseEnvironmentsByComposite[composite];

        if (existingBaseEnvironment) {
          idMap[archiveEnvironment.id] = existingBaseEnvironment.id;
        } else {
          const res = await dispatch(
            {
              type: Api.ActionType.CREATE_ENVIRONMENT,
              payload: {
                environmentRoleId: idMap[archiveEnvironment.environmentRoleId],
                envParentId: idMap[archiveEnvironment.envParentId],
              },
            },
            context
          );

          if (res.success) {
            state = res.state;

            const createdEnvironment = g
              .graphTypes(res.state.graph)
              .environments.find(
                R.propEq("createdAt", res.state.graphUpdatedAt)
              ) as Model.Environment & { isSub: false };

            idMap[archiveEnvironment.id] = createdEnvironment.id;

            if (
              !R.equals(
                archiveEnvironment.settings,
                createdEnvironment.settings
              )
            ) {
              const res = await dispatch(
                {
                  type: Api.ActionType.UPDATE_ENVIRONMENT_SETTINGS,
                  payload: {
                    id: createdEnvironment.id,
                    settings: archiveEnvironment.settings,
                  },
                },
                context
              );
              if (res.success) {
                state = res.state;
              } else {
                return dispatchFailure(
                  (res.resultAction as any).payload,
                  context
                );
              }
            }
          } else {
            return dispatchFailure((res.resultAction as any).payload, context);
          }
        }
      }

      for (let archiveEnvironment of archive.subEnvironments) {
        const res = await dispatch(
          {
            type: Api.ActionType.CREATE_ENVIRONMENT,
            payload: {
              isSub: true,
              environmentRoleId:
                idMap[archiveEnvironment.environmentRoleId] ??
                archiveEnvironment.environmentRoleId,
              envParentId: idMap[archiveEnvironment.envParentId],
              parentEnvironmentId:
                idMap[archiveEnvironment.parentEnvironmentId],
              subName: archiveEnvironment.subName,
            },
          },
          context
        );

        if (res.success) {
          state = res.state;

          const createdEnvironment = g
            .graphTypes(res.state.graph)
            .environments.find(
              R.propEq("createdAt", res.state.graphUpdatedAt)
            )!;

          idMap[archiveEnvironment.id] = createdEnvironment.id;
        } else {
          return dispatchFailure((res.resultAction as any).payload, context);
        }
      }
    }

    if (importOrgUsers && archive.orgUsers.length > 0) {
      await updateStatus("Re-inviting users");

      const [duplicateArchiveOrgUsers, filteredArchiveOrgUsers] = R.partition(
        ({ email }) => Boolean(existingOrgUsersByEmail[email]),
        archive.orgUsers
      );

      for (let archiveOrgUser of duplicateArchiveOrgUsers) {
        const existingOrgUser = existingOrgUsersByEmail[archiveOrgUser.email];
        idMap[archiveOrgUser.id] = existingOrgUser.id;
      }

      for (let batch of R.splitEvery(25, filteredArchiveOrgUsers)) {
        const res = await dispatch(
          {
            type: Client.ActionType.INVITE_USERS,
            payload: batch.map((archiveOrgUser) => ({
              user: {
                ...pick(
                  ["email", "firstName", "lastName", "provider", "uid"],
                  archiveOrgUser
                ),
                orgRoleId: idMap[archiveOrgUser.orgRoleId],
              },
            })),
          },
          context
        );

        if (res.success) {
          state = res.state;

          const createdOrgUsers = g
            .graphTypes(res.state.graph)
            .orgUsers.filter(R.propEq("createdAt", res.state.graphUpdatedAt));

          const createdOrgUsersByEmail = R.indexBy(
            R.prop("email"),
            createdOrgUsers
          );

          for (let archiveOrgUser of batch) {
            const created = createdOrgUsersByEmail[archiveOrgUser.email];
            idMap[archiveOrgUser.id] = created.id;
          }
        } else {
          return dispatchFailure((res.resultAction as any).payload, context);
        }
      }
    }

    if (archive.cliUsers.length > 0) {
      await updateStatus("Regenerating CLI keys");

      for (let archiveCliUser of archive.cliUsers) {
        const res = await dispatch(
          {
            type: Client.ActionType.CREATE_CLI_USER,
            payload: {
              name: archiveCliUser.name,
              orgRoleId: idMap[archiveCliUser.orgRoleId],
            },
          },
          context
        );

        if (res.success) {
          state = res.state;

          const created = g
            .graphTypes(res.state.graph)
            .cliUsers.find(R.propEq("createdAt", res.state.graphUpdatedAt))!;

          idMap[archiveCliUser.id] = created.id;
        } else {
          return dispatchFailure((res.resultAction as any).payload, context);
        }
      }
    }

    if (archive.appUserGrants.length > 0) {
      await updateStatus("Importing app access grants");

      for (let batch of R.splitEvery(
        25,
        archive.appUserGrants.filter(
          ({ appId, userId }) => idMap[appId] && idMap[userId]
        )
      )) {
        const res = await dispatch(
          {
            type: Client.ActionType.GRANT_APPS_ACCESS,
            payload: batch.map(({ appId, userId, appRoleId }) => ({
              appId: idMap[appId],
              userId: idMap[userId] ?? userId,
              appRoleId: idMap[appRoleId],
            })),
          },
          context
        );

        if (res.success) {
          state = res.state;
        } else {
          return dispatchFailure((res.resultAction as any).payload, context);
        }
      }
    }

    if (archive.servers.length > 0) {
      await updateStatus("Regenerating servers");

      for (let archiveServer of archive.servers) {
        const res = await dispatch(
          {
            type: Client.ActionType.CREATE_SERVER,
            payload: {
              appId: idMap[archiveServer.appId],
              environmentId: idMap[archiveServer.environmentId],
              name: archiveServer.name,
            },
          },
          context
        );

        if (res.success) {
          state = res.state;
        } else {
          return dispatchFailure((res.resultAction as any).payload, context);
        }
      }
    }

    if (!R.isEmpty(archive.envs)) {
      await updateStatus(
        "Importing, encrypting, and syncing environments and locals"
      );

      const environmentIds = Object.keys(archive.envs);

      for (let batch of R.splitEvery(10, environmentIds)) {
        for (let environmentId of batch) {
          let envParentId: string;
          let localsUserId: string | undefined;
          const environment = state.graph[idMap[environmentId]] as
            | Model.Environment
            | undefined;
          if (environment) {
            envParentId = environment.envParentId;
          } else {
            [envParentId, localsUserId] = environmentId
              .split("|")
              .map((id) => idMap[id]);
          }

          const mappedEnvironmentId = environment
            ? environment.id
            : [envParentId, localsUserId].join("|");

          for (let entryKey in archive.envs[environmentId].variables) {
            const update = stripNullsRecursive(
              archive.envs[environmentId].variables[entryKey]
            );
            if (update.inheritsEnvironmentId) {
              const mappedInheritsId = idMap[update.inheritsEnvironmentId];
              update.inheritsEnvironmentId = mappedInheritsId;
            }

            dispatch(
              {
                type: Client.ActionType.UPDATE_ENTRY_VAL,
                payload: {
                  envParentId,
                  environmentId: mappedEnvironmentId,
                  entryKey,
                  update,
                },
              },
              context
            );
          }
        }

        const pendingEnvironmentIds = batch.map((environmentId) => {
          const environment = state.graph[idMap[environmentId]] as
            | Model.Environment
            | undefined;
          if (environment) {
            return environment.id;
          } else {
            const [envParentId, localsUserId] = environmentId
              .split("|")
              .map((id) => idMap[id]);
            return [envParentId, localsUserId].join("|");
          }
        });

        const res = await dispatch(
          {
            type: Client.ActionType.COMMIT_ENVS,
            payload: {
              pendingEnvironmentIds,
            },
          },
          context
        );

        if (res.success) {
          state = res.state;
        } else {
          return dispatchFailure((res.resultAction as any).payload, context);
        }
      }
    }

    await wait(1000);

    return dispatchSuccess(null, context);
  },
});

clientAction<Client.Action.ClientActions["SetImportOrgStatus"]>({
  type: "clientAction",
  actionType: Client.ActionType.SET_IMPORT_ORG_STATUS,
  stateProducer: (draft, { payload: { status } }) => {
    draft.importOrgStatus = status;
  },
});

clientAction<
  Client.Action.ClientActions["ExportOrg"],
  { encryptionKey: string; filePath: string }
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.EXPORT_ORG,
  ...statusProducers("isExportingOrg", "exportOrgError"),
  handler: async (
    initialState,
    { payload: { filePath } },
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    let state = initialState;

    const byType = g.graphTypes(state.graph);

    // first we gotta make sure all the envs have been fetched
    const fetchRes = await fetchRequiredEnvs(
      state,
      new Set([
        ...byType.apps.map(R.prop("id")),
        ...byType.blocks.map(R.prop("id")),
      ]),
      new Set(),
      context
    );

    if (fetchRes) {
      if (fetchRes.success) {
        state = fetchRes.state;
      } else {
        return dispatchFailure((fetchRes.resultAction as any).payload, context);
      }
    }

    const encryptionKey = secureRandomAlphanumeric(22);
    const now = Date.now();

    const archive: Client.OrgArchiveV1 = {
      schemaVersion: "1",

      org: pick(["id", "name", "settings"], byType.org),
      apps: byType.apps.map(pick(["id", "name", "settings"])),
      blocks: byType.blocks.map(pick(["id", "name", "settings"])),
      appBlocks: byType.appBlocks.map(pick(["appId", "blockId", "orderIndex"])),

      defaultOrgRoles: byType.orgRoles.map(pick(["id", "defaultName"])),
      defaultAppRoles: byType.appRoles.map(pick(["id", "defaultName"])),
      defaultEnvironmentRoles: byType.environmentRoles
        .filter(R.prop("isDefault"))
        .map(pick(["id", "defaultName", "settings"])),

      nonDefaultEnvironmentRoles: byType.environmentRoles
        .filter(R.complement(R.prop("isDefault")))
        .map(
          pick([
            "id",
            "name",
            "settings",
            "description",
            "hasLocalKeys",
            "hasServers",
            "defaultAllApps",
            "defaultAllBlocks",
          ])
        ),
      nonDefaultAppRoleEnvironmentRoles: byType.appRoleEnvironmentRoles
        .filter(
          ({ environmentRoleId }) =>
            !(state.graph[environmentRoleId] as Rbac.EnvironmentRole).isDefault
        )
        .map(pick(["appRoleId", "environmentRoleId", "permissions"])),

      baseEnvironments: byType.environments
        .filter(
          (environment): environment is Model.Environment & { isSub: false } =>
            !environment.isSub
        )
        .map(pick(["id", "envParentId", "environmentRoleId", "settings"])),
      subEnvironments: byType.environments
        .filter(
          (environment): environment is Model.Environment & { isSub: true } =>
            environment.isSub
        )
        .map(
          pick([
            "id",
            "envParentId",
            "environmentRoleId",
            "parentEnvironmentId",
            "subName",
          ])
        ),

      servers: byType.servers.map((server) => ({
        ...pick(["appId", "environmentId", "name"], server),
      })),

      cliUsers: byType.cliUsers
        .filter((u) => !u.deactivatedAt && !u.deletedAt)
        .map(pick(["id", "orgRoleId", "name"])),

      orgUsers: byType.orgUsers
        .filter(
          (ou) =>
            !ou.deactivatedAt &&
            !ou.deletedAt &&
            ["creator", "accepted", "pending"].includes(
              g.getInviteStatus(state.graph, ou.id, now)
            )
        )
        .map(
          pick([
            "id",
            "firstName",
            "lastName",
            "email",
            "provider",
            "orgRoleId",
            "uid",
            "externalAuthProviderId",
            "scim",
          ])
        ),

      appUserGrants: byType.appUserGrants.map(
        pick(["appId", "userId", "appRoleId"])
      ),

      envs: R.fromPairs(
        R.toPairs(state.envs).map(([composite]) => {
          const { environmentId } =
            parseUserEncryptedKeyOrBlobComposite(composite);
          const environment = state.graph[environmentId] as
            | Model.Environment
            | undefined;
          const envParentId =
            environment?.envParentId ?? environmentId.split("|")[0];

          return [
            environmentId,
            getEnvWithMeta(state, { envParentId, environmentId }),
          ];
        })
      ),
    };

    const encryptedArchive = await encryptSymmetricWithKey({
      data: JSON.stringify(archive),
      encryptionKey,
    });

    try {
      await new Promise<void>((resolve, reject) =>
        fs.writeFile(filePath, JSON.stringify(encryptedArchive), (err) => {
          if (err) {
            return reject(err);
          }
          resolve();
        })
      );
      return dispatchSuccess({ encryptionKey, filePath }, context);
    } catch (err) {
      return dispatchFailure(err, context);
    }
  },
});

clientAction<Client.Action.ClientActions["ClearThrottleError"]>({
  type: "clientAction",
  actionType: Client.ActionType.CLEAR_THROTTLE_ERROR,
  stateProducer: (draft) => {
    delete draft.throttleError;
  },
});

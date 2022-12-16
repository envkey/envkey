import { parseUserEncryptedKeyOrBlobComposite } from "@core/lib/blob";
import { pick, stripNullsRecursive } from "@core/lib/utils/object";
import { getChangesets, getEnvWithMeta } from "@core/lib/client";
import * as R from "ramda";
import { Client, Api, Model, Crypto, Rbac } from "@core/types";
import { clientAction, dispatch } from "../handler";
import { statusProducers } from "../lib/status";
import * as g from "@core/lib/graph";
import {
  encryptSymmetricWithKey,
  decryptSymmetricWithKey,
} from "@core/lib/crypto/proxy";
import { secureRandomAlphanumeric } from "@core/lib/crypto/utils";
import { fetchRequiredEnvs } from "@core_proc/lib/envs";
import fs from "fs";
import { wait } from "@core/lib/utils/wait";
import { log } from "@core/lib/utils/logger";
import { updateLocalSocketImportStatusIfNeeded } from "@core_proc/lib/envs/status";
import { getAuth } from "@core/lib/client";

const updateImportStatus = async (
  status: string,
  context: Client.Context,
  withDelay = true
) => {
  if (!process.env.IS_TEST) {
    log("import status: " + status);
  }

  const res = await dispatch(
    {
      type: Client.ActionType.SET_IMPORT_ORG_STATUS,
      payload: { status },
    },
    context
  );
  if (res.success) {
    await updateLocalSocketImportStatusIfNeeded(res.state, context);
    if (withDelay) {
      await wait(1500);
    }
  } else {
    log("Error updating import status", { res: res.resultAction });
  }
};

clientAction<
  Api.Action.RequestActions["StartedOrgImport"],
  Api.Net.ApiResultTypes["StartedOrgImport"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.STARTED_ORG_IMPORT,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
});

clientAction<
  Api.Action.RequestActions["FinishedOrgImport"],
  Api.Net.ApiResultTypes["FinishedOrgImport"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.FINISHED_ORG_IMPORT,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
});

clientAction<Client.Action.ClientActions["ResetOrgImport"]>({
  type: "clientAction",
  actionType: Client.ActionType.RESET_ORG_IMPORT,
  stateProducer: (draft) => {
    delete draft.unfilteredOrgArchive;
    delete draft.filteredOrgArchive;
    delete draft.decryptOrgArchiveError;
    delete draft.isDecryptingOrgArchive;
    delete draft.isImportingOrg;
    delete draft.importOrgStatus;
    delete draft.importOrgError;
  },
});

clientAction<
  Client.Action.ClientActions["DecryptOrgArchive"],
  { unfiltered: Client.OrgArchiveV1; filtered: Client.OrgArchiveV1 }
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.DECRYPT_ORG_ARCHIVE,
  stateProducer: (draft) => {
    delete draft.unfilteredOrgArchive;
    delete draft.filteredOrgArchive;
    delete draft.decryptOrgArchiveError;
    draft.isDecryptingOrgArchive = true;
  },
  successStateProducer: (draft, { payload }) => {
    draft.unfilteredOrgArchive = payload.unfiltered;
    draft.filteredOrgArchive = payload.filtered;
  },
  failureStateProducer: (draft, { payload }) => {
    draft.decryptOrgArchiveError = payload;
  },
  endStateProducer: (draft) => {
    delete draft.isDecryptingOrgArchive;
  },
  handler: async (
    state,
    { payload: { filePath, encryptionKey } },
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    let encrypted: Crypto.EncryptedData;
    let archiveJson: string;
    let archive: Client.OrgArchiveV1;

    try {
      const encryptedJson = await new Promise<string>((resolve, reject) => {
        fs.readFile(filePath, null, (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(data.toString());
          }
        });
      });

      try {
        encrypted = JSON.parse(encryptedJson) as Crypto.EncryptedData;
      } catch (err) {
        log("Error parsing encrypted archive", { err });
        throw new Error("Error parsing encrypted archive");
      }

      try {
        archiveJson = await decryptSymmetricWithKey({
          encrypted,
          encryptionKey,
        });
      } catch (err) {
        log("Invalid encryption key", { err });
        throw new Error("Invalid encryption key");
      }

      try {
        archive = JSON.parse(archiveJson) as Client.OrgArchiveV1;
      } catch (err) {
        log("Error parsing decrypted archive", { err });
        throw new Error("Error parsing decrypted archive");
      }

      const existingEmails = new Set([
        ...g.graphTypes(state.graph).orgUsers.map(R.prop("email")),
      ]);

      const alreadyImportedIds = new Set(
        Object.values(state.graph)
          .map((o) => ("importId" in o ? o.importId : undefined))
          .filter(Boolean) as string[]
      );

      const filteredArchive: Client.OrgArchiveV1 = {
        ...pick(
          [
            "schemaVersion",
            "org",
            "defaultOrgRoles",
            "defaultAppRoles",
            "defaultEnvironmentRoles",
            "envs", // have to filter this later with knowledge of id mappings
          ],
          archive
        ),
        apps: R.sortBy(
          R.prop("name"),
          archive.apps.filter((app) => !alreadyImportedIds.has(app.id))
        ),
        blocks: R.sortBy(
          R.prop("name"),
          archive.blocks.filter((block) => !alreadyImportedIds.has(block.id))
        ),
        appBlocks: archive.appBlocks.filter(
          (appBlock) =>
            !alreadyImportedIds.has(
              [appBlock.appId, appBlock.blockId].join("|")
            )
        ),

        nonDefaultEnvironmentRoles: archive.nonDefaultEnvironmentRoles.filter(
          (environmentRole) => !alreadyImportedIds.has(environmentRole.id)
        ),

        nonDefaultAppRoleEnvironmentRoles:
          archive.nonDefaultAppRoleEnvironmentRoles.filter(
            (appRoleEnvironmentRole) =>
              !alreadyImportedIds.has(appRoleEnvironmentRole.environmentRoleId)
          ),

        baseEnvironments: archive.baseEnvironments.filter(
          (environment) => !alreadyImportedIds.has(environment.id)
        ),
        subEnvironments: archive.subEnvironments.filter(
          (environment) => !alreadyImportedIds.has(environment.id)
        ),
        servers: archive.servers.filter(
          (server) =>
            !alreadyImportedIds.has(
              [server.environmentId, server.name].join("|")
            )
        ),
        orgUsers: R.sortBy(
          (ou) => [ou.lastName, ou.firstName].join(" "),
          archive.orgUsers.filter(
            (orgUser) =>
              !alreadyImportedIds.has(orgUser.id) &&
              !existingEmails.has(orgUser.email)
          )
        ),
        cliUsers: R.sortBy(
          R.prop("name"),
          archive.cliUsers.filter(
            (cliUser) => !alreadyImportedIds.has(cliUser.id)
          )
        ),
        appUserGrants: archive.appUserGrants.filter(
          (appUserGrant) =>
            !alreadyImportedIds.has(
              [appUserGrant.appId, appUserGrant.userId].join("|")
            )
        ),
      };

      return dispatchSuccess(
        { unfiltered: archive, filtered: filteredArchive },
        context
      );
    } catch (err) {
      return dispatchFailure(err, context);
    }
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
    {
      payload: {
        importOrgUsers,
        importServers,
        importCliUsers,
        regenServerKeys,
        importEnvParentIds,
        importOrgUserIds,
        importCliUserIds,
      },
    },
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    let state = initialState;

    const auth = getAuth(state, context.accountIdOrCliKey);
    if (!auth || ("token" in auth && !auth.token)) {
      throw new Error("Action requires authentication");
    }

    const unfilteredArchive = state.unfilteredOrgArchive;
    const archive = state.filteredOrgArchive;
    if (!archive || !unfilteredArchive) {
      return dispatchFailure(
        {
          type: "clientError",
          error: {
            name: "Import error",
            message: "Archive not loaded",
          },
        },
        context
      );
    }

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

    const importEnvParentIdsSet = importEnvParentIds
      ? new Set(importEnvParentIds)
      : undefined;
    const importOrgUserIdsSet = importOrgUsers
      ? importOrgUserIds
        ? new Set(importOrgUserIds)
        : undefined
      : new Set<string>();
    const importCliUserIdsSet = importCliUsers
      ? importCliUserIds
        ? new Set(importCliUserIds)
        : undefined
      : new Set<string>();

    const idMap: Record<string, string> = {};

    // idempotency: pre-fill idMap with objects that were previously imported
    for (let id in state.graph) {
      const o = state.graph[id];
      if ("importId" in o && o.importId) {
        idMap[o.importId] = id;
      }
    }

    // idempotency: add any users with duplicate emails to idMap
    const existingOrgUsersByEmail = R.indexBy(R.prop("email"), byType.orgUsers);
    const duplicateArchiveOrgUsers = unfilteredArchive.orgUsers.filter(
      ({ email }) => Boolean(existingOrgUsersByEmail[email])
    );
    for (let archiveOrgUser of duplicateArchiveOrgUsers) {
      const existingOrgUser = existingOrgUsersByEmail[archiveOrgUser.email];
      idMap[archiveOrgUser.id] = existingOrgUser.id;
    }

    const filteredAgainArchive: Client.OrgArchiveV1 = {
      ...pick(
        [
          "schemaVersion",
          "org",
          "defaultOrgRoles",
          "defaultAppRoles",
          "defaultEnvironmentRoles",
          "nonDefaultEnvironmentRoles",
          "nonDefaultAppRoleEnvironmentRoles",
          "envs", // have to filter this later with knowledge of id mappings
        ],
        archive
      ),
      apps: archive.apps.filter(
        (app) => !(importEnvParentIdsSet && !importEnvParentIdsSet.has(app.id))
      ),
      blocks: archive.blocks.filter(
        (block) =>
          !(importEnvParentIdsSet && !importEnvParentIdsSet.has(block.id))
      ),
      appBlocks: archive.appBlocks.filter(
        (appBlock) =>
          !(
            importEnvParentIdsSet &&
            !(
              (importEnvParentIdsSet.has(appBlock.appId) ||
                idMap[appBlock.appId]) &&
              (importEnvParentIdsSet.has(appBlock.blockId) ||
                idMap[appBlock.blockId])
            )
          )
      ),

      baseEnvironments: archive.baseEnvironments.filter(
        (environment) =>
          !(
            importEnvParentIdsSet &&
            !(
              importEnvParentIdsSet.has(environment.envParentId) ||
              idMap[environment.envParentId]
            )
          )
      ),
      subEnvironments: archive.subEnvironments.filter(
        (environment) =>
          !(
            importEnvParentIdsSet &&
            !(
              importEnvParentIdsSet.has(environment.envParentId) ||
              idMap[environment.envParentId]
            )
          )
      ),
      servers: importServers
        ? archive.servers.filter(
            (server) =>
              !(
                importEnvParentIdsSet &&
                !(
                  importEnvParentIdsSet.has(server.appId) || idMap[server.appId]
                )
              )
          )
        : [],
      orgUsers: importOrgUsers
        ? archive.orgUsers.filter(
            (orgUser) =>
              !(importOrgUserIdsSet && !importOrgUserIdsSet.has(orgUser.id))
          )
        : [],
      cliUsers: importCliUsers
        ? archive.cliUsers.filter(
            (cliUser) =>
              !(importCliUserIdsSet && !importCliUserIdsSet.has(cliUser.id))
          )
        : [],
      appUserGrants: archive.appUserGrants.filter(
        (appUserGrant) =>
          (idMap[appUserGrant.appId] && idMap[appUserGrant.userId]) ||
          (!(
            importEnvParentIdsSet &&
            !importEnvParentIdsSet.has(appUserGrant.appId)
          ) &&
            !(
              importOrgUserIdsSet &&
              !importOrgUserIdsSet.has(appUserGrant.userId)
            ) &&
            !(
              importCliUserIdsSet &&
              !importCliUserIdsSet.has(appUserGrant.userId)
            ))
      ),
    };

    const numActiveUserOrInvites = byType.org.activeUserOrInviteCount;

    if (
      license.maxUsers &&
      license.maxUsers != -1 &&
      (numActiveUserOrInvites ?? 0) +
        filteredAgainArchive.orgUsers.length +
        filteredAgainArchive.cliUsers.length >
        license.maxUsers
    ) {
      return dispatchFailure(
        {
          type: "clientError",
          error: { name: "License error", message: "License limits exceeded" },
        },
        context
      );
    }

    const rolesByComposite = R.indexBy(
      (role) => (role.isDefault ? [role.type, role.defaultName].join("|") : ""),
      [byType.orgRoles, byType.appRoles, byType.environmentRoles].flat()
    );

    let res = await dispatch(
      {
        type: Api.ActionType.STARTED_ORG_IMPORT,
        payload: {},
      },
      context
    );
    if (!res.success) {
      return dispatchFailure((res.resultAction as any)?.payload, context);
    }

    for (let [type, archiveRoles] of [
      ["orgRole", filteredAgainArchive.defaultOrgRoles],
      ["appRole", filteredAgainArchive.defaultAppRoles],
      ["environmentRole", filteredAgainArchive.defaultEnvironmentRoles],
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
            return dispatchFailure((res.resultAction as any)?.payload, context);
          }
        }
      }
    }

    // const orgNameNeedsUpdate = filteredArchive.org.name != byType.org.name;
    const orgSettingsNeedUpdate =
      !byType.org.orgSettingsImported &&
      !R.equals(filteredAgainArchive.org.settings, byType.org.settings);
    if (orgSettingsNeedUpdate) {
      await updateImportStatus("Importing org settings", context);

      const res = await dispatch(
        {
          type: Api.ActionType.UPDATE_ORG_SETTINGS,
          payload: filteredAgainArchive.org.settings,
        },
        context
      );
      if (res.success) {
        state = res.state;
      } else {
        return dispatchFailure((res.resultAction as any)?.payload, context);
      }
    }

    if (filteredAgainArchive.apps.length > 0) {
      await updateImportStatus(
        `Importing ${filteredAgainArchive.apps.length} apps`,
        context
      );
      for (let [i, archiveApp] of filteredAgainArchive.apps.entries()) {
        const res = await dispatch(
          {
            type: Client.ActionType.CREATE_APP,
            payload: {
              name: archiveApp.name,
              settings: archiveApp.settings,
              importId: archiveApp.id,
            },
          },
          context
        );

        if (res.success) {
          state = res.state;

          const createdApp = R.last(
            R.sortBy(R.prop("createdAt"), g.graphTypes(res.state.graph).apps)
          )!;

          idMap[archiveApp.id] = createdApp.id;

          await updateImportStatus(
            `Imported ${i + 1}/${filteredAgainArchive.apps.length} apps`,
            context,
            i == filteredAgainArchive.apps.length - 1
          );
        } else {
          return dispatchFailure((res.resultAction as any)?.payload, context);
        }
      }
    }

    if (filteredAgainArchive.blocks.length > 0) {
      await updateImportStatus(
        `Importing ${filteredAgainArchive.blocks.length} blocks`,
        context
      );
      for (let [i, archiveBlock] of filteredAgainArchive.blocks.entries()) {
        const res = await dispatch(
          {
            type: Client.ActionType.CREATE_BLOCK,
            payload: {
              name: archiveBlock.name,
              settings: archiveBlock.settings,
              importId: archiveBlock.id,
            },
          },
          context
        );

        if (res.success) {
          state = res.state;

          const createdBlock = R.last(
            R.sortBy(R.prop("createdAt"), g.graphTypes(res.state.graph).blocks)
          )!;

          idMap[archiveBlock.id] = createdBlock.id;

          await updateImportStatus(
            `Imported ${i + 1}/${filteredAgainArchive.blocks.length} blocks`,
            context,
            i == filteredAgainArchive.blocks.length - 1
          );
        } else {
          return dispatchFailure((res.resultAction as any)?.payload, context);
        }
      }
    }

    if (filteredAgainArchive.appBlocks.length > 0) {
      await updateImportStatus(
        `Importing ${filteredAgainArchive.appBlocks.length} app-block connections`,
        context
      );

      const batches = R.splitEvery(
        25,
        filteredAgainArchive.appBlocks.filter(
          ({ appId, blockId }) => idMap[appId] && idMap[blockId]
        )
      );
      for (let [i, batch] of batches.entries()) {
        const res = await dispatch(
          {
            type: Client.ActionType.CONNECT_BLOCKS,
            payload: batch.map(({ appId, blockId, orderIndex }, i) => ({
              appId: idMap[appId],
              blockId: idMap[blockId],
              importId: [appId, blockId].join("|"),
              orderIndex,
            })),
          },
          context
        );

        if (res.success) {
          state = res.state;

          await updateImportStatus(
            `Imported ${Math.min(i * 25 + batch.length)}/${
              filteredAgainArchive.appBlocks.length
            } app-block connections`,
            context,
            i == batches.length - 1
          );
        } else {
          return dispatchFailure((res.resultAction as any)?.payload, context);
        }
      }
    }

    if (
      filteredAgainArchive.nonDefaultEnvironmentRoles.length > 0 ||
      filteredAgainArchive.baseEnvironments.length > 0 ||
      filteredAgainArchive.subEnvironments.length > 0
    ) {
      await updateImportStatus(
        "Importing environment and branch metadata",
        context
      );

      const defaultAppRoleEnvironmentRolesByEnvironmentRoleId = R.groupBy(
        R.prop("environmentRoleId"),
        byType.appRoleEnvironmentRoles
      );

      const nonDefaultAppRoleEnvironmentRolesByEnvironmentRoleId = R.groupBy(
        R.prop("environmentRoleId"),
        filteredAgainArchive.nonDefaultAppRoleEnvironmentRoles
      );

      for (let role of filteredAgainArchive.nonDefaultEnvironmentRoles) {
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
              importId: role.id,
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
          return dispatchFailure((res.resultAction as any)?.payload, context);
        }
      }

      const existingBaseEnvironmentsByComposite = R.indexBy(
        ({ envParentId, environmentRoleId }) =>
          envParentId + "|" + environmentRoleId,
        g
          .graphTypes(state.graph)
          .environments.filter(R.complement(R.prop("isSub")))
      );

      const toCreateBaseEnvironments: Client.OrgArchiveV1["baseEnvironments"] =
        [];

      const filteredAgainBaseEnvironmentsById = R.indexBy(
        R.prop("id"),
        filteredAgainArchive.baseEnvironments
      );

      for (let archiveEnvironment of unfilteredArchive.baseEnvironments) {
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
        } else if (filteredAgainBaseEnvironmentsById[archiveEnvironment.id]) {
          toCreateBaseEnvironments.push(archiveEnvironment);
        }
      }

      if (toCreateBaseEnvironments.length > 0) {
        await updateImportStatus(
          `Creating ${toCreateBaseEnvironments.length} base environments`,
          context
        );

        for (let [
          i,
          archiveEnvironment,
        ] of toCreateBaseEnvironments.entries()) {
          const res = await dispatch(
            {
              type: Api.ActionType.CREATE_ENVIRONMENT,
              payload: {
                environmentRoleId: idMap[archiveEnvironment.environmentRoleId],
                envParentId: idMap[archiveEnvironment.envParentId],
                importId: archiveEnvironment.id,
              },
            },
            context
          );

          if (res.success) {
            state = res.state;

            const createdEnvironment = R.last(
              R.sortBy(
                R.prop("createdAt"),
                g.graphTypes(res.state.graph).environments
              )
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
                await updateImportStatus(
                  `Created ${i + 1}/${
                    toCreateBaseEnvironments.length
                  } base environments`,
                  context,
                  i == toCreateBaseEnvironments.length - 1
                );
              } else {
                return dispatchFailure(
                  (res.resultAction as any)?.payload,
                  context
                );
              }
            }
          } else {
            return dispatchFailure((res.resultAction as any)?.payload, context);
          }
        }
      }

      if (filteredAgainArchive.subEnvironments.length > 0) {
        await updateImportStatus(
          `Creating ${filteredAgainArchive.subEnvironments.length} branches`,
          context
        );
        for (let [
          i,
          archiveEnvironment,
        ] of filteredAgainArchive.subEnvironments.entries()) {
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
                importId: archiveEnvironment.id,
              },
            },
            context
          );

          if (res.success) {
            state = res.state;

            const createdEnvironment = R.last(
              R.sortBy(
                R.prop("createdAt"),
                g.graphTypes(res.state.graph).environments
              )
            )!;

            idMap[archiveEnvironment.id] = createdEnvironment.id;

            await updateImportStatus(
              `Created ${i + 1}/${
                filteredAgainArchive.subEnvironments.length
              } branches`,
              context,
              i == filteredAgainArchive.subEnvironments.length - 1
            );
          } else {
            return dispatchFailure((res.resultAction as any)?.payload, context);
          }
        }
      }
    }

    if (importOrgUsers && filteredAgainArchive.orgUsers.length > 0) {
      await updateImportStatus(
        `Re-inviting ${filteredAgainArchive.orgUsers.length} users`,
        context
      );

      const batches = R.splitEvery(25, filteredAgainArchive.orgUsers);
      for (let [i, batch] of batches.entries()) {
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

          const orgUsers = g.graphTypes(res.state.graph).orgUsers;
          const orgUsersByEmail = R.indexBy(R.prop("email"), orgUsers);

          for (let archiveOrgUser of batch) {
            const created = orgUsersByEmail[archiveOrgUser.email];
            idMap[archiveOrgUser.id] = created.id;
          }

          await updateImportStatus(
            `Re-invited ${i * 25 + batch.length}/${
              filteredAgainArchive.orgUsers.length
            } users`,
            context,
            i == batches.length - 1
          );
        } else {
          return dispatchFailure((res.resultAction as any)?.payload, context);
        }
      }
    }

    if (filteredAgainArchive.cliUsers.length > 0) {
      await updateImportStatus(
        `Regenerating ${filteredAgainArchive.cliUsers.length} CLI keys`,
        context
      );

      for (let [i, archiveCliUser] of filteredAgainArchive.cliUsers.entries()) {
        const res = await dispatch(
          {
            type: Client.ActionType.CREATE_CLI_USER,
            payload: {
              name: archiveCliUser.name,
              orgRoleId: idMap[archiveCliUser.orgRoleId],
              importId: archiveCliUser.id,
            },
          },
          context
        );

        if (res.success) {
          state = res.state;

          const created = R.last(
            R.sortBy(
              R.prop("createdAt"),
              g.graphTypes(res.state.graph).cliUsers
            )
          )!;

          idMap[archiveCliUser.id] = created.id;

          await updateImportStatus(
            `Regenerated ${i + 1}/${
              filteredAgainArchive.cliUsers.length
            } CLI keys`,
            context,
            i == filteredAgainArchive.cliUsers.length - 1
          );
        } else {
          return dispatchFailure((res.resultAction as any)?.payload, context);
        }
      }
    }

    if (filteredAgainArchive.appUserGrants.length > 0) {
      await updateImportStatus(
        `Importing ${filteredAgainArchive.appUserGrants.length} app access grants`,
        context
      );

      const batches = R.splitEvery(
        25,
        filteredAgainArchive.appUserGrants.filter(
          ({ appId, userId, appRoleId }) =>
            idMap[appId] &&
            idMap[userId] &&
            g.authz.canGrantAppRoleToUser(state.graph, auth.userId, {
              appId: idMap[appId],
              userId: idMap[userId],
              appRoleId: idMap[appRoleId],
            })
        )
      );

      for (let [i, batch] of batches.entries()) {
        const res = await dispatch(
          {
            type: Client.ActionType.GRANT_APPS_ACCESS,
            payload: batch.map(({ appId, userId, appRoleId }) => ({
              appId: idMap[appId],
              userId: idMap[userId] ?? userId,
              appRoleId: idMap[appRoleId],
              importId: [appId, userId].join("|"),
            })),
          },
          context
        );

        if (res.success) {
          state = res.state;

          await updateImportStatus(
            `Imported ${i * 25 + batch.length}/${
              filteredAgainArchive.appUserGrants.length
            } app access grants`,
            context,
            i == batches.length - 1
          );
        } else {
          return dispatchFailure((res.resultAction as any)?.payload, context);
        }
      }
    }

    if (importServers && filteredAgainArchive.servers.length > 0) {
      await updateImportStatus(
        `${regenServerKeys ? "Regenerating" : "Recreating"} ${
          filteredAgainArchive.servers.length
        } servers`,
        context
      );

      for (let [i, archiveServer] of filteredAgainArchive.servers.entries()) {
        const res = await dispatch(
          {
            type: Client.ActionType.CREATE_SERVER,
            payload: {
              appId: idMap[archiveServer.appId],
              environmentId: idMap[archiveServer.environmentId],
              name: archiveServer.name,
              skipGenerateKey: !regenServerKeys,
              importId: [archiveServer.environmentId, archiveServer.name].join(
                "|"
              ),
            },
          },
          context
        );

        if (res.success) {
          state = res.state;

          await updateImportStatus(
            `${regenServerKeys ? "Regenerated" : "Re-created"} ${i + 1}/${
              filteredAgainArchive.servers.length
            } servers`,
            context,
            i == filteredAgainArchive.servers.length - 1
          );
        } else {
          return dispatchFailure((res.resultAction as any)?.payload, context);
        }
      }
    }

    if (!R.isEmpty(filteredAgainArchive.envs)) {
      await updateImportStatus(
        "Importing, encrypting, and syncing environments and locals",
        context
      );

      const allArchiveEnvironmentIds = Object.keys(filteredAgainArchive.envs);
      const toFetchChangesetsEnvParentIds = new Set(
        allArchiveEnvironmentIds
          .map((environmentId) => {
            let mappedEnvParentId: string;
            let mappedLocalsUserId: string | undefined;
            const environment = state.graph[idMap[environmentId]] as
              | Model.Environment
              | undefined;
            if (environment) {
              mappedEnvParentId = environment.envParentId;
            } else {
              [mappedEnvParentId, mappedLocalsUserId] = environmentId
                .split("|")
                .map((id) => idMap[id]);
            }

            if (!(mappedEnvParentId && (environment || mappedLocalsUserId))) {
              return undefined;
            }

            const envParent = state.graph[mappedEnvParentId] as
              | Model.EnvParent
              | undefined;

            if (
              !envParent ||
              !envParent.importId ||
              !envParent.envsOrLocalsUpdatedAt
            ) {
              return undefined;
            }

            if (environment && environment.isSub && !environment.importId) {
              return undefined;
            }

            if (environment && !environment.envUpdatedAt) {
              return undefined;
            }

            return mappedEnvParentId;
          })
          .filter(Boolean) as string[]
      );

      if (toFetchChangesetsEnvParentIds.size > 0) {
        const fetchChangesetsRes = await fetchRequiredEnvs(
          state,
          new Set([]),
          toFetchChangesetsEnvParentIds,
          context
        );
        if (fetchChangesetsRes?.success) {
          state = fetchChangesetsRes.state;
        } else if (fetchChangesetsRes && !fetchChangesetsRes.success) {
          return dispatchFailure(
            (fetchChangesetsRes.resultAction as any)?.payload,
            context
          );
        }
      }

      const filteredEnvironmentIds = Object.keys(
        filteredAgainArchive.envs
      ).filter((environmentId) => {
        let mappedEnvParentId: string;
        let mappedLocalsUserId: string | undefined;
        const environment = state.graph[idMap[environmentId]] as
          | Model.Environment
          | undefined;
        if (environment) {
          mappedEnvParentId = environment.envParentId;
        } else {
          [mappedEnvParentId, mappedLocalsUserId] = environmentId
            .split("|")
            .map((id) => idMap[id]);
        }

        if (!(mappedEnvParentId && (environment || mappedLocalsUserId))) {
          return false;
        }

        const mappedEnvironmentId = environment
          ? environment.id
          : [mappedEnvParentId, mappedLocalsUserId].join("|");
        const envParent = state.graph[mappedEnvParentId] as
          | Model.EnvParent
          | undefined;

        if (!envParent) {
          return false;
        }

        if (!envParent.importId || !envParent.envsOrLocalsUpdatedAt) {
          return true;
        }

        if (environment && environment.isSub && !environment.importId) {
          return true;
        }

        if (environment && !environment.envUpdatedAt) {
          return true;
        }

        const changesets = getChangesets(state, {
          envParentId: mappedEnvParentId,
          environmentId: mappedEnvironmentId,
        });

        return changesets.length == 0;
      });

      await dispatch(
        {
          type: Client.ActionType.CLEAR_CACHED,
        },
        context
      );

      if (filteredEnvironmentIds.length > 0) {
        await updateImportStatus(
          `Importing ${filteredEnvironmentIds.length} environments`,
          context
        );

        const batches = R.splitEvery(10, filteredEnvironmentIds);

        for (let [i, batch] of batches.entries()) {
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

            for (let entryKey in filteredAgainArchive.envs[environmentId]
              .variables) {
              const update = stripNullsRecursive(
                filteredAgainArchive.envs[environmentId].variables[entryKey]
              );
              if (update.inheritsEnvironmentId) {
                const mappedInheritsId = idMap[update.inheritsEnvironmentId];
                update.inheritsEnvironmentId = mappedInheritsId;
              }

              await dispatch(
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
            const clearCachedRes = await dispatch(
              {
                type: Client.ActionType.CLEAR_CACHED,
              },
              context
            );

            await updateImportStatus(
              `Imported ${i * 10 + batch.length}/${
                filteredEnvironmentIds.length
              } environments`,
              context,
              i == batches.length - 1
            );

            if (clearCachedRes.success) {
              state = clearCachedRes.state;
            } else {
              state = res.state;
            }
          } else {
            return dispatchFailure((res.resultAction as any)?.payload, context);
          }
        }
      }
    }

    res = await dispatch(
      {
        type: Api.ActionType.FINISHED_ORG_IMPORT,
        payload: {},
      },
      context
    );
    if (!res.success) {
      return dispatchFailure((res.resultAction as any)?.payload, context);
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
    { payload: { filePath, debugData } },
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

    const encryptionKey = debugData
      ? "debug-key"
      : secureRandomAlphanumeric(22);
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
            getEnvWithMeta(
              state,
              { envParentId, environmentId },
              undefined,
              undefined,
              debugData
            ),
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

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
import os from "os";
import path from "path";
import { wait } from "@core/lib/utils/wait";
import { log } from "@core/lib/utils/logger";
import { updateLocalSocketImportStatusIfNeeded } from "@core_proc/lib/envs/status";
import { getAuth } from "@core/lib/client";
import { getDefaultOrgSettings } from "@core/lib/client/defaults";
import { sendMainToWorkerMessage } from "../proc_status_worker";

const IMPORT_ENVS_BATCH_SIZE = 10;

const updateImportStatus = async (
  status: string | undefined,
  context: Client.Context,
  withDelay = true
) => {
  if (process.env.NODE_ENV != "test") {
    log("import status: " + (status ?? "undefined"));
  }

  const res = await dispatch(
    {
      type: Client.ActionType.SET_IMPORT_ORG_STATUS,
      payload: { status },
    },
    context
  );
  const state = res.state;
  if (res.success) {
    await updateLocalSocketImportStatusIfNeeded(state, context);
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

clientAction<Client.Action.ClientActions["V1ClientAlive"]>({
  type: "clientAction",
  actionType: Client.ActionType.V1_CLIENT_ALIVE,
  stateProducer: (draft) => {
    draft.v1ClientAliveAt = Date.now();
  },
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
  failureStateProducer: (draft, { payload, meta }) => {
    draft.decryptOrgArchiveError = payload;
    if (meta.rootAction.payload.isV1Upgrade) {
      draft.v1UpgradeError = payload;
    }
  },
  endStateProducer: (draft) => {
    delete draft.isDecryptingOrgArchive;
  },
  handler: async (
    state,
    { payload },
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    const encryptionKey = payload.encryptionKey;
    const filePath =
      "fileName" in payload
        ? path.join(os.homedir(), ".envkey", "archives", payload.fileName)
        : payload.filePath;

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
            "isV1Upgrade",
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
        localKeys: (archive.localKeys ?? []).filter(
          (localKey) =>
            !alreadyImportedIds.has(
              [localKey.environmentId, localKey.userId, localKey.name].join("|")
            )
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

clientAction<
  Client.Action.ClientActions["ImportOrg"],
  Partial<
    Pick<Client.State, "importOrgServerErrors" | "importOrgLocalKeyErrors">
  >
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.IMPORT_ORG,
  stateProducer: (draft) => {
    draft.isImportingOrg = true;
    delete draft.importOrgServerErrors;
    delete draft.importOrgLocalKeyErrors;
  },
  failureStateProducer: (draft, { payload, meta }) => {
    draft.importOrgError = payload;
    delete draft.unfilteredOrgArchive;
    delete draft.filteredOrgArchive;

    if (meta.rootAction.payload.isV1Upgrade) {
      draft.v1UpgradeStatus = "error";
      draft.v1UpgradeError = payload;

      delete draft.v1IsUpgrading;
      delete draft.v1UpgradeAccountId;
    }
  },
  successStateProducer: (draft, { payload, meta }) => {
    if (meta.rootAction.payload.isV1Upgrade) {
      draft.v1UpgradeStatus = "finished";
    }
    draft.importOrgServerErrors = payload.importOrgServerErrors;
    draft.importOrgLocalKeyErrors = payload.importOrgLocalKeyErrors;
  },
  endStateProducer: (draft) => {
    delete draft.isImportingOrg;
    delete draft.importOrgStatus;
  },
  successHandler: async (state, action, payload, context) => {
    sendMainToWorkerMessage({
      type: "v1UpgradeStatus",
      v1UpgradeStatus: state.v1UpgradeStatus,
      generatedInvites: state.generatedInvites,
    });
    await updateImportStatus(state.importOrgStatus, context);
  },
  failureHandler: async (state, action, payload, context) => {
    sendMainToWorkerMessage({
      type: "v1UpgradeStatus",
      v1UpgradeStatus: state.v1UpgradeStatus,
    });
    await updateImportStatus(undefined, context);
  },
  handler: async (
    initialState,
    {
      payload: {
        importOrgUsers,
        importServers,
        importLocalKeys,
        importCliUsers,
        regenServerKeys,
        importEnvParentIds,
        importOrgUserIds,
        importCliUserIds,
        isV1UpgradeIntoExistingOrg,
        v1Upgrade,
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

    let importOrgServerErrors: Client.State["importOrgServerErrors"];
    let importOrgLocalKeyErrors: Client.State["importOrgLocalKeyErrors"];

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

    await updateImportStatus("Starting import", context);

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

    const archiveOrgUsersById = R.indexBy(
      R.prop("id"),
      unfilteredArchive.orgUsers
    );
    const archiveCliUsersById = R.indexBy(
      R.prop("id"),
      unfilteredArchive.cliUsers
    );

    const filteredAgainArchive: Client.OrgArchiveV1 = {
      ...pick(
        [
          "schemaVersion",
          "isV1Upgrade",
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
      localKeys:
        importLocalKeys && archive.localKeys
          ? archive.localKeys.filter(
              (localKey) =>
                !(
                  importEnvParentIdsSet &&
                  !(
                    importEnvParentIdsSet.has(localKey.appId) ||
                    idMap[localKey.appId]
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
      appUserGrants: archive.appUserGrants.filter((appUserGrant) => {
        // if both the app and the user have already been imported, import the grant
        if (idMap[appUserGrant.appId] && idMap[appUserGrant.userId]) {
          return true;
        }

        const isOrgUser = idMap[appUserGrant.userId]
          ? state.graph[idMap[appUserGrant.userId]].type == "orgUser"
          : Boolean(archiveOrgUsersById[appUserGrant.userId]);

        const isCliUser =
          !isOrgUser &&
          (idMap[appUserGrant.userId]
            ? state.graph[idMap[appUserGrant.userId]].type == "cliUser"
            : Boolean(archiveCliUsersById[appUserGrant.userId]));

        // if we're selecting a subset of apps and this one isn't included, don't include the grant
        if (
          importEnvParentIdsSet &&
          !importEnvParentIdsSet.has(appUserGrant.appId)
        ) {
          return false;
        }

        // if we're selecting a subset of org users and this one isn't included, don't include the grant
        if (
          isOrgUser &&
          (!importOrgUsers ||
            (importOrgUserIdsSet &&
              !importOrgUserIdsSet.has(appUserGrant.userId)))
        ) {
          return false;
        }

        // if we're selecting a subset of cli users and this one isn't included, don't include the grant
        if (
          isCliUser &&
          (!importCliUsers ||
            (importCliUserIdsSet &&
              !importCliUserIdsSet.has(appUserGrant.userId)))
        ) {
          return false;
        }

        return true;
      }),
    };

    const numActiveUserOrInvites = byType.org.activeUserOrInviteCount;

    if (
      !isV1UpgradeIntoExistingOrg &&
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
        payload:
          isV1UpgradeIntoExistingOrg && v1Upgrade
            ? {
                isV1UpgradeIntoExistingOrg,
                v1Upgrade,
              }
            : {
                isV1UpgradeIntoExistingOrg: false,
              },
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

    if (
      orgSettingsNeedUpdate &&
      Object.values(
        filteredAgainArchive.org.environmentRoleIpsAllowed ?? {}
      ).some((ips) => ips && ips.length > 0)
    ) {
      await updateImportStatus("Importing org firewall settings", context);

      const res = await dispatch(
        {
          type: Api.ActionType.SET_ORG_ALLOWED_IPS,
          payload: {
            environmentRoleIpsAllowed: R.toPairs(
              filteredAgainArchive.org.environmentRoleIpsAllowed ?? {}
            ).reduce((agg, [roleId, ips]) => {
              if (ips) {
                agg[idMap[roleId]] = ips;
              }
              return agg;
            }, {} as Required<Model.Org>["environmentRoleIpsAllowed"]),
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

    if (filteredAgainArchive.apps.length > 0) {
      await updateImportStatus(
        `Importing ${filteredAgainArchive.apps.length} app${
          filteredAgainArchive.apps.length == 1 ? "" : "s"
        }`,
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
            `Imported ${i + 1}/${filteredAgainArchive.apps.length} app${
              filteredAgainArchive.apps.length == 1 ? "" : "s"
            }`,
            context,
            i == filteredAgainArchive.apps.length - 1
          );
        } else {
          return dispatchFailure((res.resultAction as any)?.payload, context);
        }
      }

      const appsWithFirewallSettings = filteredAgainArchive.apps.filter(
        (archiveApp) =>
          Object.values(archiveApp.environmentRoleIpsAllowed ?? {}).some(
            (ips) => ips && ips.length > 0
          ) ||
          Object.values(
            archiveApp.environmentRoleIpsMergeStrategies ?? {}
          ).some(R.identity)
      );

      if (appsWithFirewallSettings.length > 0) {
        await updateImportStatus("Importing app firewall settings", context);

        for (let archiveApp of appsWithFirewallSettings) {
          const res = await dispatch(
            {
              type: Api.ActionType.SET_APP_ALLOWED_IPS,
              payload: {
                id: idMap[archiveApp.id],
                environmentRoleIpsAllowed: R.toPairs(
                  archiveApp.environmentRoleIpsAllowed ?? {}
                ).reduce((agg, [roleId, ips]) => {
                  if (ips) {
                    agg[idMap[roleId]] = ips;
                  }
                  return agg;
                }, {} as Required<Model.App>["environmentRoleIpsAllowed"]),
                environmentRoleIpsMergeStrategies: R.toPairs(
                  archiveApp.environmentRoleIpsMergeStrategies ?? {}
                ).reduce((agg, [roleId, strategy]) => {
                  if (strategy) {
                    agg[idMap[roleId]] = strategy;
                  }
                  return agg;
                }, {} as Required<Model.App>["environmentRoleIpsMergeStrategies"]),
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

    if (filteredAgainArchive.blocks.length > 0) {
      await updateImportStatus(
        `Importing ${filteredAgainArchive.blocks.length} block${
          filteredAgainArchive.blocks.length == 1 ? "" : "s"
        }`,
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
            `Imported ${i + 1}/${filteredAgainArchive.blocks.length} block${
              filteredAgainArchive.blocks.length == 1 ? "" : "s"
            }`,
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
        `Importing ${
          filteredAgainArchive.appBlocks.length
        } app-block connection${
          filteredAgainArchive.appBlocks.length == 1 ? "" : "s"
        }`,
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
            } app-block connection${
              filteredAgainArchive.appBlocks.length == 1 ? "" : "s"
            }`,
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
          `Importing ${toCreateBaseEnvironments.length} base environment${
            toCreateBaseEnvironments.length == 1 ? "" : "s"
          }`,
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
                  `Imported ${i + 1}/${
                    toCreateBaseEnvironments.length
                  } base environment${
                    toCreateBaseEnvironments.length == 1 ? "" : "s"
                  }`,
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
          `Importing ${filteredAgainArchive.subEnvironments.length} branch${
            filteredAgainArchive.subEnvironments.length == 1 ? "" : "es"
          }`,
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
              `Imported ${i + 1}/${
                filteredAgainArchive.subEnvironments.length
              } branch${
                filteredAgainArchive.subEnvironments.length == 1 ? "" : "es"
              }`,
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
        `${filteredAgainArchive.isV1Upgrade ? "Importing" : "Re-inviting"} ${
          filteredAgainArchive.orgUsers.length
        } user${filteredAgainArchive.orgUsers.length == 1 ? "" : "s"}`,
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
                importId: archiveOrgUser.id,
                orgRoleId: idMap[archiveOrgUser.orgRoleId],
              },
              v1Token: archiveOrgUser.v1Token,
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
            `${filteredAgainArchive.isV1Upgrade ? "Imported" : "Re-invited"} ${
              i * 25 + batch.length
            }/${filteredAgainArchive.orgUsers.length} user${
              filteredAgainArchive.orgUsers.length == 1 ? "" : "s"
            }`,
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
        `Regenerating ${filteredAgainArchive.cliUsers.length} CLI key${
          filteredAgainArchive.cliUsers.length == 1 ? "" : "s"
        }`,
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
            } CLI key${filteredAgainArchive.cliUsers.length == 1 ? "" : "s"}`,
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
        `Importing ${
          filteredAgainArchive.appUserGrants.length
        } app access grant${
          filteredAgainArchive.appUserGrants.length == 1 ? "" : "s"
        }`,
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
            } app access grant${
              filteredAgainArchive.appUserGrants.length == 1 ? "" : "s"
            }`,
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
        `${
          regenServerKeys && !filteredAgainArchive.isV1Upgrade
            ? "Regenerating"
            : "Importing"
        } ${filteredAgainArchive.servers.length} server${
          filteredAgainArchive.servers.length == 1 ? "" : "s"
        }`,
        context
      );

      for (let [i, archiveServer] of filteredAgainArchive.servers.entries()) {
        const payload = {
          appId: idMap[archiveServer.appId],
          environmentId: idMap[archiveServer.environmentId],
          name: archiveServer.name,
          skipGenerateKey: !regenServerKeys,
          importId: [archiveServer.environmentId, archiveServer.name].join("|"),
          v1Payload: filteredAgainArchive.isV1Upgrade
            ? archiveServer.v1Payload
            : undefined,
          v1EnvkeyIdPart: filteredAgainArchive.isV1Upgrade
            ? archiveServer.v1EnvkeyIdPart
            : undefined,
          v1EncryptionKey: filteredAgainArchive.isV1Upgrade
            ? archiveServer.v1EncryptionKey
            : undefined,
        };

        const res = await dispatch(
          {
            type: Client.ActionType.CREATE_SERVER,
            payload,
          },
          context
        );

        if (res.success) {
          state = res.state;
        } else {
          if (!importOrgServerErrors) {
            importOrgServerErrors = {};
          }
          const appId = idMap[archiveServer.appId];
          const environmentId = idMap[archiveServer.environmentId];
          const app = state.graph[appId] as Model.App;
          const label = `${app.name} > ${g.getObjectName(
            state.graph,
            environmentId
          )} > ${archiveServer.name}`;
          const err = (res.resultAction as any)?.payload;
          let errorMessage = "Unknown error";

          if (err instanceof Error) {
            errorMessage = err.message;
          } else if ("error" in err && err.error && "message" in err.error) {
            errorMessage = err.error.message;
          } else if ("errorReason" in err && err.errorReason) {
            errorMessage = err.errorReason;
          }

          log(`Error importing server ${label}: ${errorMessage}`, {
            err,
            archiveServer: pick(
              ["appId", "environmentId", "name"],
              archiveServer
            ),
          });

          importOrgServerErrors[label] = errorMessage;
        }

        const numErrors = Object.keys(importOrgServerErrors ?? {}).length;

        await updateImportStatus(
          `${
            regenServerKeys && !filteredAgainArchive.isV1Upgrade
              ? "Regenerated"
              : "Imported"
          } ${i + 1 - numErrors}/${filteredAgainArchive.servers.length} server${
            filteredAgainArchive.servers.length > 1 ? "s" : ""
          }${
            numErrors > 0
              ? ` (${numErrors} error${numErrors > 1 ? "s" : ""})`
              : ""
          }`,
          context,
          i == filteredAgainArchive.servers.length - 1
        );
      }
    }

    if (
      importLocalKeys &&
      filteredAgainArchive.localKeys &&
      filteredAgainArchive.localKeys.length > 0
    ) {
      await updateImportStatus(
        `Importing ${filteredAgainArchive.localKeys.length} local key${
          filteredAgainArchive.localKeys.length > 1 ? "s" : ""
        }`,
        context
      );

      for (let [
        i,
        archiveLocalKey,
      ] of filteredAgainArchive.localKeys.entries()) {
        const payload = {
          appId: idMap[archiveLocalKey.appId],
          environmentId: idMap[archiveLocalKey.environmentId],
          name: archiveLocalKey.name,
          importId: [
            archiveLocalKey.environmentId,
            archiveLocalKey.userId,
            archiveLocalKey.name,
          ].join("|"),
          isV1UpgradeKey: filteredAgainArchive.isV1Upgrade || undefined,
          userId: idMap[archiveLocalKey.userId],
          v1Payload: filteredAgainArchive.isV1Upgrade
            ? archiveLocalKey.v1Payload
            : undefined,
          v1EnvkeyIdPart: filteredAgainArchive.isV1Upgrade
            ? archiveLocalKey.v1EnvkeyIdPart
            : undefined,
          v1EncryptionKey: filteredAgainArchive.isV1Upgrade
            ? archiveLocalKey.v1EncryptionKey
            : undefined,
        };

        const res = await dispatch(
          {
            type: Client.ActionType.CREATE_LOCAL_KEY,
            payload,
          },
          context
        );

        if (res.success) {
          state = res.state;
        } else {
          if (!importOrgLocalKeyErrors) {
            importOrgLocalKeyErrors = {};
          }
          const appId = idMap[archiveLocalKey.appId];
          const userId = idMap[archiveLocalKey.userId];
          const app = state.graph[appId] as Model.App;
          const label = `${app.name} > ${g.getUserName(
            state.graph,
            userId
          )} > ${archiveLocalKey.name}`;
          const err = (res.resultAction as any)?.payload;
          let errorMessage = "Unknown error";

          if (err instanceof Error) {
            errorMessage = err.message;
          } else if ("error" in err && err.error && "message" in err.error) {
            errorMessage = err.error.message;
          } else if ("errorReason" in err && err.errorReason) {
            errorMessage = err.errorReason;
          }

          log(`Error importing local key ${label}: ${errorMessage}`, {
            err,
            archiveLocalKey: pick(["appId", "userId", "name"], archiveLocalKey),
          });

          importOrgLocalKeyErrors[label] = errorMessage;
        }

        const numErrors = Object.keys(importOrgLocalKeyErrors ?? {}).length;
        await updateImportStatus(
          `Imported ${i + 1 - numErrors}/${
            filteredAgainArchive.localKeys.length
          } local key${filteredAgainArchive.localKeys.length > 1 ? "s" : ""}${
            numErrors > 0
              ? ` (${numErrors} error${numErrors > 1 ? "s" : ""})`
              : ""
          }`,
          context,
          i == filteredAgainArchive.localKeys.length - 1
        );
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

        const batches = R.splitEvery(
          IMPORT_ENVS_BATCH_SIZE,
          filteredEnvironmentIds
        );

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

            const parsed: Client.Env.RawEnv = R.mapObjIndexed((v) => {
              const update = stripNullsRecursive(v);
              if (update.inheritsEnvironmentId) {
                const mappedInheritsId = idMap[update.inheritsEnvironmentId];
                update.inheritsEnvironmentId = mappedInheritsId;
              }
              return update.inheritsEnvironmentId
                ? `inherits:${update.inheritsEnvironmentId}`
                : (update.val as string);
            }, filteredAgainArchive.envs[environmentId].variables);

            await dispatch(
              {
                type: Client.ActionType.IMPORT_ENVIRONMENT,
                payload: {
                  envParentId,
                  environmentId: mappedEnvironmentId,
                  parsed,
                },
              },
              context
            );
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
              `Imported ${i * IMPORT_ENVS_BATCH_SIZE + batch.length}/${
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

    if (v1Upgrade) {
      let elapsed = Date.now() - (state.v1ClientAliveAt ?? 0);
      log("elapsed since v1 active", {
        elapsed,
        v1ClientAliveAt: state.v1ClientAliveAt,
        now: Date.now(),
      });
      if (elapsed > 40000) {
        return dispatchFailure(
          {
            type: "error",
            error: true,
            errorReason: "EnvKey v1 is not running",
            errorStatus: 404,
          },
          context
        );
      }
    }

    await updateImportStatus("Finishing import", context);

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

    if (filteredAgainArchive.isV1Upgrade) {
      await dispatch(
        {
          type: Client.ActionType.CLEAR_ALL_GENERATED_ENVKEYS,
        },
        context
      );
    }

    return dispatchSuccess(
      {
        importOrgServerErrors,
        importOrgLocalKeyErrors,
      },
      context
    );
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

clientAction<Client.Action.ClientActions["LoadV1Upgrade"]>({
  type: "clientAction",
  actionType: Client.ActionType.LOAD_V1_UPGRADE,
  stateProducer: (draft, { payload }) => {
    draft.v1UpgradeLoaded = payload;
    draft.v1UpgradeStatus = "loaded";
  },
  handler: async (state) => {
    sendMainToWorkerMessage({
      type: "v1UpgradeStatus",
      v1UpgradeStatus: state.v1UpgradeStatus,
    });
  },
});

clientAction<
  Client.Action.ClientActions["StartV1Upgrade"],
  { accountId: string }
>({
  type: "asyncClientAction",
  actionType: Client.ActionType.START_V1_UPGRADE,
  stateProducer: (draft, { payload }) => {
    draft.v1IsUpgrading = true;
    delete draft.v1UpgradeError;
    delete draft.importOrgError;
    delete draft.importOrgStatus;

    if (!payload.accountId) {
      draft.isRegistering = true;
    }

    draft.v1UpgradeStatus = "upgrading";
    draft.v1ActiveUpgrade = payload;
  },
  failureStateProducer: (draft, action) => {
    draft.v1UpgradeError = action.payload;
    draft.v1UpgradeStatus = "error";
    delete draft.v1IsUpgrading;
  },
  successStateProducer: (draft, action) => {
    draft.v1UpgradeAccountId = action.payload.accountId;
  },
  endStateProducer: (draft) => {
    delete draft.isRegistering;
  },
  handler: async (
    initialState,
    { payload },
    { context, dispatchSuccess, dispatchFailure }
  ) => {
    let state = initialState;

    if (state.v1UpgradeAccountId) {
      return dispatchFailure(
        {
          type: "clientError",
          error: {
            name: "AlreadyUpgradingError",
            message: "Already upgrading",
          },
        },
        context
      );
    }

    sendMainToWorkerMessage({
      type: "v1UpgradeStatus",
      v1UpgradeStatus: state.v1UpgradeStatus,
    });

    let elapsed = Date.now() - (state.v1ClientAliveAt ?? 0);
    log("elapsed since v1 active", {
      elapsed,
      v1ClientAliveAt: state.v1ClientAliveAt,
      now: Date.now(),
    });
    if (elapsed > 40000) {
      return dispatchFailure(
        {
          type: "error",
          error: true,
          errorReason: "EnvKey v1 is not running",
          errorStatus: 404,
        },
        context
      );
    }

    if (!state.v1UpgradeLoaded) {
      return dispatchFailure(
        {
          type: "clientError",
          error: {
            name: "NoV1UpgradeDataError",
            message: "No v1 upgrade data loaded",
          },
        },
        context
      );
    }

    let accountId: string | undefined;
    let numUsers: number;

    if (payload.accountId) {
      const auth = getAuth(state, payload.accountId);
      if (!auth || ("token" in auth && !auth.token)) {
        throw new Error("Action requires authentication");
      }
      accountId = payload.accountId;

      if (!state.filteredOrgArchive) {
        const accountContext = { ...context, accountIdOrCliKey: accountId };
        const decryptRes = await dispatch(
          {
            type: Client.ActionType.DECRYPT_ORG_ARCHIVE,
            payload: { ...state.v1UpgradeLoaded, isV1Upgrade: true },
          },
          accountContext
        );

        if (decryptRes.success) {
          state = decryptRes.state;
        } else {
          updateImportStatus(undefined, accountContext, false);
          return dispatchFailure(
            (decryptRes.resultAction as any).payload,
            accountContext
          );
        }
      }

      if (!state.filteredOrgArchive) {
        return dispatchFailure(
          {
            type: "clientError",
            error: {
              name: "Upgrade error",
              message: "Archive not loaded",
            },
          },
          context
        );
      }

      numUsers = state.filteredOrgArchive.orgUsers.length;
    } else {
      numUsers = state.v1UpgradeLoaded.numUsers;
    }

    if (!state.v1UpgradeLoaded) {
      return dispatchFailure(
        {
          type: "clientError",
          error: {
            name: "NoV1UpgradeDataError",
            message: "v1 upgrade data not loaded",
          },
        },
        context
      );
    }

    const v1Upgrade = {
      ...pick(
        [
          "ts",
          "signature",
          "stripeCustomerId",
          "stripeSubscriptionId",
          "signedPresetBilling",
        ],
        state.v1UpgradeLoaded
      ),
      ...(state.v1UpgradeLoaded.signedPresetBilling
        ? {}
        : pick(
            ["billingInterval", "ssoEnabled", "freeTier", "newProductId"],
            payload
          )),
      numUsers,
    };

    if (!payload.accountId) {
      const registerAction: Client.Action.ClientActions["Register"] = {
        type: Client.ActionType.REGISTER,
        payload: {
          hostType: "cloud",
          provider: "email",
          user: state.v1UpgradeLoaded.creator,
          org: {
            name: state.v1UpgradeLoaded.orgName,
            settings: getDefaultOrgSettings(),
          },
          device: {
            name:
              payload.deviceName ??
              state.defaultDeviceName ??
              "v1-upgraded-device",
          },
          emailVerificationToken: "v1-upgrade",
          v1Upgrade,
        },
      };

      const registerRes = await dispatch(registerAction, context);

      if (registerRes.success) {
        const successPayload = (registerRes.resultAction as any)
          .payload as Api.Net.RegisterResult;

        accountId = successPayload.userId;
      } else {
        return dispatchFailure(
          (registerRes.resultAction as any).payload,
          context
        );
      }
    }

    if (!accountId) {
      return dispatchFailure(
        {
          type: "clientError",
          error: {
            name: "Upgrade error",
            message: "No account id",
          },
        },
        context
      );
    }

    const registeredContext = {
      ...context,
      accountIdOrCliKey: accountId,
    };

    if (!payload.accountId) {
      const decryptRes = await dispatch(
        {
          type: Client.ActionType.DECRYPT_ORG_ARCHIVE,
          payload: { ...state.v1UpgradeLoaded, isV1Upgrade: true },
        },
        registeredContext
      );

      if (!decryptRes.success) {
        updateImportStatus(undefined, registeredContext, false);
        return dispatchFailure(
          (decryptRes.resultAction as any).payload,
          registeredContext
        );
      }
    }

    //import in background
    dispatch(
      {
        type: Client.ActionType.IMPORT_ORG,
        payload: {
          importOrgUsers: payload.importOrgUsers,
          importLocalKeys: payload.importLocalKeys,
          importCliUsers: false,
          importServers: true,
          regenServerKeys: true,
          isV1Upgrade: true,
          isV1UpgradeIntoExistingOrg: Boolean(payload.accountId),
          v1Upgrade,
        },
      },
      registeredContext
    );

    return dispatchSuccess({ accountId }, registeredContext);
  },
});

clientAction<Client.Action.ClientActions["ResetV1Upgrade"]>({
  type: "clientAction",
  actionType: Client.ActionType.RESET_V1_UPGRADE,
  stateProducer: (draft, { payload }) => {
    delete draft.v1UpgradeLoaded;
    delete draft.v1IsUpgrading;
    delete draft.v1UpgradeError;
    delete draft.v1UpgradeInviteToken;
    delete draft.v1UpgradeEncryptionToken;
    delete draft.v1UpgradeAccountId;
    delete draft.v1UpgradeStatus;
    delete draft.v1UpgradeAcceptedInvite;
    delete draft.v1UpgradeInviteToken;
    delete draft.v1UpgradeEncryptionToken;

    delete draft.unfilteredOrgArchive;
    delete draft.filteredOrgArchive;
    delete draft.decryptOrgArchiveError;
    delete draft.isDecryptingOrgArchive;
    delete draft.isImportingOrg;
    delete draft.importOrgStatus;
    delete draft.importOrgError;

    delete draft.v1ActiveUpgrade;
    delete draft.v1ClientAliveAt;

    if (payload.cancelUpgrade) {
      draft.v1UpgradeStatus = "canceled";
    }
  },
  handler: async (state, action, context) => {
    sendMainToWorkerMessage({
      type: "v1UpgradeStatus",
      v1UpgradeStatus: state.v1UpgradeStatus,
    });
    return updateImportStatus(undefined, context);
  },
});

clientAction<Client.Action.ClientActions["LoadV1UpgradeInvite"]>({
  type: "clientAction",
  actionType: Client.ActionType.LOAD_V1_UPGRADE_INVITE,
  stateProducer: (draft, { payload }) => {
    draft.v1UpgradeInviteToken = payload.upgradeToken;
    draft.v1UpgradeEncryptionToken = payload.encryptionToken;
  },
});

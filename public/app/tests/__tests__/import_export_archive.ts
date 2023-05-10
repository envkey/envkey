import "./helpers/dotenv_helper";
import { envkeyFetch } from "./helpers/fetch_helper";
import {
  getTestId,
  resetTestId,
  getState,
  dispatch,
  hostUrl,
} from "./helpers/test_helper";
import { getUserEncryptedKeys } from "@api_shared/blob";
import {
  query,
  getDb,
  getNewTransactionConn,
  releaseTransaction,
} from "@api_shared/db";
import * as R from "ramda";
import { getAuth, getEnvWithMeta } from "@core/lib/client";
import { registerWithEmail, loadAccount } from "./helpers/auth_helper";
import { acceptInvite, inviteAdminUser } from "./helpers/invites_helper";
import { Client, Api, Model, Rbac } from "@core/types";
import { connectBlocks, createBlock } from "./helpers/blocks_helper";
import {
  updateEnvs,
  updateLocals,
  fetchEnvsWithChangesets,
  getEnvironments,
  fetchEnvs,
} from "./helpers/envs_helper";
import { createApp } from "./helpers/apps_helper";
import { graphTypes, getEnvironmentName } from "@core/lib/graph";
import { getOrg } from "@api_shared/models/orgs";
import { getOrgGraph } from "@api_shared/graph";
import { acceptDeviceGrant } from "./helpers/device_grants_helper";
import { testRemoveUser } from "./helpers/org_helper";
import { getRootPubkeyReplacements } from "./helpers/crypto_helper";
import { log } from "@core/lib/utils/logger";
import { wait } from "@core/lib/utils/wait";
import fs from "fs";

describe("import/export archive", () => {
  let email: string, orgId: string, deviceId: string, ownerId: string;

  beforeEach(async () => {
    email = `success+${getTestId()}@simulator.amazonses.com`;
    ({ orgId, deviceId, userId: ownerId } = await registerWithEmail(email));
  });

  test("export and import org archive", async () => {
    let state = getState(ownerId);
    const org = graphTypes(state.graph).org;

    await dispatch(
      {
        type: Api.ActionType.UPDATE_ORG_SETTINGS,
        payload: R.mergeDeepRight(org.settings, {
          auth: {
            tokenExpirationMs: 1000 * 60,
          },
        }),
      },
      ownerId
    );

    const { orgRoles, appRoles } = graphTypes(state.graph),
      [basicRole, adminRole] = R.props(
        ["Basic User", "Org Admin"] as string[],
        R.indexBy(R.prop("name"), orgRoles)
      ),
      [
        appOrgOwnerRole,
        appOrgAdminRole,
        appAdminRole,
        appProdRole,
        appDevRole,
      ] = R.props(
        ["Org Owner", "Org Admin", "Admin", "DevOps", "Developer"] as string[],
        R.indexBy(R.prop("name"), appRoles)
      );

    const { id: app1Id } = await createApp(ownerId, "App 1");
    const { id: app2Id } = await createApp(ownerId, "App 2");
    const { id: block1Id } = await createBlock(ownerId, "Block 1");
    const { id: block2Id } = await createBlock(ownerId, "Block 2");
    const { id: block3Id } = await createBlock(ownerId, "Block 3");
    const { id: block4Id } = await createBlock(ownerId, "Block 4");

    await updateEnvs(ownerId, app1Id);
    await updateLocals(ownerId, app1Id);

    await updateEnvs(ownerId, app2Id);
    await updateLocals(ownerId, app2Id);

    await updateEnvs(ownerId, block1Id);
    await updateLocals(ownerId, block1Id);

    await updateEnvs(ownerId, block2Id);
    await updateLocals(ownerId, block2Id);

    await updateEnvs(ownerId, block3Id);
    await updateLocals(ownerId, block3Id);

    await updateEnvs(ownerId, block4Id);
    await updateLocals(ownerId, block4Id);

    const environments = getEnvironments(ownerId, app1Id),
      [app1Development, app1Staging, app1Production] = environments;

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY_ROW,
        payload: {
          envParentId: app1Id,
          entryKey: "DEV_INHERITS_KEY",
          vals: {
            [app1Development.id]: { inheritsEnvironmentId: app1Production.id },
            [app1Staging.id]: { isUndefined: true },
            [app1Production.id]: {
              val: "prod-val",
            },
          },
        },
      },
      ownerId
    );

    await dispatch(
      {
        type: Api.ActionType.RBAC_CREATE_ENVIRONMENT_ROLE,
        payload: {
          name: "New Role",
          description: "",
          hasLocalKeys: false,
          hasServers: true,
          defaultAllApps: false,
          defaultAllBlocks: false,
          settings: { autoCommit: false },
          appRoleEnvironmentRoles: {
            [appProdRole.id]: ["read", "write"],
            [appDevRole.id]: ["read_meta"],
          },
        },
      },
      ownerId
    );

    state = getState(ownerId);
    const newEnvironmentRole = R.last(
      R.sortBy(R.prop("createdAt"), graphTypes(state.graph).environmentRoles)
    )!;

    await dispatch(
      {
        type: Api.ActionType.CREATE_ENVIRONMENT,
        payload: {
          environmentRoleId: newEnvironmentRole.id,
          envParentId: app1Id,
        },
      },
      ownerId
    );
    state = getState(ownerId);
    const app1NewRoleEnvironment = R.last(
      R.sortBy(R.prop("createdAt"), graphTypes(state.graph).environments)
    )!;

    await dispatch(
      {
        type: Api.ActionType.CREATE_ENVIRONMENT,
        payload: {
          environmentRoleId: newEnvironmentRole.id,
          envParentId: block1Id,
        },
      },
      ownerId
    );
    state = getState(ownerId);
    const block1NewRoleEnvironment = R.last(
      R.sortBy(R.prop("createdAt"), graphTypes(state.graph).environments)
    )!;

    const [block1Dev] = getEnvironments(ownerId, block1Id);

    await dispatch(
      {
        type: Api.ActionType.CREATE_ENVIRONMENT,
        payload: {
          isSub: true,
          environmentRoleId: app1Development.environmentRoleId,
          envParentId: app1Id,
          parentEnvironmentId: app1Development.id,
          subName: "dev-sub",
        },
      },
      ownerId
    );
    state = getState(ownerId);
    const app1Sub = R.last(
      R.sortBy(R.prop("createdAt"), graphTypes(state.graph).environments)
    )!;

    await dispatch(
      {
        type: Api.ActionType.CREATE_ENVIRONMENT,
        payload: {
          isSub: true,
          environmentRoleId: block1Dev.environmentRoleId,
          envParentId: block1Id,
          parentEnvironmentId: block1Dev.id,
          subName: "dev-sub",
        },
      },
      ownerId
    );
    state = getState(ownerId);
    const block1Sub = R.last(
      R.sortBy(R.prop("createdAt"), graphTypes(state.graph).environments)
    )!;

    await dispatch(
      {
        type: Api.ActionType.CREATE_ENVIRONMENT,
        payload: {
          isSub: true,
          environmentRoleId: app1NewRoleEnvironment.environmentRoleId,
          envParentId: app1Id,
          parentEnvironmentId: app1NewRoleEnvironment.id,
          subName: "dev-sub",
        },
      },
      ownerId
    );
    state = getState(ownerId);
    const app1NewRoleSub = R.last(
      R.sortBy(R.prop("createdAt"), graphTypes(state.graph).environments)
    )!;

    // await dispatch(
    //   {
    //     type: Api.ActionType.CREATE_ENVIRONMENT,
    //     payload: {
    //       isSub: true,
    //       environmentRoleId: block1NewRoleEnvironment.environmentRoleId,
    //       envParentId: block1Id,
    //       parentEnvironmentId: block1NewRoleEnvironment.id,
    //       subName: "dev-sub",
    //     },
    //   },
    //   ownerId
    // );

    await dispatch(
      {
        type: Client.ActionType.IMPORT_ENVIRONMENT,
        payload: {
          envParentId: app1Id,
          environmentId: app1NewRoleEnvironment.id,
          parsed: {
            IMPORTED_APP1_KEY1: "imported-val",
            IMPORTED_APP1_KEY2: "imported-val",
          },
        },
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.IMPORT_ENVIRONMENT,
        payload: {
          envParentId: block1Id,
          environmentId: block1NewRoleEnvironment.id,
          parsed: {
            IMPORTED_BLOCK1_KEY1: "imported-val",
            IMPORTED_BLOCK1_KEY2: "imported-val",
          },
        },
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.IMPORT_ENVIRONMENT,
        payload: {
          envParentId: app1Id,
          environmentId: app1Sub.id,
          parsed: {
            IMPORTED_APP1_SUB_KEY1: "imported-val",
            IMPORTED_APP1_SUB_KEY2: "imported-val",
          },
        },
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.IMPORT_ENVIRONMENT,
        payload: {
          envParentId: block1Id,
          environmentId: block1Sub.id,
          parsed: {
            IMPORTED_BLOCK1_KEY1: "imported-val",
            IMPORTED_BLOCK1_KEY2: "imported-val",
          },
        },
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.IMPORT_ENVIRONMENT,
        payload: {
          envParentId: app1Id,
          environmentId: app1NewRoleSub.id,
          parsed: {
            IMPORTED_APP1_SUB_KEY1: "imported-val",
            IMPORTED_APP1_SUB_KEY2: "imported-val",
          },
        },
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.COMMIT_ENVS,
        payload: {},
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.CREATE_SERVER,
        payload: {
          appId: app1Id,
          name: "Development Server",
          environmentId: app1Development.id,
        },
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.CREATE_SERVER,
        payload: {
          appId: app1Id,
          name: "Dev Sub Server",
          environmentId: app1Sub.id,
        },
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.CREATE_SERVER,
        payload: {
          appId: app1Id,
          name: "New Role Server",
          environmentId: app1NewRoleEnvironment.id,
        },
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.CREATE_SERVER,
        payload: {
          appId: app1Id,
          name: "New Role Sub Server",
          environmentId: app1NewRoleSub.id,
        },
      },
      ownerId
    );

    await connectBlocks(ownerId, [
      {
        appId: app1Id,
        blockId: block1Id,
        orderIndex: 0,
      },
      {
        appId: app1Id,
        blockId: block2Id,
        orderIndex: 1,
      },
      {
        appId: app1Id,
        blockId: block3Id,
        orderIndex: 2,
      },

      {
        appId: app2Id,
        blockId: block4Id,
        orderIndex: 0,
      },
      {
        appId: app2Id,
        blockId: block3Id,
        orderIndex: 1,
      },
      {
        appId: app2Id,
        blockId: block2Id,
        orderIndex: 2,
      },
    ]);

    await dispatch(
      {
        type: Client.ActionType.INVITE_USERS,
        payload: [
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-1${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-1${getTestId()}@simulator.amazonses.com`,
              orgRoleId: basicRole.id,
            },
            appUserGrants: [
              {
                appId: app1Id,
                appRoleId: appDevRole.id,
              },
              {
                appId: app2Id,
                appRoleId: appProdRole.id,
              },
            ],
          },
          {
            user: {
              firstName: "Invited",
              lastName: "Admin",
              email: `success+invitee-2${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-2${getTestId()}@simulator.amazonses.com`,
              orgRoleId: adminRole.id,
            },
          },
        ],
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.CREATE_CLI_USER,
        payload: {
          name: "cli-user-1",
          orgRoleId: basicRole.id,
        },
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.CREATE_CLI_USER,
        payload: {
          name: "cli-user-2",
          orgRoleId: adminRole.id,
        },
      },
      ownerId
    );

    const cwd = process.cwd();
    const exportPromise = dispatch(
      {
        type: Client.ActionType.EXPORT_ORG,
        payload: {
          filePath:
            cwd +
            `/${org.name.split(" ").join("-").toLowerCase()}-${new Date()
              .toISOString()
              .slice(0, 10)}.envkey-archive`,
        },
      },
      ownerId
    );

    state = getState(ownerId);
    expect(state.isExportingOrg).toBe(true);

    let res = await exportPromise;

    expect(res.success).toBe(true);

    state = getState(ownerId);
    expect(state.isExportingOrg).toBeUndefined();

    const { encryptionKey, filePath } = (
      res.resultAction as {
        payload: { encryptionKey: string; filePath: string };
      }
    ).payload;

    // register a new org to import into
    resetTestId(); // otherwise creating a second org causes device context issues

    const { userId: owner2Id, orgId: org2Id } = await registerWithEmail(email);

    const decryptArchivePromise = dispatch(
      {
        type: Client.ActionType.DECRYPT_ORG_ARCHIVE,
        payload: {
          encryptionKey,
          filePath,
        },
      },
      owner2Id
    );

    state = getState(owner2Id);
    expect(state.isDecryptingOrgArchive).toBeTrue();

    res = await decryptArchivePromise;

    if (!res.success) {
      log("", res.resultAction);
    }

    expect(res.success).toBe(true);

    state = getState(owner2Id);

    expect(state.isDecryptingOrgArchive).toBeUndefined();
    expect(state.unfilteredOrgArchive).toBeObject();
    expect(state.filteredOrgArchive).toBeObject();

    const importPromise = dispatch(
      {
        type: Client.ActionType.IMPORT_ORG,
        payload: {
          importOrgUsers: true,
          importCliUsers: true,
          importServers: true,
          regenServerKeys: true,
          importLocalKeys: true,
        },
      },
      owner2Id
    );

    state = getState(owner2Id);
    expect(state.isImportingOrg).toBeTrue();

    await wait(5000);

    state = getState(owner2Id);
    expect(state.importOrgStatus).toBeString();

    res = await importPromise;

    if (!res.success) {
      log("", res.resultAction);
    }

    expect(res.success).toBe(true);

    state = getState(owner2Id);
    expect(state.isImportingOrg).toBeUndefined();
    expect(state.importOrgStatus).toBeUndefined();

    let dbOrg = await getOrg(org2Id, undefined);
    expect(dbOrg?.startedOrgImportAt).toBeNumber();
    expect(dbOrg?.finishedOrgImportAt).toBeNumber();

    const byType = graphTypes(state.graph);

    expect(byType.org.settings.auth.tokenExpirationMs).toBe(1000 * 60);

    expect(byType.environmentRoles.length).toBe(4);

    expect(byType.apps.length).toBe(2);
    expect(byType.blocks.length).toBe(4);

    expect(byType.orgUsers.length).toBe(3);
    expect(state.generatedInvites.length).toBe(2);
    expect(byType.cliUsers.length).toBe(2);
    expect(state.generatedCliUsers.length).toBe(2);

    expect(byType.appBlocks.length).toBe(6);
    expect(byType.appUserGrants.length).toBe(2);

    expect(byType.environments.length).toBe(23);
    expect(byType.servers.length).toBe(4);
    expect(byType.generatedEnvkeys.length).toBe(4);

    expect(Object.keys(state.generatedEnvkeys).length).toBe(4);

    const fetchRes = await dispatch(
      {
        type: Client.ActionType.FETCH_ENVS,
        payload: {
          byEnvParentId: R.fromPairs(
            [...byType.apps, ...byType.blocks].map((envParent) => [
              envParent.id,
              { envs: true },
            ])
          ),
        },
      },
      owner2Id
    );
    state = fetchRes.state;

    for (let envParent of [...byType.apps, ...byType.blocks]) {
      const [development, staging, production] = getEnvironments(
        owner2Id,
        envParent.id
      );

      expect(
        getEnvWithMeta(state, {
          envParentId: envParent.id,
          environmentId: development.id,
        })
      ).toEqual({
        inherits: {
          ...(envParent.name == "App 1"
            ? {
                [production.id]: ["DEV_INHERITS_KEY"],
              }
            : {}),
        },
        variables: {
          KEY2: { isUndefined: true },
          KEY3: { val: "key3-val" },
          IMPORTED_KEY1: { val: "imported-val" },
          IMPORTED_KEY2: { val: "imported-val" },

          ...(envParent.name == "App 1"
            ? { DEV_INHERITS_KEY: { inheritsEnvironmentId: production.id } }
            : {}),
        },
      });

      expect(
        getEnvWithMeta(state, {
          envParentId: envParent.id,
          environmentId: staging.id,
        })
      ).toEqual({
        inherits: {},
        variables: {
          KEY2: { isEmpty: true, val: "" },
          KEY3: { val: "key3-val" },

          ...(envParent.name == "App 1"
            ? { DEV_INHERITS_KEY: { isUndefined: true } }
            : {}),
        },
      });

      expect(
        getEnvWithMeta(state, {
          envParentId: envParent.id,
          environmentId: production.id,
        })
      ).toEqual({
        inherits: {},
        variables: {
          KEY2: { val: "val3" },
          KEY3: { val: "key3-val" },

          ...(envParent.name == "App 1"
            ? {
                DEV_INHERITS_KEY: {
                  val: "prod-val",
                },
              }
            : {}),
        },
      });

      expect(
        getEnvWithMeta(state, {
          envParentId: envParent.id,
          environmentId: [envParent.id, owner2Id].join("|"),
        })
      ).toEqual({
        inherits: {},
        variables: {
          KEY2: { isUndefined: true },
          KEY3: { val: "key3-locals-val" },
          IMPORTED_KEY1: { val: "imported-val" },
          IMPORTED_KEY2: { val: "imported-val" },
        },
      });
    }

    const newRoleServer = graphTypes(state.graph).servers.find(
      R.propEq("name", "New Role Server")
    )!;

    const newRoleGeneratedEnvkey = state.generatedEnvkeys[newRoleServer.id];

    const newRoleEnv = await envkeyFetch(
      newRoleGeneratedEnvkey.envkeyIdPart,
      newRoleGeneratedEnvkey.encryptionKey
    );

    expect(newRoleEnv).toEqual({
      IMPORTED_BLOCK1_KEY1: "imported-val",
      IMPORTED_BLOCK1_KEY2: "imported-val",
      IMPORTED_APP1_KEY1: "imported-val",
      IMPORTED_APP1_KEY2: "imported-val",
    });

    const newRoleSubServer = graphTypes(state.graph).servers.find(
      R.propEq("name", "New Role Sub Server")
    )!;
    const newRoleSubGeneratedEnvkey =
      state.generatedEnvkeys[newRoleSubServer.id];
    const newRoleSubEnv = await envkeyFetch(
      newRoleSubGeneratedEnvkey.envkeyIdPart,
      newRoleSubGeneratedEnvkey.encryptionKey
    );

    expect(newRoleSubEnv).toEqual({
      IMPORTED_BLOCK1_KEY1: "imported-val",
      IMPORTED_BLOCK1_KEY2: "imported-val",
      IMPORTED_APP1_KEY1: "imported-val",
      IMPORTED_APP1_KEY2: "imported-val",
      IMPORTED_APP1_SUB_KEY1: "imported-val",
      IMPORTED_APP1_SUB_KEY2: "imported-val",
    });

    // console.log("import finished");

    // console.log("invite a new user, accept, make an update");
    const invite = await inviteAdminUser(ownerId);
    await acceptInvite(invite);
    await loadAccount(invite.user.id);

    await dispatch(
      {
        type: Client.ActionType.UPDATE_ENTRY_VAL,
        payload: {
          envParentId: app1Id,
          environmentId: app1Development.id,
          entryKey: "KEY1",
          update: { val: "val1-updated" },
        },
      },
      invite.user.id
    );
    await dispatch(
      {
        type: Client.ActionType.COMMIT_ENVS,
        payload: {},
      },
      invite.user.id
    );

    // console.log("generate a new CLI key, authenticate, make an update");
    await loadAccount(ownerId);
    const orgAdminRole = R.indexBy(R.prop("name"), orgRoles)["Org Admin"];
    await dispatch(
      {
        type: Client.ActionType.CREATE_CLI_USER,
        payload: {
          name: "cli-user",
          orgRoleId: orgAdminRole.id,
        },
      },
      ownerId
    );
    const { cliKey } = state.generatedCliUsers[0];
    await dispatch(
      {
        type: Client.ActionType.AUTHENTICATE_CLI_KEY,
        payload: { cliKey },
      },
      cliKey
    );

    await dispatch(
      {
        type: Client.ActionType.UPDATE_ENTRY_VAL,
        payload: {
          envParentId: app1Id,
          environmentId: app1Development.id,
          entryKey: "KEY1",
          update: { val: "val1-updated-by-cli-key" },
        },
      },
      cliKey
    );
    await dispatch(
      {
        type: Client.ActionType.COMMIT_ENVS,
        payload: {},
      },
      cliKey
    );

    fs.unlinkSync(filePath); // delete archive file
  });
});

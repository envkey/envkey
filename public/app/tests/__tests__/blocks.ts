import "./helpers/dotenv_helper";
import { getTestId, getState, dispatch } from "./helpers/test_helper";
import { testExport } from "./helpers/export_helper";
import { envkeyFetch } from "./helpers/fetch_helper";
import * as R from "ramda";
import { createApp } from "./helpers/apps_helper";
import { registerWithEmail, loadAccount } from "./helpers/auth_helper";
import { createBlock, connectBlocks } from "./helpers/blocks_helper";
import {
  getEnvironments,
  updateEnvs,
  updateLocals,
} from "./helpers/envs_helper";
import { getUserEncryptedKeyOrBlobComposite } from "@core/lib/blob";
import { getAuth, getEnvWithMeta } from "@core/lib/client";
import { Client, Api, Model } from "@core/types";
import { graphTypes } from "@core/lib/graph";
import { acceptInvite } from "./helpers/invites_helper";
import { getUserEncryptedKeys } from "@api_shared/blob";
import { query, getPool } from "@api_shared/db";
import { log } from "@core/lib/utils/logger";

describe("blocks", () => {
  let email: string, ownerId: string, ownerDeviceId: string, orgId: string;

  beforeEach(async () => {
    email = `success+${getTestId()}@simulator.amazonses.com`;
    ({
      userId: ownerId,
      orgId,
      deviceId: ownerDeviceId,
    } = await registerWithEmail(email));
  });

  test("create", async () => {
    await createBlock(ownerId);
  });

  test("rename", async () => {
    const { id } = await createBlock(ownerId),
      promise = dispatch(
        {
          type: Api.ActionType.RENAME_BLOCK,
          payload: {
            id,
            name: "Renamed-Block",
          },
        },
        ownerId
      );

    let state = getState(ownerId);
    expect(state.isRenaming[id]).toBeTrue();

    const res = await promise;

    expect(res.success).toBeTrue();
    state = getState(ownerId);
    expect(state.isRenaming[id]).toBeUndefined();

    expect(state.graph[id]).toEqual(
      expect.objectContaining({
        name: "Renamed-Block",
      })
    );
  });

  test("update settings", async () => {
    const { id } = await createBlock(ownerId),
      promise = dispatch(
        {
          type: Api.ActionType.UPDATE_BLOCK_SETTINGS,
          payload: {
            id,
            settings: { autoCaps: false },
          },
        },
        ownerId
      );

    let state = getState(ownerId);
    expect(state.isUpdatingSettings[id]).toBeTrue();

    const res = await promise;

    expect(res.success).toBeTrue();
    state = getState(ownerId);
    expect(state.isUpdatingSettings[id]).toBeUndefined();

    expect(state.graph[id]).toEqual(
      expect.objectContaining({
        settings: {
          autoCaps: false,
        },
      })
    );
  });

  test("delete block", async () => {
    const { id: appId } = await createApp(ownerId);
    const { id: blockId } = await createBlock(ownerId);

    await updateEnvs(ownerId, appId);
    await updateLocals(ownerId, appId);
    await updateEnvs(ownerId, blockId);
    await updateLocals(ownerId, blockId);

    await connectBlocks(ownerId, [{ appId, blockId, orderIndex: 0 }]);

    let state = getState(ownerId),
      { orgRoles } = graphTypes(state.graph);
    const basicRole = R.indexBy(R.prop("name"), orgRoles)["Basic User"];

    await dispatch(
      {
        type: Client.ActionType.INVITE_USERS,
        payload: [
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-${getTestId()}@simulator.amazonses.com`,
              orgRoleId: basicRole.id,
            },
          },
        ],
      },
      ownerId
    );

    state = getState(ownerId);
    const inviteParams = state.generatedInvites[0],
      inviteeId = inviteParams.user.id;

    const { appRoles } = graphTypes(state.graph),
      prodRole = R.indexBy(R.prop("name"), appRoles)["DevOps"],
      [appDevelopment] = getEnvironments(ownerId, appId);

    await dispatch(
      {
        type: Client.ActionType.CREATE_LOCAL_KEY,
        payload: {
          appId,
          name: "Development Key",
          environmentId: appDevelopment.id,
        },
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.CREATE_SERVER,
        payload: {
          appId,
          name: "Test Server",
          environmentId: appDevelopment.id,
        },
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.GRANT_APPS_ACCESS,
        payload: [{ appId: appId, userId: inviteeId, appRoleId: prodRole.id }],
      },
      ownerId
    );

    await acceptInvite(inviteParams);
    state = getState(inviteeId);
    const inviteeDeviceId = getAuth<Client.ClientUserAuth>(
      state,
      inviteeId
    )!.deviceId;

    await dispatch(
      {
        type: Client.ActionType.CREATE_LOCAL_KEY,
        payload: {
          appId,
          name: "Development Key",
          environmentId: appDevelopment.id,
        },
      },
      inviteeId
    );

    await loadAccount(ownerId);

    const promise = dispatch(
      {
        type: Api.ActionType.DELETE_BLOCK,
        payload: { id: blockId },
      },
      ownerId
    );

    state = getState(ownerId);
    expect(state.isRemoving[blockId]).toBeTrue();

    const res = await promise;

    expect(res.success).toBeTrue();
    state = getState(ownerId);
    const { appBlocks, generatedEnvkeys } = graphTypes(state.graph);
    expect(state.isRemoving[blockId]).toBeUndefined();

    // ensure block deleted
    expect(state.graph[blockId]).toBeUndefined();

    // ensure associations are deleted
    expect(R.flatten([appBlocks])).toEqual([]);

    // ensure encrypted keys are deleted
    // --> user encrypted keys
    for (let [userId, deviceId] of [
      [ownerId, ownerDeviceId],
      [inviteeId, inviteeDeviceId],
    ]) {
      let encryptedKeys = await getUserEncryptedKeys(
        {
          orgId,
          userId,
          deviceId,
          blobType: "env",
        },
        { transactionConnOrPool: getPool() }
      );

      encryptedKeys = encryptedKeys.filter(
        ({ envParentId }) => envParentId == blockId
      );

      expect(encryptedKeys).toEqual([]);
    }
    // --> generated envkey encrypted keys
    for (let { id: generatedEnvkeyId } of generatedEnvkeys) {
      let blobs = await query<Api.Db.GeneratedEnvkeyEncryptedKey>({
        pkey: ["envkey", generatedEnvkeyId].join("|"),
        transactionConn: undefined,
      });

      blobs = blobs.filter((blob) => "blockId" in blob && blob.blockId);

      expect(blobs).toEqual([]);
    }
  });

  test("manage app-block connections", async () => {
    const [{ id: appId }, { id: block1Id }, { id: block2Id }] = [
      await createApp(ownerId),
      await createBlock(ownerId, "Block 1"),
      await createBlock(ownerId, "Block 2"),
    ];
    let state = getState(ownerId);

    const { orgRoles, appRoles, environmentRoles } = graphTypes(state.graph),
      basicUserRole = R.indexBy(R.prop("name"), orgRoles)["Basic User"],
      appDevRole = R.indexBy(R.prop("name"), appRoles)["Developer"],
      [appDevelopment, appStaging, appProduction] = getEnvironments(
        ownerId,
        appId
      ),
      [block1Development, block1Staging, block1Production] = getEnvironments(
        ownerId,
        block1Id
      ),
      [block2Development, block2Staging, block2Production] = getEnvironments(
        ownerId,
        block2Id
      ),
      productionRole = R.indexBy(R.prop("name"), environmentRoles)[
        "Production"
      ];

    await dispatch<Client.Action.ClientActions["InviteUsers"]>(
      {
        type: Client.ActionType.INVITE_USERS,
        payload: [
          {
            user: {
              firstName: "Dev",
              lastName: "User",
              email: `success+dev-user-${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+dev-user-${getTestId()}@simulator.amazonses.com`,
              orgRoleId: basicUserRole.id,
            },
            appUserGrants: [
              {
                appId,
                appRoleId: appDevRole.id,
              },
            ],
          },
        ],
      },
      ownerId
    );
    state = getState(ownerId);
    const devUserInviteParams = state.generatedInvites[0];

    await dispatch(
      {
        type: Api.ActionType.CREATE_ENVIRONMENT,
        payload: {
          envParentId: appId,
          environmentRoleId: productionRole.id,
          isSub: true,
          parentEnvironmentId: appProduction.id,
          subName: "prod-sub",
        },
      },
      ownerId
    );

    state = getState(ownerId);
    const appProdSubEnv = R.last(
      R.sortBy(R.prop("createdAt"), graphTypes(state.graph).environments)
    ) as Model.Environment;

    await dispatch(
      {
        type: Api.ActionType.CREATE_ENVIRONMENT,
        payload: {
          envParentId: block1Id,
          environmentRoleId: productionRole.id,
          isSub: true,
          parentEnvironmentId: block1Production.id,
          subName: "prod-sub",
        },
      },
      ownerId
    );

    state = getState(ownerId);
    const block1ProdSubEnv = R.last(
      R.sortBy(R.prop("createdAt"), graphTypes(state.graph).environments)
    ) as Model.Environment;

    await dispatch(
      {
        type: Api.ActionType.CREATE_ENVIRONMENT,
        payload: {
          envParentId: block2Id,
          environmentRoleId: productionRole.id,
          isSub: true,
          parentEnvironmentId: block2Production.id,
          subName: "prod-sub",
        },
      },
      ownerId
    );

    state = getState(ownerId);
    const block2ProdSubEnv = R.last(
      R.sortBy(R.prop("createdAt"), graphTypes(state.graph).environments)
    ) as Model.Environment;

    await dispatch(
      {
        type: Client.ActionType.CREATE_LOCAL_KEY,
        payload: {
          appId,
          name: "Development Key",
          environmentId: appDevelopment.id,
        },
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.CREATE_SERVER,
        payload: {
          appId,
          name: "Test Server",
          environmentId: appDevelopment.id,
        },
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.CREATE_SERVER,
        payload: {
          appId,
          name: "Staging Server",
          environmentId: appStaging.id,
        },
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.CREATE_SERVER,
        payload: {
          appId,
          name: "Production Server",
          environmentId: appProduction.id,
        },
      },
      ownerId
    );

    state = getState(ownerId);

    await dispatch(
      {
        type: Client.ActionType.CREATE_SERVER,
        payload: {
          appId,
          name: "Prod SubEnv Server",
          environmentId: appProdSubEnv.id,
        },
      },
      ownerId
    );

    state = getState(ownerId);

    const [
      { envkeyIdPart: localEnvkeyIdPart, encryptionKey: localEncryptionKey },
      {
        envkeyIdPart: developmentEnvkeyIdPart,
        encryptionKey: developmentEncryptionKey,
      },
      {
        envkeyIdPart: stagingEnvkeyIdPart,
        encryptionKey: stagingEncryptionKey,
      },
      {
        envkeyIdPart: productionEnvkeyIdPart,
        encryptionKey: productionEncryptionKey,
      },
      {
        envkeyIdPart: prodSubEnvkeyIdPart,
        encryptionKey: prodSubEncryptionKey,
      },
    ] = Object.values(state.generatedEnvkeys);

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY_ROW,
        payload: {
          envParentId: block1Id,
          entryKey: "BLOCK_1_KEY",
          vals: {
            [block1Development.id]: { val: "block-1-val" },
            [block1Staging.id]: { val: "block-1-val" },
            [block1Production.id]: { val: "block-1-val" },
          },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY_ROW,
        payload: {
          envParentId: block1Id,
          entryKey: "BLOCK_WILL_OVERRIDE",
          vals: {
            [block1Development.id]: { val: "block-1-val" },
            [block1Staging.id]: { val: "block-1-val" },
            [block1Production.id]: { val: "block-1-val" },
          },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY_ROW,
        payload: {
          envParentId: block1Id,
          entryKey: "APP_WILL_OVERRIDE",
          vals: {
            [block1Development.id]: { val: "block-1-val" },
            [block1Staging.id]: { val: "block-1-val" },
            [block1Production.id]: { val: "block-1-val" },
          },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY_ROW,
        payload: {
          envParentId: block1Id,
          entryKey: "BLOCK_SUB_WILL_OVERRIDE",
          vals: {
            [block1Production.id]: { val: "block-1-val" },
          },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY_ROW,
        payload: {
          envParentId: block1Id,
          entryKey: "BLOCK_INHERITANCE",
          vals: {
            [block1Development.id]: { inheritsEnvironmentId: block1Staging.id },
            [block1Staging.id]: { inheritsEnvironmentId: block1Production.id },
            [block1Production.id]: { val: "block-1-val" },
          },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY_ROW,
        payload: {
          envParentId: block2Id,
          entryKey: "BLOCK_2_KEY",
          vals: {
            [block2Development.id]: { val: "block-2-val" },
            [block2Staging.id]: { val: "block-2-val" },
            [block2Production.id]: { val: "block-2-val" },
          },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY_ROW,
        payload: {
          envParentId: block2Id,
          entryKey: "BLOCK_WILL_OVERRIDE",
          vals: {
            [block2Development.id]: { val: "block-2-val" },
            [block2Staging.id]: { val: "block-2-val" },
            [block2Production.id]: { val: "block-2-val" },
          },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY_ROW,
        payload: {
          envParentId: appId,
          entryKey: "APP_KEY",
          vals: {
            [appDevelopment.id]: { val: "app-val" },
            [appStaging.id]: { val: "app-val" },
            [appProduction.id]: { val: "app-val" },
          },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY_ROW,
        payload: {
          envParentId: appId,
          entryKey: "APP_WILL_OVERRIDE",
          vals: {
            [appDevelopment.id]: { val: "app-val" },
            [appStaging.id]: { val: "app-val" },
            [appProduction.id]: { val: "app-val" },
          },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: block1Id,
          environmentId: block1ProdSubEnv.id,
          entryKey: "BLOCK_1_SUB",
          val: { val: "block-1-sub-val" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: block1Id,
          environmentId: block1ProdSubEnv.id,
          entryKey: "BLOCK_SUB_WILL_OVERRIDE",
          val: { val: "block-1-sub-val" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: block1Id,
          environmentId: block1ProdSubEnv.id,
          entryKey: "APP_SUB_WILL_OVERRIDE",
          val: { val: "block-1-sub-val" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: block2Id,
          environmentId: block2ProdSubEnv.id,
          entryKey: "BLOCK_2_SUB",
          val: { val: "block-2-sub-val" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: block2Id,
          environmentId: block2Staging.id,
          entryKey: "BLOCK_2_SUB_INHERITANCE",
          val: { val: "block-2-val" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: block2Id,
          environmentId: block2ProdSubEnv.id,
          entryKey: "BLOCK_2_SUB_INHERITANCE",
          val: { inheritsEnvironmentId: block2Staging.id },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: block2Id,
          environmentId: block2ProdSubEnv.id,
          entryKey: "BLOCK_SUB_WILL_OVERRIDE",
          val: { val: "block-2-sub-val" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: appId,
          environmentId: appProdSubEnv.id,
          entryKey: "APP_SUB",
          val: { val: "app-sub-val" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: appId,
          environmentId: appProdSubEnv.id,
          entryKey: "APP_SUB_WILL_OVERRIDE",
          val: { val: "app-sub-val" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: block1Id,
          environmentId: [block1Id, ownerId].join("|"),
          entryKey: "BLOCK_1_LOCALS",
          val: { val: "block-1-locals" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: block1Id,
          environmentId: [block1Id, ownerId].join("|"),
          entryKey: "BLOCK_LOCALS_WILL_OVERRIDE",
          val: { val: "block-1-locals" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: block2Id,
          environmentId: [block2Id, ownerId].join("|"),
          entryKey: "BLOCK_2_LOCALS",
          val: { val: "block-2-locals" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: block2Id,
          environmentId: [block2Id, ownerId].join("|"),
          entryKey: "BLOCK_LOCALS_WILL_OVERRIDE",
          val: { val: "block-2-locals" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: block2Id,
          environmentId: [block2Id, ownerId].join("|"),
          entryKey: "APP_LOCALS_WILL_OVERRIDE",
          val: { val: "block-2-locals" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: appId,
          environmentId: [appId, ownerId].join("|"),
          entryKey: "APP_LOCALS",
          val: { val: "app-locals" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: appId,
          environmentId: [appId, ownerId].join("|"),
          entryKey: "APP_LOCALS_WILL_OVERRIDE",
          val: { val: "app-locals" },
        },
      },
      ownerId
    );

    state = getState(ownerId);

    await dispatch(
      {
        type: Client.ActionType.COMMIT_ENVS,
        payload: { message: "commit message" },
      },
      ownerId
    );

    await connectBlocks(ownerId, [
      {
        appId,
        blockId: block1Id,
        orderIndex: 0,
      },
      {
        appId,
        blockId: block2Id,
        orderIndex: 1,
      },
    ]);

    let [
      localKeyEnv,
      devServerEnv,
      stagingServerEnv,
      prodServerEnv,
      prodSubEnv,
    ] = await Promise.all([
      envkeyFetch(localEnvkeyIdPart, localEncryptionKey),
      envkeyFetch(developmentEnvkeyIdPart, developmentEncryptionKey),
      envkeyFetch(stagingEnvkeyIdPart, stagingEncryptionKey),
      envkeyFetch(productionEnvkeyIdPart, productionEncryptionKey),
      envkeyFetch(prodSubEnvkeyIdPart, prodSubEncryptionKey),
    ]);

    let shouldEq: Client.Env.RawEnv = {
      BLOCK_1_KEY: "block-1-val",
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val",
      BLOCK_1_LOCALS: "block-1-locals",
      BLOCK_2_LOCALS: "block-2-locals",
      BLOCK_LOCALS_WILL_OVERRIDE: "block-2-locals",
      APP_LOCALS_WILL_OVERRIDE: "app-locals",
      APP_LOCALS: "app-locals",
    };
    expect(localKeyEnv).toEqual(shouldEq);
    await testExport(
      ownerId,
      {
        envParentId: appId,
        environmentId: [appId, ownerId].join("|"),
        includeAncestors: true,
      },
      shouldEq
    );

    shouldEq = {
      BLOCK_1_KEY: "block-1-val",
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val",
    };
    expect(devServerEnv).toEqual(shouldEq);
    await testExport(
      ownerId,
      {
        envParentId: appId,
        environmentId: appDevelopment.id,
        includeAncestors: true,
      },
      shouldEq
    );

    expect(stagingServerEnv).toEqual({
      BLOCK_1_KEY: "block-1-val",
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val",
      BLOCK_2_SUB_INHERITANCE: "block-2-val",
    });

    expect(prodServerEnv).toEqual({
      BLOCK_1_KEY: "block-1-val",
      BLOCK_WILL_OVERRIDE: "block-2-val",
      BLOCK_SUB_WILL_OVERRIDE: "block-1-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val",
    });

    shouldEq = {
      BLOCK_1_KEY: "block-1-val",
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val",
      BLOCK_1_SUB: "block-1-sub-val",
      BLOCK_SUB_WILL_OVERRIDE: "block-2-sub-val",
      APP_SUB_WILL_OVERRIDE: "app-sub-val",
      BLOCK_2_SUB: "block-2-sub-val",
      BLOCK_2_SUB_INHERITANCE: "block-2-val",
      APP_SUB: "app-sub-val",
    };
    expect(prodSubEnv).toEqual(shouldEq);
    await testExport(
      ownerId,
      {
        envParentId: appId,
        environmentId: appProdSubEnv.id,
        includeAncestors: true,
      },
      shouldEq
    );

    // console.log(
    //   "accept invite and fetch with invitee and ensure proper block access"
    // );
    await acceptInvite(devUserInviteParams);

    await dispatch(
      {
        type: Client.ActionType.REFRESH_SESSION,
      },
      devUserInviteParams.user.id
    );

    await dispatch(
      {
        type: Client.ActionType.FETCH_ENVS,
        payload: {
          byEnvParentId: {
            [appId]: { envs: true, changesets: true },
          },
        },
      },
      devUserInviteParams.user.id
    );

    state = getState(devUserInviteParams.user.id);

    expect(
      getEnvWithMeta(state, {
        envParentId: appId,
        environmentId: appDevelopment.id,
      })
    ).toEqual({
      inherits: {},
      variables: {
        APP_WILL_OVERRIDE: {
          val: "app-val",
        },
        APP_KEY: {
          val: "app-val",
        },
      },
    });

    expect(
      getEnvWithMeta(state, {
        envParentId: appId,
        environmentId: appStaging.id,
      })
    ).toEqual({
      inherits: {},
      variables: {
        APP_WILL_OVERRIDE: {
          val: "app-val",
        },
        APP_KEY: {
          val: "app-val",
        },
      },
    });

    expect(
      getEnvWithMeta(state, {
        envParentId: appId,
        environmentId: appProduction.id,
      })
    ).toEqual({
      inherits: {},
      variables: {
        APP_WILL_OVERRIDE: {},
        APP_KEY: {},
      },
    });

    expect(
      getEnvWithMeta(state, {
        envParentId: appId,
        environmentId: appProdSubEnv.id,
      })
    ).toEqual({
      inherits: {},
      variables: {
        APP_SUB_WILL_OVERRIDE: {},
        APP_SUB: {},
      },
    });

    expect(
      getEnvWithMeta(state, {
        envParentId: block1Id,
        environmentId: block1Development.id,
      })
    ).toEqual({
      inherits: {
        [block1Staging.id]: ["BLOCK_INHERITANCE"],
      },
      variables: {
        BLOCK_1_KEY: {
          val: "block-1-val",
        },
        BLOCK_WILL_OVERRIDE: {
          val: "block-1-val",
        },
        APP_WILL_OVERRIDE: {
          val: "block-1-val",
        },
        BLOCK_INHERITANCE: {
          inheritsEnvironmentId: block1Staging.id,
        },
      },
    });

    expect(
      getEnvWithMeta(state, {
        envParentId: block1Id,
        environmentId: block1Staging.id,
      })
    ).toEqual({
      inherits: {
        [block1Production.id]: ["BLOCK_INHERITANCE"],
      },
      variables: {
        BLOCK_1_KEY: {
          val: "block-1-val",
        },
        BLOCK_WILL_OVERRIDE: {
          val: "block-1-val",
        },
        APP_WILL_OVERRIDE: {
          val: "block-1-val",
        },
        BLOCK_INHERITANCE: {
          inheritsEnvironmentId: block1Production.id,
        },
      },
    });

    expect(
      getEnvWithMeta(state, {
        envParentId: block1Id,
        environmentId: block1Production.id,
      })
    ).toEqual({
      inherits: {},
      variables: {
        BLOCK_1_KEY: {},
        BLOCK_WILL_OVERRIDE: {},
        APP_WILL_OVERRIDE: {},
        BLOCK_INHERITANCE: {},
        BLOCK_SUB_WILL_OVERRIDE: {},
      },
    });

    expect(
      getEnvWithMeta(state, {
        envParentId: block1Id,
        environmentId: block1ProdSubEnv.id,
      })
    ).toEqual({
      inherits: {},
      variables: {
        BLOCK_1_SUB: {},
        BLOCK_SUB_WILL_OVERRIDE: {},
        APP_SUB_WILL_OVERRIDE: {},
      },
    });

    expect(
      getEnvWithMeta(state, {
        envParentId: block2Id,
        environmentId: block2Development.id,
      })
    ).toEqual({
      inherits: {},
      variables: {
        BLOCK_2_KEY: {
          val: "block-2-val",
        },
        BLOCK_WILL_OVERRIDE: {
          val: "block-2-val",
        },
      },
    });

    expect(
      getEnvWithMeta(state, {
        envParentId: block2Id,
        environmentId: block2Staging.id,
      })
    ).toEqual({
      inherits: {},
      variables: {
        BLOCK_2_KEY: {
          val: "block-2-val",
        },
        BLOCK_WILL_OVERRIDE: {
          val: "block-2-val",
        },
        BLOCK_2_SUB_INHERITANCE: {
          val: "block-2-val",
        },
      },
    });

    expect(
      getEnvWithMeta(state, {
        envParentId: block2Id,
        environmentId: block2Production.id,
      })
    ).toEqual({
      inherits: {},
      variables: {
        BLOCK_2_KEY: {},
        BLOCK_WILL_OVERRIDE: {},
      },
    });

    expect(
      getEnvWithMeta(state, {
        envParentId: block2Id,
        environmentId: block2ProdSubEnv.id,
      })
    ).toEqual({
      inherits: {
        [block2Staging.id]: ["BLOCK_2_SUB_INHERITANCE"],
      },
      variables: {
        BLOCK_2_SUB: {},
        BLOCK_SUB_WILL_OVERRIDE: {},
        BLOCK_2_SUB_INHERITANCE: { inheritsEnvironmentId: block2Staging.id },
      },
    });

    expect(
      state.envs[
        getUserEncryptedKeyOrBlobComposite({
          environmentId: [appId, ownerId].join("|"),
        })
      ]
    ).toBeUndefined();
    expect(
      state.envs[
        getUserEncryptedKeyOrBlobComposite({
          environmentId: [block1Id, ownerId].join("|"),
        })
      ]
    ).toBeUndefined();
    expect(
      state.envs[
        getUserEncryptedKeyOrBlobComposite({
          environmentId: [block2Id, ownerId].join("|"),
        })
      ]
    ).toBeUndefined();

    // console.log("ensure key generation works with connected blocks");
    await dispatch(
      {
        type: Client.ActionType.CREATE_LOCAL_KEY,
        payload: {
          appId,
          name: "Development Key",
          environmentId: appDevelopment.id,
        },
      },
      devUserInviteParams.user.id
    );

    state = getState(devUserInviteParams.user.id);

    const [
      {
        envkeyIdPart: inviteeLocalEnvkeyIdPart,
        encryptionKey: inviteeLocalEncryptionKey,
      },
    ] = Object.values(state.generatedEnvkeys);

    let inviteeLocalKeyEnv = await envkeyFetch(
      inviteeLocalEnvkeyIdPart,
      inviteeLocalEncryptionKey
    );

    expect(inviteeLocalKeyEnv).toEqual({
      BLOCK_1_KEY: "block-1-val",
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val",
    });

    // console.log("ensure updating block/app envs still works correctly");
    dispatch(
      {
        type: Client.ActionType.UPDATE_ENTRY_VAL,
        payload: {
          envParentId: block1Id,
          entryKey: "BLOCK_1_KEY",
          environmentId: block1Development.id,
          update: { val: "block-1-val-updated" },
        },
      },
      devUserInviteParams.user.id
    );

    dispatch(
      {
        type: Client.ActionType.UPDATE_ENTRY_VAL,
        payload: {
          envParentId: block1Id,
          entryKey: "BLOCK_INHERITANCE",
          environmentId: block1Staging.id,
          update: { val: "block-1-val-updated" },
        },
      },
      devUserInviteParams.user.id
    );

    dispatch(
      {
        type: Client.ActionType.UPDATE_ENTRY_VAL,
        payload: {
          envParentId: block2Id,
          entryKey: "BLOCK_2_SUB_INHERITANCE",
          environmentId: block2Staging.id,
          update: { val: "block-2-val-updated" },
        },
      },
      devUserInviteParams.user.id
    );

    dispatch(
      {
        type: Client.ActionType.UPDATE_ENTRY_VAL,
        payload: {
          envParentId: appId,
          entryKey: "APP_KEY",
          environmentId: appDevelopment.id,
          update: { val: "app-val-updated" },
        },
      },
      devUserInviteParams.user.id
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: block1Id,
          environmentId: [block1Id, devUserInviteParams.user.id].join("|"),
          entryKey: "BLOCK_1_LOCALS",
          val: { val: "block-1-locals" },
        },
      },
      devUserInviteParams.user.id
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId: appId,
          environmentId: [appId, devUserInviteParams.user.id].join("|"),
          entryKey: "APP_LOCALS",
          val: { val: "app-locals" },
        },
      },
      devUserInviteParams.user.id
    );

    await dispatch(
      {
        type: Client.ActionType.COMMIT_ENVS,
        payload: { message: "commit message" },
      },
      devUserInviteParams.user.id
    );

    [
      inviteeLocalKeyEnv,
      localKeyEnv,
      devServerEnv,
      stagingServerEnv,
      prodSubEnv,
    ] = await Promise.all([
      envkeyFetch(inviteeLocalEnvkeyIdPart, inviteeLocalEncryptionKey),
      envkeyFetch(localEnvkeyIdPart, localEncryptionKey),
      envkeyFetch(developmentEnvkeyIdPart, developmentEncryptionKey),
      envkeyFetch(stagingEnvkeyIdPart, stagingEncryptionKey),
      envkeyFetch(prodSubEnvkeyIdPart, prodSubEncryptionKey),
    ]);

    expect(inviteeLocalKeyEnv).toEqual({
      BLOCK_1_KEY: "block-1-val-updated",
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val-updated",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val-updated",
      BLOCK_1_LOCALS: "block-1-locals",
      APP_LOCALS: "app-locals",
    });

    expect(localKeyEnv).toEqual({
      BLOCK_1_KEY: "block-1-val-updated",
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val-updated",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val-updated",
      BLOCK_1_LOCALS: "block-1-locals",
      BLOCK_2_LOCALS: "block-2-locals",
      BLOCK_LOCALS_WILL_OVERRIDE: "block-2-locals",
      APP_LOCALS_WILL_OVERRIDE: "app-locals",
      APP_LOCALS: "app-locals",
    });

    expect(devServerEnv).toEqual({
      BLOCK_1_KEY: "block-1-val-updated",
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val-updated",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val-updated",
    });
    expect(stagingServerEnv).toEqual({
      BLOCK_1_KEY: "block-1-val",
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val-updated",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val",
      BLOCK_2_SUB_INHERITANCE: "block-2-val-updated",
    });

    expect(prodSubEnv).toEqual({
      BLOCK_1_KEY: "block-1-val",
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val",
      BLOCK_1_SUB: "block-1-sub-val",
      BLOCK_SUB_WILL_OVERRIDE: "block-2-sub-val",
      APP_SUB_WILL_OVERRIDE: "app-sub-val",
      BLOCK_2_SUB: "block-2-sub-val",
      BLOCK_2_SUB_INHERITANCE: "block-2-val-updated",
      APP_SUB: "app-sub-val",
    });

    // console.log("ensure updating locals and subenv still working correctly");
    await loadAccount(ownerId);

    // console.log("locals");
    dispatch(
      {
        type: Client.ActionType.UPDATE_ENTRY_VAL,
        payload: {
          envParentId: block1Id,
          environmentId: [block1Id, ownerId].join("|"),
          entryKey: "BLOCK_1_LOCALS",
          update: { val: "block-1-locals-updated" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.UPDATE_ENTRY_VAL,
        payload: {
          envParentId: appId,
          environmentId: [appId, ownerId].join("|"),
          entryKey: "APP_LOCALS",
          update: { val: "app-locals-updated" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.UPDATE_ENTRY_VAL,
        payload: {
          envParentId: block1Id,
          environmentId: [block1Id, devUserInviteParams.user.id].join("|"),
          entryKey: "BLOCK_1_LOCALS",
          update: { val: "block-1-locals-updated" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.UPDATE_ENTRY_VAL,
        payload: {
          envParentId: appId,
          environmentId: [appId, devUserInviteParams.user.id].join("|"),
          entryKey: "APP_LOCALS",
          update: { val: "app-locals-updated" },
        },
      },
      ownerId
    );

    // console.log("subenv");
    dispatch(
      {
        type: Client.ActionType.UPDATE_ENTRY_VAL,
        payload: {
          envParentId: block2Id,
          environmentId: block2ProdSubEnv.id,
          entryKey: "BLOCK_2_SUB",
          update: { val: "block-2-sub-val-updated" },
        },
      },
      ownerId
    );

    dispatch(
      {
        type: Client.ActionType.UPDATE_ENTRY_VAL,
        payload: {
          envParentId: appId,
          environmentId: appProdSubEnv.id,
          entryKey: "APP_SUB",
          update: { val: "app-sub-val-updated" },
        },
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.COMMIT_ENVS,
        payload: { message: "commit message" },
      },
      ownerId
    );

    [inviteeLocalKeyEnv, localKeyEnv, prodSubEnv] = await Promise.all([
      envkeyFetch(inviteeLocalEnvkeyIdPart, inviteeLocalEncryptionKey),
      envkeyFetch(localEnvkeyIdPart, localEncryptionKey),
      envkeyFetch(prodSubEnvkeyIdPart, prodSubEncryptionKey),
    ]);

    expect(inviteeLocalKeyEnv).toEqual({
      BLOCK_1_KEY: "block-1-val-updated",
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val-updated",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val-updated",
      BLOCK_1_LOCALS: "block-1-locals-updated",
      APP_LOCALS: "app-locals-updated",
    });

    expect(localKeyEnv).toEqual({
      BLOCK_1_KEY: "block-1-val-updated",
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val-updated",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val-updated",
      BLOCK_1_LOCALS: "block-1-locals-updated",
      BLOCK_2_LOCALS: "block-2-locals",
      BLOCK_LOCALS_WILL_OVERRIDE: "block-2-locals",
      APP_LOCALS_WILL_OVERRIDE: "app-locals",
      APP_LOCALS: "app-locals-updated",
    });

    expect(prodSubEnv).toEqual({
      BLOCK_1_KEY: "block-1-val",
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val",
      BLOCK_1_SUB: "block-1-sub-val",
      BLOCK_SUB_WILL_OVERRIDE: "block-2-sub-val",
      APP_SUB_WILL_OVERRIDE: "app-sub-val",
      BLOCK_2_SUB: "block-2-sub-val-updated",
      BLOCK_2_SUB_INHERITANCE: "block-2-val-updated",
      APP_SUB: "app-sub-val-updated",
    });

    // console.log("test reordering blocks");
    const reorderPromise = dispatch(
      {
        type: Api.ActionType.REORDER_BLOCKS,
        payload: {
          appId,
          order: {
            [block2Id]: 0,
            [block1Id]: 1,
          },
        },
      },
      ownerId
    );

    state = getState(ownerId);

    expect(state.isReorderingAssociations[appId].appBlock).toBeTrue();

    const reorderRes = await reorderPromise;
    expect(reorderRes.success).toBeTrue();

    state = getState(ownerId);
    expect(state.isReorderingAssociations).toEqual({});

    [
      inviteeLocalKeyEnv,
      localKeyEnv,
      devServerEnv,
      stagingServerEnv,
      prodSubEnv,
    ] = await Promise.all([
      envkeyFetch(inviteeLocalEnvkeyIdPart, inviteeLocalEncryptionKey),
      envkeyFetch(localEnvkeyIdPart, localEncryptionKey),
      envkeyFetch(developmentEnvkeyIdPart, developmentEncryptionKey),
      envkeyFetch(stagingEnvkeyIdPart, stagingEncryptionKey),
      envkeyFetch(prodSubEnvkeyIdPart, prodSubEncryptionKey),
    ]);

    expect(inviteeLocalKeyEnv).toEqual({
      BLOCK_1_KEY: "block-1-val-updated",
      BLOCK_WILL_OVERRIDE: "block-1-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val-updated",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val-updated",
      BLOCK_1_LOCALS: "block-1-locals-updated",
      APP_LOCALS: "app-locals-updated",
    });

    expect(localKeyEnv).toEqual({
      BLOCK_1_KEY: "block-1-val-updated",
      BLOCK_WILL_OVERRIDE: "block-1-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val-updated",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val-updated",
      BLOCK_1_LOCALS: "block-1-locals-updated",
      BLOCK_2_LOCALS: "block-2-locals",
      BLOCK_LOCALS_WILL_OVERRIDE: "block-1-locals",
      APP_LOCALS_WILL_OVERRIDE: "app-locals",
      APP_LOCALS: "app-locals-updated",
    });

    shouldEq = {
      BLOCK_1_KEY: "block-1-val-updated",
      BLOCK_WILL_OVERRIDE: "block-1-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val-updated",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val-updated",
    };
    expect(devServerEnv).toEqual(shouldEq);
    await testExport(
      ownerId,
      {
        envParentId: appId,
        environmentId: appDevelopment.id,
        includeAncestors: true,
      },
      shouldEq
    );

    shouldEq = {
      BLOCK_1_KEY: "block-1-val",
      BLOCK_WILL_OVERRIDE: "block-1-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val-updated",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val",
      BLOCK_2_SUB_INHERITANCE: "block-2-val-updated",
    };
    expect(stagingServerEnv).toEqual(shouldEq);
    await testExport(
      ownerId,
      {
        envParentId: appId,
        environmentId: appStaging.id,
        includeAncestors: true,
      },
      shouldEq
    );

    expect(prodSubEnv).toEqual({
      BLOCK_1_KEY: "block-1-val",
      BLOCK_WILL_OVERRIDE: "block-1-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_INHERITANCE: "block-1-val",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val",
      BLOCK_1_SUB: "block-1-sub-val",
      BLOCK_SUB_WILL_OVERRIDE: "block-1-sub-val",
      APP_SUB_WILL_OVERRIDE: "app-sub-val",
      BLOCK_2_SUB: "block-2-sub-val-updated",
      BLOCK_2_SUB_INHERITANCE: "block-2-val-updated",
      APP_SUB: "app-sub-val-updated",
    });

    // console.log("test disconnecting block");
    let { appBlocks } = graphTypes(state.graph),
      { id: appBlockId } = appBlocks.filter(
        (appBlock) => appBlock.appId == appId && appBlock.blockId == block1Id
      )[0],
      disconnectPromise = dispatch(
        {
          type: Api.ActionType.DISCONNECT_BLOCK,
          payload: {
            id: appBlockId,
          },
        },
        ownerId
      );

    state = getState(ownerId);
    expect(state.isRemoving[appBlockId]).toBeTrue();

    let disconnectRes = await disconnectPromise;
    expect(disconnectRes.success).toBeTrue();

    state = getState(ownerId);
    expect(state.isRemoving[appBlockId]).toBeUndefined();

    // console.log(
    //   "re-connect and then re-disconnect to ensure primary key truncation/duplication issue is fixed"
    // );
    await connectBlocks(ownerId, [
      {
        appId,
        blockId: block1Id,
        orderIndex: 0,
      },
    ]);

    state = getState(ownerId);
    ({ appBlocks } = graphTypes(state.graph));
    ({ id: appBlockId } = appBlocks.filter(
      (appBlock) => appBlock.appId == appId && appBlock.blockId == block1Id
    )[0]);
    disconnectRes = await dispatch(
      {
        type: Api.ActionType.DISCONNECT_BLOCK,
        payload: {
          id: appBlockId,
        },
      },
      ownerId
    );

    expect(disconnectRes.success).toBeTrue();

    [
      inviteeLocalKeyEnv,
      localKeyEnv,
      devServerEnv,
      stagingServerEnv,
      prodSubEnv,
    ] = await Promise.all([
      envkeyFetch(inviteeLocalEnvkeyIdPart, inviteeLocalEncryptionKey),
      envkeyFetch(localEnvkeyIdPart, localEncryptionKey),
      envkeyFetch(developmentEnvkeyIdPart, developmentEncryptionKey),
      envkeyFetch(stagingEnvkeyIdPart, stagingEncryptionKey),
      envkeyFetch(prodSubEnvkeyIdPart, prodSubEncryptionKey),
    ]);

    expect(inviteeLocalKeyEnv).toEqual({
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val-updated",
      APP_LOCALS: "app-locals-updated",
    });

    expect(localKeyEnv).toEqual({
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val-updated",
      BLOCK_2_LOCALS: "block-2-locals",
      BLOCK_LOCALS_WILL_OVERRIDE: "block-2-locals",
      APP_LOCALS_WILL_OVERRIDE: "app-locals",
      APP_LOCALS: "app-locals-updated",
    });

    shouldEq = {
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val-updated",
    };
    expect(devServerEnv).toEqual(shouldEq);
    await testExport(
      ownerId,
      {
        envParentId: appId,
        environmentId: appDevelopment.id,
        includeAncestors: true,
      },
      shouldEq
    );

    shouldEq = {
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val",
      BLOCK_2_SUB_INHERITANCE: "block-2-val-updated",
    };
    expect(stagingServerEnv).toEqual(shouldEq);
    await testExport(
      ownerId,
      {
        envParentId: appId,
        environmentId: appStaging.id,
        includeAncestors: true,
      },
      shouldEq
    );

    expect(prodSubEnv).toEqual({
      BLOCK_WILL_OVERRIDE: "block-2-val",
      APP_WILL_OVERRIDE: "app-val",
      BLOCK_2_KEY: "block-2-val",
      APP_KEY: "app-val",
      BLOCK_SUB_WILL_OVERRIDE: "block-2-sub-val",
      APP_SUB_WILL_OVERRIDE: "app-sub-val",
      BLOCK_2_SUB: "block-2-sub-val-updated",
      BLOCK_2_SUB_INHERITANCE: "block-2-val-updated",
      APP_SUB: "app-sub-val-updated",
    });
  });

  // test("basic user set own block locals", async () => {
  //   const [{ id: appId }, { id: blockId }] = [
  //     await createApp(ownerId),
  //     await createBlock(ownerId),
  //   ];

  //   let state = getState(ownerId);

  //   const { orgRoles, appRoles } = graphTypes(state.graph);
  //   const basicUserRole = R.indexBy(R.prop("name"), orgRoles)["Basic User"];
  //   const appDevRole = R.indexBy(R.prop("name"), appRoles)["Developer"];

  //   await dispatch<Client.Action.ClientActions["InviteUsers"]>(
  //     {
  //       type: Client.ActionType.INVITE_USERS,
  //       payload: [
  //         {
  //           user: {
  //             firstName: "Dev",
  //             lastName: "User",
  //             email: `success+dev-user-${getTestId()}@simulator.amazonses.com`,
  //             provider: <const>"email",
  //             uid: `success+dev-user-${getTestId()}@simulator.amazonses.com`,
  //             orgRoleId: basicUserRole.id,
  //           },
  //           appUserGrants: [
  //             {
  //               appId,
  //               appRoleId: appDevRole.id,
  //             },
  //           ],
  //         },
  //       ],
  //     },
  //     ownerId
  //   );
  //   state = getState(ownerId);
  //   const devUserInviteParams = state.generatedInvites[0];

  //   await connectBlocks(ownerId, [
  //     {
  //       appId,
  //       blockId,
  //       orderIndex: 0,
  //     },
  //   ]);

  //   await acceptInvite(devUserInviteParams);

  //   await dispatch(
  //     {
  //       type: Client.ActionType.REFRESH_SESSION,
  //     },
  //     devUserInviteParams.user.id
  //   );

  //   dispatch(
  //     {
  //       type: Client.ActionType.CREATE_ENTRY,
  //       payload: {
  //         envParentId: blockId,
  //         environmentId: [blockId, devUserInviteParams.user.id].join("|"),
  //         entryKey: "BLOCK_1_LOCALS",
  //         val: { val: "block-1-locals" },
  //       },
  //     },
  //     devUserInviteParams.user.id
  //   );

  //   const res = await dispatch(
  //     {
  //       type: Client.ActionType.COMMIT_ENVS,
  //       payload: { message: "commit message" },
  //     },
  //     devUserInviteParams.user.id
  //   );

  //   expect(res.success).toBeTrue();
  // });
});

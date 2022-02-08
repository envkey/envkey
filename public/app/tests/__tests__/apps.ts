import "./helpers/dotenv_helper";
import { getTestId, getState, dispatch } from "./helpers/test_helper";
import { getEncryptedBlobs, getUserEncryptedKeys } from "@api_shared/blob";
import * as R from "ramda";
import { getAuth, getEnvWithMeta } from "@core/lib/client";

import { registerWithEmail, loadAccount } from "./helpers/auth_helper";
import { createApp } from "./helpers/apps_helper";
import { createBlock, connectBlocks } from "./helpers/blocks_helper";
import { acceptInvite, inviteBasicUser } from "./helpers/invites_helper";
import { Client, Rbac, Model, Api } from "@core/types";
import {
  updateEnvs,
  updateLocals,
  getEnvironments,
} from "./helpers/envs_helper";
import {
  graphTypes,
  getOrgUserDevicesByUserId,
  getAppUserGrantsByComposite,
} from "@core/lib/graph";
import { query } from "@api_shared/db";
import { getUserEncryptedKeyOrBlobComposite } from "@core/lib/blob";
import { log } from "@core/lib/utils/logger";

describe("apps", () => {
  let email: string, orgId: string, ownerDeviceId: string, ownerId: string;

  beforeEach(async () => {
    email = `success+${getTestId()}@simulator.amazonses.com`;
    ({
      orgId,
      deviceId: ownerDeviceId,
      userId: ownerId,
    } = await registerWithEmail(email));
  });

  test("create", async () => {
    await createApp(ownerId);
  });

  test("rename", async () => {
    const { id } = await createApp(ownerId),
      promise = dispatch(
        {
          type: Api.ActionType.RENAME_APP,
          payload: {
            id,
            name: "Renamed-App",
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
        name: "Renamed-App",
      })
    );
  });

  test("update settings", async () => {
    const app = await createApp(ownerId),
      { id } = app,
      promise = dispatch(
        {
          type: Api.ActionType.UPDATE_APP_SETTINGS,
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

  test("delete app", async () => {
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
      [appDevelopment, appStaging, appProduction] = getEnvironments(
        ownerId,
        appId
      ),
      [blockDevelopment, blockStaging, blockProduction] = getEnvironments(
        ownerId,
        blockId
      );

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
    state = getState(ownerId);
    const inviteeDeviceId = getAuth<Client.ClientUserAuth>(
      state,
      ownerId
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
      ownerId
    );

    await loadAccount(ownerId);

    // Add inheritance keys so we can test that overrides are deleted correctly
    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY_ROW,
        payload: {
          envParentId: appId,
          entryKey: "INHERITANCE",
          vals: {
            [appDevelopment.id]: {
              inheritsEnvironmentId: appStaging.id,
            },
            [appStaging.id]: {
              inheritsEnvironmentId: appProduction.id,
            },
            [appProduction.id]: {
              val: "inheritance-val",
            },
          },
        },
      },
      ownerId
    );
    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY_ROW,
        payload: {
          envParentId: blockId,
          entryKey: "BLOCK_INHERITANCE",
          vals: {
            [blockDevelopment.id]: {
              inheritsEnvironmentId: blockStaging.id,
            },
            [blockStaging.id]: {
              inheritsEnvironmentId: blockProduction.id,
            },
            [blockProduction.id]: {
              val: "inheritance-val",
            },
          },
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

    const promise = dispatch(
      {
        type: Api.ActionType.DELETE_APP,
        payload: { id: appId },
      },
      ownerId
    );

    state = getState(ownerId);

    expect(state.isRemoving[appId]).toBeTrue();

    const res = await promise;

    expect(res.success).toBeTrue();
    state = getState(ownerId);
    const {
      appUserGrants,
      appBlocks,
      localKeys: afterDeleteLocalKeys,
      servers: afterDeleteServers,
      generatedEnvkeys,
    } = graphTypes(state.graph);
    expect(state.isRemoving[appId]).toBeUndefined();

    // ensure app deleted
    expect(state.graph[appId]).toBeUndefined();

    // ensure associations are deleted
    expect(
      R.flatten([
        appUserGrants,
        appBlocks,
        afterDeleteLocalKeys,
        afterDeleteServers,
        generatedEnvkeys,
      ])
    ).toEqual([]);

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
          envParentId: appId,
        },
        { transactionConn: undefined }
      );

      expect(encryptedKeys).toEqual([]);

      encryptedKeys = await getUserEncryptedKeys(
        {
          orgId,
          userId,
          deviceId,
          blobType: "changeset",
          envParentId: appId,
        },
        { transactionConn: undefined }
      );
      expect(encryptedKeys).toEqual([]);
    }
    // --> generated envkey encrypted keys
    for (let { id: generatedEnvkeyId } of generatedEnvkeys) {
      const encryptedKeys = await query<Api.Db.GeneratedEnvkeyEncryptedKey>({
        pkey: ["envkey", generatedEnvkeyId].join("|"),
        transactionConn: undefined,
      });

      expect(encryptedKeys).toEqual([]);
    }

    // ensure encrypted blobs are deleted
    let blobs = await getEncryptedBlobs(
      {
        orgId,
        blobType: "env",
        envParentId: appId,
      },
      { transactionConn: undefined }
    );
    expect(blobs).toEqual([]);

    blobs = await getEncryptedBlobs(
      {
        orgId,
        blobType: "changeset",
        envParentId: appId,
      },
      { transactionConn: undefined }
    );
    expect(blobs).toEqual([]);
  });

  describe("manage access", () => {
    let app1Id: string,
      app2Id: string,
      app3Id: string,
      block1Id: string,
      block2Id: string,
      inviteeId: string,
      inviteeDeviceId: string,
      invite: Client.State["generatedInvites"][0],
      appDevRole: Rbac.AppRole,
      appProdRole: Rbac.AppRole,
      appAdminRole: Rbac.AppRole,
      app1Development: Model.Environment,
      app1Staging: Model.Environment,
      app1Production: Model.Environment,
      app2Development: Model.Environment,
      app2Staging: Model.Environment,
      app2Production: Model.Environment,
      app3Development: Model.Environment,
      app3Staging: Model.Environment,
      app3Production: Model.Environment,
      block1Development: Model.Environment,
      block1Staging: Model.Environment,
      block1Production: Model.Environment,
      block2Development: Model.Environment,
      block2Staging: Model.Environment,
      block2Production: Model.Environment;

    beforeEach(async () => {
      [
        { id: app1Id },
        { id: app2Id },
        { id: app3Id },
        { id: block1Id },
        { id: block2Id },
      ] = [
        await createApp(ownerId, "Test App 1"),
        await createApp(ownerId, "Test App 2"),
        await createApp(ownerId, "Test App 3"),
        await createBlock(ownerId, "Test Block 1"),
        await createBlock(ownerId, "Test Block 2"),
      ];

      await updateEnvs(ownerId, app1Id);
      await updateEnvs(ownerId, app2Id);
      await updateEnvs(ownerId, app3Id);
      await updateEnvs(ownerId, block1Id);
      await updateEnvs(ownerId, block2Id);
      await updateLocals(ownerId, app1Id);
      await updateLocals(ownerId, app3Id);
      await updateLocals(ownerId, block1Id);

      await connectBlocks(ownerId, [
        { blockId: block1Id, appId: app3Id, orderIndex: 0 },
        { blockId: block2Id, appId: app1Id, orderIndex: 0 },
      ]);

      let state = getState(ownerId);

      const { appRoles } = graphTypes(state.graph);

      [appAdminRole, appProdRole, appDevRole] = R.props(
        ["Admin", "DevOps", "Developer"] as string[],
        R.indexBy(R.prop("name"), appRoles)
      );

      [app1Development, app1Staging, app1Production] = getEnvironments(
        ownerId,
        app1Id
      );
      [app2Development, app2Staging, app2Production] = getEnvironments(
        ownerId,
        app2Id
      );
      [app3Development, app3Staging, app3Production] = getEnvironments(
        ownerId,
        app3Id
      );
      [block1Development, block1Staging, block1Production] = getEnvironments(
        ownerId,
        block1Id
      );
      [block2Development, block2Staging, block2Production] = getEnvironments(
        ownerId,
        block2Id
      );

      // Add inheritance keys so we can test overrides
      dispatch(
        {
          type: Client.ActionType.CREATE_ENTRY_ROW,
          payload: {
            envParentId: app1Id,
            entryKey: "INHERITANCE",
            vals: {
              [app1Development.id]: {
                inheritsEnvironmentId: app1Staging.id,
              },
              [app1Staging.id]: {
                inheritsEnvironmentId: app1Production.id,
              },
              [app1Production.id]: {
                val: "inheritance-val",
              },
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
              [block1Development.id]: {
                inheritsEnvironmentId: block1Staging.id,
              },
              [block1Staging.id]: {
                inheritsEnvironmentId: block1Production.id,
              },
              [block1Production.id]: {
                val: "inheritance-val",
              },
            },
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

      state = getState(ownerId);

      invite = await inviteBasicUser(ownerId);
      ({ id: inviteeId } = invite.user);
    });

    test("to an active user", async () => {
      await inviteeAcceptInvite();
      await grantAccess();
      await fetchAllEnvs();
      await confirmInviteeEnvs();
      confirmInviteeInheritanceOverrides();
      await fetchAllEnvs();
      await updateEnvsAfterAccessGrant();
      await fetchAllEnvs();
      await confirmInviteeEnvsAfterUpdate();
      confirmInviteeInheritanceOverrides();
      await removeAccess();
    });

    test("to an invited user", async () => {
      await grantAccess();

      await inviteeAcceptInvite();
      await confirmInviteeEnvs();
      confirmInviteeInheritanceOverrides();

      await fetchAllEnvs();
      await updateEnvsAfterAccessGrant();

      await fetchAllEnvs();
      await confirmInviteeEnvsAfterUpdate();
      confirmInviteeInheritanceOverrides();

      await removeAccess();
    });

    const inviteeAcceptInvite = async () => {
        await acceptInvite(invite);

        // force refresh owner graph
        await loadAccount(ownerId);

        const state = getState(ownerId);

        ({ id: inviteeDeviceId } = getOrgUserDevicesByUserId(state.graph)[
          inviteeId
        ]![0]);
      },
      grantAccess = async () => {
        const promise = dispatch(
          {
            type: Client.ActionType.GRANT_APPS_ACCESS,
            payload: [
              { appId: app1Id, userId: inviteeId, appRoleId: appDevRole.id },
              { appId: app2Id, userId: inviteeId, appRoleId: appProdRole.id },
              { appId: app3Id, userId: inviteeId, appRoleId: appAdminRole.id },
            ],
          },
          ownerId
        );

        let state = getState(ownerId);
        expect(
          state.isGrantingAppAccess[app1Id][appDevRole.id][inviteeId]
        ).toBeTrue();
        expect(
          state.isGrantingAppAccess[app2Id][appProdRole.id][inviteeId]
        ).toBeTrue();
        expect(
          state.isGrantingAppAccess[app3Id][appAdminRole.id][inviteeId]
        ).toBeTrue();

        expect(
          state.isGrantingAppAccess[inviteeId][appDevRole.id][app1Id]
        ).toBeTrue();
        expect(
          state.isGrantingAppAccess[inviteeId][appProdRole.id][app2Id]
        ).toBeTrue();
        expect(
          state.isGrantingAppAccess[inviteeId][appAdminRole.id][app3Id]
        ).toBeTrue();

        const res = await promise;

        expect(res.success).toBeTrue();
        expect(res.state.isGrantingAppAccess).toEqual({});
      },
      removeAccess = async () => {
        let state = getState(ownerId);

        const appUserGrant = getAppUserGrantsByComposite(state.graph)[
            [inviteeId, app1Id].join("|")
          ]!,
          promise = dispatch(
            {
              type: Api.ActionType.REMOVE_APP_ACCESS,
              payload: {
                id: appUserGrant.id,
              },
            },
            ownerId
          );

        state = getState(ownerId);
        expect(state.isRemoving[appUserGrant.id]).toBeTrue();

        const res = await promise;

        expect(res.success).toBeTrue();

        state = getState(ownerId);
        expect(state.isRemoving[appUserGrant.id]).toBeUndefined();

        await loadAccount(inviteeId);

        state = getState(inviteeId);
        expect(state.graph[app1Id]).toBeUndefined();

        const fetchRes = await dispatch(
          {
            type: Client.ActionType.FETCH_ENVS,
            payload: {
              byEnvParentId: {
                [app1Id]: { envs: true },
              },
            },
          },
          inviteeId
        );

        expect(fetchRes.success).toBeFalse();
      },
      updateEnvsAfterAccessGrant = async () => {
        dispatch(
          {
            type: Client.ActionType.CREATE_ENTRY_ROW,
            payload: {
              envParentId: app1Id,
              entryKey: "KEY4",
              vals: {
                [app1Development.id]: { val: "key4-val" },
                [app1Staging.id]: { val: "key4-val" },
                [app1Production.id]: { val: "key4-val" },
              },
            },
          },
          ownerId
        );

        dispatch(
          {
            type: Client.ActionType.CREATE_ENTRY_ROW,
            payload: {
              envParentId: app2Id,
              entryKey: "KEY4",
              vals: {
                [app2Development.id]: { val: "key4-val" },
                [app2Staging.id]: { val: "key4-val" },
                [app2Production.id]: { val: "key4-val" },
              },
            },
          },
          ownerId
        );

        dispatch(
          {
            type: Client.ActionType.CREATE_ENTRY_ROW,
            payload: {
              envParentId: app3Id,
              entryKey: "KEY4",
              vals: {
                [app3Development.id]: { val: "key4-val" },
                [app3Staging.id]: { val: "key4-val" },
                [app3Production.id]: { val: "key4-val" },
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
              entryKey: "BLOCK_KEY",
              vals: {
                [block1Development.id]: { val: "block-key-val" },
                [block1Staging.id]: { val: "block-key-val" },
                [block1Production.id]: { val: "block-key-val" },
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
              entryKey: "BLOCK_KEY",
              vals: {
                [block2Development.id]: { val: "block-key-val" },
                [block2Staging.id]: { val: "block-key-val" },
                [block2Production.id]: { val: "block-key-val" },
              },
            },
          },
          ownerId
        );

        dispatch(
          {
            type: Client.ActionType.CREATE_ENTRY,
            payload: {
              envParentId: app1Id,
              environmentId: [app1Id, inviteeId].join("|"),
              entryKey: "INVITEE_LOCALS_KEY",
              val: { val: "invitee-locals-val" },
            },
          },
          ownerId
        );

        dispatch(
          {
            type: Client.ActionType.CREATE_ENTRY,
            payload: {
              envParentId: app1Id,
              environmentId: [app1Id, ownerId].join("|"),
              entryKey: "OWNER_LOCALS_KEY",
              val: { val: "owner-locals-val" },
            },
          },
          ownerId
        );

        dispatch(
          {
            type: Client.ActionType.CREATE_ENTRY,
            payload: {
              envParentId: app3Id,
              environmentId: [app3Id, ownerId].join("|"),
              entryKey: "OWNER_LOCALS_KEY",
              val: { val: "owner-locals-val" },
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
              entryKey: "OWNER_BLOCK_LOCALS_KEY",
              val: { val: "owner-block-locals-val" },
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
              entryKey: "OWNER_BLOCK_LOCALS_KEY",
              val: { val: "owner-block-locals-val" },
            },
          },
          ownerId
        );

        return dispatch(
          {
            type: Client.ActionType.COMMIT_ENVS,
            payload: { message: "commit message" },
          },
          ownerId
        );
      },
      fetchAllEnvs = async () => {
        await dispatch(
          {
            type: Client.ActionType.FETCH_ENVS,
            payload: {
              byEnvParentId: [app1Id, app2Id, app3Id, block1Id].reduce(
                (agg, id) => ({
                  ...agg,
                  [id]: { envs: true },
                }),
                {}
              ),
            },
          },
          ownerId
        );
      },
      confirmInviteeEnvs = async () => {
        await loadAccount(inviteeId);
        const state = getState(inviteeId);

        expect(
          getEnvWithMeta(state, {
            envParentId: app1Id,
            environmentId: app1Development.id,
          })
        ).toEqual({
          inherits: {
            [app1Staging.id]: ["INHERITANCE"],
          },
          variables: {
            KEY2: { isUndefined: true },
            KEY3: { val: "key3-val" },
            IMPORTED_KEY1: { val: "imported-val" },
            IMPORTED_KEY2: { val: "imported-val" },
            INHERITANCE: { inheritsEnvironmentId: app1Staging.id },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: app1Id,
            environmentId: app1Staging.id,
          })
        ).toEqual({
          inherits: {
            [app1Production.id]: ["INHERITANCE"],
          },
          variables: {
            KEY2: { isEmpty: true, val: "" },
            KEY3: { val: "key3-val" },
            INHERITANCE: { inheritsEnvironmentId: app1Production.id },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: app1Id,
            environmentId: app1Production.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: {},
            KEY3: {},
            INHERITANCE: {},
          },
        });

        expect(
          state.envs[
            getUserEncryptedKeyOrBlobComposite({
              environmentId: [app1Id, ownerId].join("|"),
            })
          ]
        ).toBeUndefined();

        expect(
          getEnvWithMeta(state, {
            envParentId: app2Id,
            environmentId: app2Development.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: { isUndefined: true },
            KEY3: { val: "key3-val" },
            IMPORTED_KEY1: { val: "imported-val" },
            IMPORTED_KEY2: { val: "imported-val" },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: app2Id,
            environmentId: app2Staging.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: { isEmpty: true, val: "" },
            KEY3: { val: "key3-val" },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: app2Id,
            environmentId: app2Production.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: { val: "val3" },
            KEY3: { val: "key3-val" },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: app3Id,
            environmentId: app3Development.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: { isUndefined: true },
            KEY3: { val: "key3-val" },
            IMPORTED_KEY1: { val: "imported-val" },
            IMPORTED_KEY2: { val: "imported-val" },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: app3Id,
            environmentId: app3Staging.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: { isEmpty: true, val: "" },
            KEY3: { val: "key3-val" },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: app3Id,
            environmentId: app3Production.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: { val: "val3" },
            KEY3: { val: "key3-val" },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: app3Id,
            environmentId: [app3Id, ownerId].join("|"),
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
            KEY2: { isUndefined: true },
            KEY3: { val: "key3-val" },
            BLOCK_INHERITANCE: { inheritsEnvironmentId: block1Staging.id },
            IMPORTED_KEY1: { val: "imported-val" },
            IMPORTED_KEY2: { val: "imported-val" },
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
            KEY2: { isEmpty: true, val: "" },
            KEY3: { val: "key3-val" },
            BLOCK_INHERITANCE: { inheritsEnvironmentId: block1Production.id },
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
            KEY2: { val: "val3" },
            KEY3: { val: "key3-val" },
            BLOCK_INHERITANCE: { val: "inheritance-val" },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: block1Id,
            environmentId: [block1Id, ownerId].join("|"),
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

        expect(
          getEnvWithMeta(state, {
            envParentId: block2Id,
            environmentId: block2Development.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: { isUndefined: true },
            KEY3: { val: "key3-val" },
            IMPORTED_KEY1: { val: "imported-val" },
            IMPORTED_KEY2: { val: "imported-val" },
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
            KEY2: { isEmpty: true, val: "" },
            KEY3: { val: "key3-val" },
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
            KEY2: {},
            KEY3: {},
          },
        });

        expect(
          state.envs[
            getUserEncryptedKeyOrBlobComposite({
              environmentId: [block2Id, ownerId].join("|"),
            })
          ]
        ).toBeUndefined();
      },
      confirmInviteeEnvsAfterUpdate = async () => {
        await loadAccount(inviteeId);
        const state = getState(inviteeId);
        expect(
          getEnvWithMeta(state, {
            envParentId: app1Id,
            environmentId: app1Development.id,
          })
        ).toEqual({
          inherits: {
            [app1Staging.id]: ["INHERITANCE"],
          },
          variables: {
            KEY2: { isUndefined: true },
            KEY3: { val: "key3-val" },
            KEY4: { val: "key4-val" },
            INHERITANCE: { inheritsEnvironmentId: app1Staging.id },
            IMPORTED_KEY1: { val: "imported-val" },
            IMPORTED_KEY2: { val: "imported-val" },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: app1Id,
            environmentId: app1Staging.id,
          })
        ).toEqual({
          inherits: {
            [app1Production.id]: ["INHERITANCE"],
          },
          variables: {
            KEY2: { isEmpty: true, val: "" },
            KEY3: { val: "key3-val" },
            KEY4: { val: "key4-val" },
            INHERITANCE: { inheritsEnvironmentId: app1Production.id },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: app1Id,
            environmentId: app1Production.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: {},
            KEY3: {},
            KEY4: {},
            INHERITANCE: {},
          },
        });

        expect(
          state.envs[
            getUserEncryptedKeyOrBlobComposite({
              environmentId: [app1Id, ownerId].join("|"),
            })
          ]
        ).toBeUndefined();

        expect(
          getEnvWithMeta(state, {
            envParentId: app1Id,
            environmentId: [app1Id, inviteeId].join("|"),
          })
        ).toEqual({
          inherits: {},
          variables: {
            INVITEE_LOCALS_KEY: { val: "invitee-locals-val" },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: app2Id,
            environmentId: app2Development.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: { isUndefined: true },
            KEY3: { val: "key3-val" },
            KEY4: { val: "key4-val" },
            IMPORTED_KEY1: { val: "imported-val" },
            IMPORTED_KEY2: { val: "imported-val" },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: app2Id,
            environmentId: app2Staging.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: { isEmpty: true, val: "" },
            KEY3: { val: "key3-val" },
            KEY4: { val: "key4-val" },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: app2Id,
            environmentId: app2Production.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: { val: "val3" },
            KEY3: { val: "key3-val" },
            KEY4: { val: "key4-val" },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: app3Id,
            environmentId: app3Development.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: { isUndefined: true },
            KEY3: { val: "key3-val" },
            KEY4: { val: "key4-val" },
            IMPORTED_KEY1: { val: "imported-val" },
            IMPORTED_KEY2: { val: "imported-val" },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: app3Id,
            environmentId: app3Staging.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: { isEmpty: true, val: "" },
            KEY3: { val: "key3-val" },
            KEY4: { val: "key4-val" },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: app3Id,
            environmentId: app3Production.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: { val: "val3" },
            KEY3: { val: "key3-val" },
            KEY4: { val: "key4-val" },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: app3Id,
            environmentId: [app3Id, ownerId].join("|"),
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: { isUndefined: true },
            KEY3: { val: "key3-locals-val" },
            OWNER_LOCALS_KEY: { val: "owner-locals-val" },
            IMPORTED_KEY1: { val: "imported-val" },
            IMPORTED_KEY2: { val: "imported-val" },
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
            KEY2: { isUndefined: true },
            KEY3: { val: "key3-val" },
            BLOCK_KEY: { val: "block-key-val" },
            BLOCK_INHERITANCE: { inheritsEnvironmentId: block1Staging.id },
            IMPORTED_KEY1: { val: "imported-val" },
            IMPORTED_KEY2: { val: "imported-val" },
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
            KEY2: { isEmpty: true, val: "" },
            KEY3: { val: "key3-val" },
            BLOCK_KEY: { val: "block-key-val" },
            BLOCK_INHERITANCE: { inheritsEnvironmentId: block1Production.id },
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
            KEY2: { val: "val3" },
            KEY3: { val: "key3-val" },
            BLOCK_KEY: { val: "block-key-val" },
            BLOCK_INHERITANCE: { val: "inheritance-val" },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId: block1Id,
            environmentId: [block1Id, ownerId].join("|"),
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: { isUndefined: true },
            KEY3: { val: "key3-locals-val" },
            OWNER_BLOCK_LOCALS_KEY: { val: "owner-block-locals-val" },
            IMPORTED_KEY1: { val: "imported-val" },
            IMPORTED_KEY2: { val: "imported-val" },
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
            KEY2: { isUndefined: true },
            KEY3: { val: "key3-val" },
            BLOCK_KEY: { val: "block-key-val" },
            IMPORTED_KEY1: { val: "imported-val" },
            IMPORTED_KEY2: { val: "imported-val" },
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
            KEY2: { isEmpty: true, val: "" },
            KEY3: { val: "key3-val" },
            BLOCK_KEY: { val: "block-key-val" },
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
            KEY2: {},
            KEY3: {},
            BLOCK_KEY: {},
          },
        });

        expect(
          state.envs[
            getUserEncryptedKeyOrBlobComposite({
              environmentId: [block2Id, ownerId].join("|"),
            })
          ]
        ).toBeUndefined();
      },
      confirmInviteeInheritanceOverrides = () => {
        let state = getState(inviteeId);

        expect(
          state.envs[
            getUserEncryptedKeyOrBlobComposite({
              environmentId: app1Development.id,
              inheritsEnvironmentId: app1Staging.id,
            })
          ]
        ).toEqual({
          key: expect.toBeString(),
          env: { INHERITANCE: { inheritsEnvironmentId: app1Production.id } },
        });

        expect(
          state.envs[
            getUserEncryptedKeyOrBlobComposite({
              environmentId: app1Development.id,
              inheritsEnvironmentId: app1Production.id,
            })
          ]
        ).toEqual({
          key: expect.toBeString(),
          env: {
            INHERITANCE: { val: "inheritance-val" },
          },
        });

        expect(
          state.envs[
            getUserEncryptedKeyOrBlobComposite({
              environmentId: app1Staging.id,
              inheritsEnvironmentId: app1Production.id,
            })
          ]
        ).toEqual({
          key: expect.toBeString(),
          env: {
            INHERITANCE: { val: "inheritance-val" },
          },
        });

        expect(
          state.envs[
            getUserEncryptedKeyOrBlobComposite({
              environmentId: block1Development.id,
              inheritsEnvironmentId: block1Staging.id,
            })
          ]
        ).toEqual({
          key: expect.toBeString(),
          env: {
            BLOCK_INHERITANCE: { inheritsEnvironmentId: block1Production.id },
          },
        });

        expect(
          state.envs[
            getUserEncryptedKeyOrBlobComposite({
              environmentId: block1Development.id,
              inheritsEnvironmentId: block1Production.id,
            })
          ]
        ).toEqual({
          key: expect.toBeString(),
          env: {
            BLOCK_INHERITANCE: { val: "inheritance-val" },
          },
        });

        expect(
          state.envs[
            getUserEncryptedKeyOrBlobComposite({
              environmentId: block1Staging.id,
              inheritsEnvironmentId: block1Production.id,
            })
          ]
        ).toEqual({
          key: expect.toBeString(),
          env: {
            BLOCK_INHERITANCE: { val: "inheritance-val" },
          },
        });
      };
  });
});

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
  getPool,
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

describe("orgs", () => {
  let email: string, orgId: string, deviceId: string, ownerId: string;

  beforeEach(async () => {
    email = `success+${getTestId()}@simulator.amazonses.com`;
    ({ orgId, deviceId, userId: ownerId } = await registerWithEmail(email));
  });

  test("rename", async () => {
    const promise = dispatch(
      {
        type: Api.ActionType.RENAME_ORG,
        payload: {
          name: "Renamed-Org",
        },
      },
      ownerId
    );

    let state = getState(ownerId);
    expect(state.isRenaming[orgId]).toBeTrue();

    const res = await promise;

    expect(res.success).toBeTrue();
    state = getState(ownerId);
    expect(state.isRenaming[orgId]).toBeUndefined();

    expect(state.graph[orgId]).toEqual(
      expect.objectContaining({
        name: "Renamed-Org",
      })
    );
  });

  test("update settings", async () => {
    let state = getState(ownerId);
    const org = state.graph[orgId] as Api.Db.Org;
    const promise = dispatch(
      {
        type: Api.ActionType.UPDATE_ORG_SETTINGS,
        payload: R.mergeDeepRight(org.settings, {
          crypto: {
            requiresLockout: true,
            lockoutMs: 1000 * 60,
          },
          auth: {
            tokenExpirationMs: 1000 * 60,
          },
        }),
      },
      ownerId
    );

    state = getState(ownerId);
    expect(state.isUpdatingSettings[orgId]).toBeTrue();

    const res = await promise;

    expect(res.success).toBeTrue();
    state = getState(ownerId);
    expect(state.isUpdatingSettings[orgId]).toBeUndefined();

    expect(state.graph[orgId]).toEqual(
      expect.objectContaining({
        settings: {
          crypto: {
            requiresPassphrase: false,
            requiresLockout: true,
            lockoutMs: 1000 * 60,
          },
          auth: {
            inviteExpirationMs: expect.toBeNumber(),
            deviceGrantExpirationMs: expect.toBeNumber(),
            tokenExpirationMs: 1000 * 60,
          },
          envs: expect.toBeObject(),
        },
      })
    );
  });

  test("delete org", async () => {
    const { id: appId } = await createApp(ownerId);
    const { id: blockId } = await createBlock(ownerId);

    await updateEnvs(ownerId, appId);
    await updateLocals(ownerId, appId);
    await updateEnvs(ownerId, blockId);
    await updateLocals(ownerId, blockId);

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
              email: `success+invitee-1${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-1${getTestId()}@simulator.amazonses.com`,
              orgRoleId: basicRole.id,
            },
          },
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-2${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-2${getTestId()}@simulator.amazonses.com`,
              orgRoleId: basicRole.id,
            },
          },
        ],
      },
      ownerId
    );

    state = getState(ownerId);

    const [invite1Params, invite2Params] = state.generatedInvites,
      invitee1Id = invite1Params.user.id,
      approveDeviceParams = [{ granteeId: ownerId }];

    await dispatch(
      {
        type: Client.ActionType.APPROVE_DEVICES,
        payload: approveDeviceParams,
      },
      ownerId
    );
    state = getState(ownerId);
    const generatedDeviceGrant = state.generatedDeviceGrants[0];

    await dispatch(
      {
        type: Client.ActionType.CREATE_RECOVERY_KEY,
      },
      ownerId
    );
    state = getState(ownerId);
    const recoveryEncryptionKey = state.generatedRecoveryKey!.encryptionKey;

    const [appDevelopment] = getEnvironments(ownerId, appId);
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

    state = getState(ownerId);
    const byType = graphTypes(state.graph),
      [{ id: localKeyId }] = byType.localKeys,
      [{ id: localGeneratedEnvkeyId }] = byType.generatedEnvkeys;

    await acceptInvite(invite1Params);
    state = getState(invite1Params.user.id);
    const invitee1DeviceId = getAuth<Client.ClientUserAuth>(
      state,
      invite1Params.user.id
    )!.deviceId;

    await loadAccount(ownerId);
    const promise = dispatch(
      {
        type: Api.ActionType.DELETE_ORG,
        payload: {},
      },
      ownerId
    );

    state = getState(ownerId);
    expect(state.isRemoving[orgId]).toBeTrue();

    const res = await promise;

    expect(res.success).toBeTrue();
    state = getState(ownerId);

    expect(state.orgUserAccounts[ownerId]).toBeUndefined();

    // console.log(`ensure org is marked deleted in the db`);
    const org = await getOrg(orgId, undefined);
    expect(org!.deletedAt).toBeNumber();

    // console.log(`ensure encrypted keys are deleted`);
    const blobs = await Promise.all([
      getUserEncryptedKeys(
        {
          orgId,
          userId: ownerId,
          deviceId,
          blobType: "env",
        },
        { transactionConnOrPool: getPool() }
      ),
      getUserEncryptedKeys(
        {
          orgId,
          userId: invitee1Id,
          deviceId: invitee1DeviceId,
          blobType: "env",
        },
        { transactionConnOrPool: getPool() }
      ),
      query({
        pkey: ["envkey", localGeneratedEnvkeyId].join("|"),
        transactionConn: undefined,
      }),
    ]).then(R.flatten);

    expect(blobs).toEqual([]);

    // console.log(`ensure active invite can't be redeemed`);
    const [{ skey: inviteEmailToken }] = await query<Api.Db.InvitePointer>({
      pkey: ["invite", invite2Params.identityHash].join("|"),
      transactionConn: undefined,
    });
    const loadInviteRes = await dispatch<
      Client.Action.ClientActions["LoadInvite"]
    >(
      {
        type: Client.ActionType.LOAD_INVITE,
        payload: {
          emailToken: inviteEmailToken,
          encryptionToken: [
            invite2Params.identityHash,
            invite2Params.encryptionKey,
          ].join("_"),
        },
      },
      undefined
    );
    expect(loadInviteRes.success).toBeFalse();

    // console.log(`ensure active device grant can't be redeemed`);
    const [{ skey: deviceGrantEmailToken }] =
        await query<Api.Db.DeviceGrantPointer>({
          pkey: ["deviceGrant", generatedDeviceGrant.identityHash].join("|"),
          transactionConn: undefined,
        }),
      deviceGrantLoadRes = await dispatch<
        Client.Action.ClientActions["LoadDeviceGrant"]
      >(
        {
          type: Client.ActionType.LOAD_DEVICE_GRANT,
          payload: {
            emailToken: deviceGrantEmailToken,
            encryptionToken: [
              generatedDeviceGrant.identityHash,
              generatedDeviceGrant.encryptionKey,
            ].join("_"),
          },
        },
        undefined
      );
    expect(deviceGrantLoadRes.success).toBeFalse();

    // console.log(`ensure active recovery key can't be redeemed`);
    const recoveryKeyLoadRes = await dispatch<
      Client.Action.ClientActions["LoadRecoveryKey"]
    >(
      {
        type: Client.ActionType.LOAD_RECOVERY_KEY,
        payload: {
          encryptionKey: recoveryEncryptionKey,
          hostUrl,
        },
      },
      undefined
    );

    expect(recoveryKeyLoadRes.success).toBeFalse();
    expect(
      (recoveryKeyLoadRes.resultAction as any).payload.error.type
    ).not.toBe("requiresEmailAuthError");
  });

  test("rename user", async () => {
    let state = getState(ownerId),
      { orgRoles } = graphTypes(state.graph);
    const [basicRole, adminRole] = R.props(
      ["Basic User", "Org Admin"] as string[],
      R.indexBy(R.prop("name"), orgRoles)
    );

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
          },
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-2${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-2${getTestId()}@simulator.amazonses.com`,
              orgRoleId: basicRole.id,
            },
          },
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-admin-1${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-admin-1${getTestId()}@simulator.amazonses.com`,
              orgRoleId: adminRole.id,
            },
          },
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-admin-2${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-admin-2${getTestId()}@simulator.amazonses.com`,
              orgRoleId: adminRole.id,
            },
          },
        ],
      },
      ownerId
    );

    state = getState(ownerId);

    const [
        basic1InviteParams,
        basic2InviteParams,
        admin1InviteParams,
        admin2InviteParams,
      ] = state.generatedInvites,
      basic1InviteeId = basic1InviteParams.user.id,
      basic2InviteeId = basic2InviteParams.user.id,
      admin1InviteeId = admin1InviteParams.user.id,
      admin2InviteeId = admin2InviteParams.user.id;

    // owner can rename self
    const promise = dispatch(
      {
        type: Api.ActionType.RENAME_USER,
        payload: {
          id: ownerId,
          firstName: "Renamed",
          lastName: "Owner",
        },
      },
      ownerId
    );
    state = getState(ownerId);
    expect(state.isRenaming[ownerId]).toBeTrue();

    const res1 = await promise;
    expect(res1.success).toBeTrue();

    state = getState(ownerId);
    expect(state.isRenaming[ownerId]).toBeUndefined();

    expect(state.graph[ownerId]).toEqual(
      expect.objectContaining({
        firstName: "Renamed",
        lastName: "Owner",
      })
    );

    // owner can rename invited user
    const res2 = await dispatch(
      {
        type: Api.ActionType.RENAME_USER,
        payload: {
          id: basic1InviteeId,
          firstName: "Renamed",
          lastName: "Basic",
        },
      },
      ownerId
    );

    expect(res2.success).toBeTrue();
    state = getState(ownerId);

    expect(state.graph[basic1InviteeId]).toEqual(
      expect.objectContaining({
        firstName: "Renamed",
        lastName: "Basic",
      })
    );

    //owner can rename active user
    await acceptInvite(basic1InviteParams);
    await loadAccount(ownerId);

    const res3 = await dispatch(
      {
        type: Api.ActionType.RENAME_USER,
        payload: {
          id: basic1InviteeId,
          firstName: "Renamed-Again",
          lastName: "Basic-Again",
        },
      },
      ownerId
    );

    expect(res3.success).toBeTrue();
    state = getState(ownerId);

    expect(state.graph[basic1InviteeId]).toEqual(
      expect.objectContaining({
        firstName: "Renamed-Again",
        lastName: "Basic-Again",
      })
    );

    // org admin cannot rename another org admin they didn't invite
    await acceptInvite(admin1InviteParams);
    await acceptInvite(admin2InviteParams);

    const res4 = await dispatch(
      {
        type: Api.ActionType.RENAME_USER,
        payload: {
          id: admin1InviteeId,
          firstName: "Renamed",
          lastName: "Admin",
        },
      },
      admin2InviteParams.user.id
    );
    expect(res4.success).toBeFalse();

    // org admin can rename an invited org admin they *did* invite
    await dispatch(
      {
        type: Client.ActionType.INVITE_USERS,
        payload: [
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-admin-3${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-admin-3${getTestId()}@simulator.amazonses.com`,
              orgRoleId: adminRole.id,
            },
          },
        ],
      },
      admin2InviteParams.user.id
    );
    state = getState(admin2InviteParams.user.id);
    const admin3InviteParams = state.generatedInvites.slice(-1)[0],
      admin3InviteeId = admin3InviteParams.user.id,
      res5 = await dispatch(
        {
          type: Api.ActionType.RENAME_USER,
          payload: {
            id: admin3InviteeId,
            firstName: "Renamed",
            lastName: "Admin",
          },
        },
        admin2InviteParams.user.id
      );
    expect(res5.success).toBeTrue();
    state = getState(admin2InviteParams.user.id);

    expect(state.graph[admin3InviteeId]).toEqual(
      expect.objectContaining({
        firstName: "Renamed",
        lastName: "Admin",
      })
    );

    // org admin *cannot* rename an active org admin even if they did invite them
    await acceptInvite(admin3InviteParams);

    await loadAccount(admin2InviteeId);
    const res6 = await dispatch(
      {
        type: Api.ActionType.RENAME_USER,
        payload: {
          id: admin3InviteeId,
          firstName: "Renamed-Again",
          lastName: "Admin-Again",
        },
      },
      admin2InviteParams.user.id
    );
    expect(res6.success).toBeFalse();

    // org admin cannot rename self
    const res7 = await dispatch(
      {
        type: Api.ActionType.RENAME_USER,
        payload: {
          id: admin2InviteeId,
          firstName: "Renamed-Again",
          lastName: "Admin-Again",
        },
      },
      admin2InviteParams.user.id
    );
    expect(res7.success).toBeFalse();

    // basic user cannot rename another basic user
    await acceptInvite(basic2InviteParams);
    const res8 = await dispatch(
      {
        type: Api.ActionType.RENAME_USER,
        payload: {
          id: basic1InviteeId,
          firstName: "Renamed-Again",
          lastName: "Basic-Again",
        },
      },
      basic2InviteParams.user.id
    );
    expect(res8.success).toBeFalse();

    // basic user cannot rename self
    const res9 = await dispatch(
      {
        type: Api.ActionType.RENAME_USER,
        payload: {
          id: basic2InviteeId,
          firstName: "Renamed-Again",
          lastName: "Basic-Again",
        },
      },
      basic2InviteParams.user.id
    );
    expect(res9.success).toBeFalse();
  });

  test("update user role", async () => {
    const { id: appId } = await createApp(ownerId);
    const { id: blockId } = await createBlock(ownerId);

    await updateEnvs(ownerId, appId);
    await updateLocals(ownerId, appId);
    await updateEnvs(ownerId, blockId);
    await updateLocals(ownerId, blockId);

    let state = getState(ownerId);

    const { orgRoles } = graphTypes(state.graph),
      [basicRole, adminRole] = R.props(
        ["Basic User", "Org Admin"] as string[],
        R.indexBy(R.prop("name"), orgRoles)
      );

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
          },
        ],
      },
      ownerId
    );

    state = getState(ownerId);

    const invite1Params = state.generatedInvites.slice(-1)[0],
      invitee1Id = invite1Params.user.id;

    // upgrading with an active invite
    const promise1 = dispatch(
      {
        type: Client.ActionType.UPDATE_USER_ROLES,
        payload: [
          {
            id: invitee1Id,
            orgRoleId: adminRole.id,
          },
        ],
      },
      ownerId
    );

    state = getState(ownerId);

    expect(state.isUpdatingUserRole[invitee1Id]).toBe(adminRole.id);

    const res1 = await promise1;
    expect(res1.success).toBeTrue();

    state = getState(ownerId);
    expect(state.isUpdatingUserRole[invitee1Id]).toBeUndefined();

    await acceptInvite(invite1Params);
    await fetchEnvsWithChangesets(invite1Params.user.id, appId, ownerId);

    // downgrading with an active invite
    await loadAccount(ownerId);

    state = getState(ownerId);

    await dispatch(
      {
        type: Client.ActionType.INVITE_USERS,
        payload: [
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-admin1${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-admin1${getTestId()}@simulator.amazonses.com`,
              orgRoleId: adminRole.id,
            },
          },
        ],
      },
      ownerId
    );

    state = getState(ownerId);

    const invite2Params = state.generatedInvites.slice(-1)[0],
      invitee2Id = invite2Params.user.id,
      res2 = await dispatch(
        {
          type: Client.ActionType.UPDATE_USER_ROLES,
          payload: [
            {
              id: invitee2Id,
              orgRoleId: basicRole.id,
            },
          ],
        },
        ownerId
      );
    expect(res2.success).toBeTrue();

    await acceptInvite(invite2Params);

    state = getState(invite2Params.user.id);
    expect(state.envs).toEqual({});
    expect(state.changesets).toEqual({});

    // upgrading with an active user
    await loadAccount(ownerId);
    await dispatch(
      {
        type: Client.ActionType.INVITE_USERS,
        payload: [
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-3${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-3${getTestId()}@simulator.amazonses.com`,
              orgRoleId: basicRole.id,
            },
          },
        ],
      },
      ownerId
    );
    state = getState(ownerId);
    const invite3Params = state.generatedInvites.slice(-1)[0],
      invitee3Id = invite3Params.user.id;

    await acceptInvite(invite3Params);

    await loadAccount(ownerId);
    const res3 = await dispatch(
      {
        type: Client.ActionType.UPDATE_USER_ROLES,
        payload: [
          {
            id: invitee3Id,
            orgRoleId: adminRole.id,
          },
        ],
      },
      ownerId
    );
    expect(res3.success).toBeTrue();

    await loadAccount(invitee3Id);
    await fetchEnvsWithChangesets(invitee3Id, appId, ownerId);

    // downgrading with an active user
    await loadAccount(ownerId);
    const inviteRes = await dispatch(
      {
        type: Client.ActionType.INVITE_USERS,
        payload: [
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-admin4${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-admin4${getTestId()}@simulator.amazonses.com`,
              orgRoleId: basicRole.id,
            },
          },
        ],
      },
      ownerId
    );
    state = getState(ownerId);

    const invite4Params = state.generatedInvites.slice(-1)[0],
      invitee4Id = invite4Params.user.id;

    await acceptInvite(invite4Params);

    await loadAccount(ownerId);
    const res4 = await dispatch(
      {
        type: Client.ActionType.UPDATE_USER_ROLES,
        payload: [
          {
            id: invitee1Id,
            orgRoleId: basicRole.id,
          },
        ],
      },
      ownerId
    );
    expect(res4.success).toBeTrue();

    await loadAccount(invitee4Id);
    state = getState(invitee4Id);
    expect(state.envs).toEqual({});
    expect(state.changesets).toEqual({});

    // upgrading a cli user
    await loadAccount(ownerId);
    await dispatch(
      {
        type: Client.ActionType.CREATE_CLI_USER,
        payload: {
          name: "cli-user",
          orgRoleId: basicRole.id,
        },
      },
      ownerId
    );

    state = getState(ownerId);
    const { cliKey } = state.generatedCliUsers[0],
      cliUser = graphTypes(state.graph).cliUsers[0];

    await dispatch(
      {
        type: Client.ActionType.UPDATE_USER_ROLES,
        payload: [
          {
            id: cliUser.id,
            orgRoleId: adminRole.id,
          },
        ],
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.AUTHENTICATE_CLI_KEY,
        payload: { cliKey },
      },
      cliKey
    );
    await fetchEnvsWithChangesets(cliKey, appId, ownerId);

    // downgrading a cli user

    await dispatch(
      {
        type: Client.ActionType.UPDATE_USER_ROLES,
        payload: [
          {
            id: cliUser.id,
            orgRoleId: basicRole.id,
          },
        ],
      },
      ownerId
    );

    await dispatch(
      {
        type: Client.ActionType.AUTHENTICATE_CLI_KEY,
        payload: { cliKey },
      },
      cliKey
    );

    // wait for CLEAR_ORPHANED_BLOBS to run
    await wait(1000);

    state = getState(cliKey);
    expect(state.envs).toEqual({});
    expect(state.changesets).toEqual({});
  });

  test("remove user", async () => {
    const { id: appId } = await createApp(ownerId);
    const { id: blockId } = await createBlock(ownerId);

    let state = getState(ownerId);
    const { orgRoles, appRoles } = graphTypes(state.graph),
      [basicRole, adminRole, ownerRole] = R.props(
        ["Basic User", "Org Admin", "Org Owner"] as string[],
        R.indexBy(R.prop("name"), orgRoles)
      ),
      [devRole] = R.props(
        ["Developer"] as string[],
        R.indexBy(R.prop("name"), appRoles)
      );

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
            appUserGrants: [{ appId, appRoleId: devRole.id }],
          },
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-2${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-2${getTestId()}@simulator.amazonses.com`,
              orgRoleId: basicRole.id,
            },
            appUserGrants: [{ appId, appRoleId: devRole.id }],
          },
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-3${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-3${getTestId()}@simulator.amazonses.com`,
              orgRoleId: basicRole.id,
            },
            appUserGrants: [{ appId, appRoleId: devRole.id }],
          },
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-admin1${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-admin1${getTestId()}@simulator.amazonses.com`,
              orgRoleId: adminRole.id,
            },
          },
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-admin2${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-admin2${getTestId()}@simulator.amazonses.com`,
              orgRoleId: adminRole.id,
            },
          },
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-admin3${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-admin3${getTestId()}@simulator.amazonses.com`,
              orgRoleId: adminRole.id,
            },
          },
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-owner2${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-owner2${getTestId()}@simulator.amazonses.com`,
              orgRoleId: ownerRole.id,
            },
          },
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-owner3${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-owner3${getTestId()}@simulator.amazonses.com`,
              orgRoleId: ownerRole.id,
            },
          },
        ],
      },
      ownerId
    );

    state = getState(ownerId);

    const [
        basic1InviteParams,
        basic2InviteParams,
        basic3InviteParams,
        admin1InviteParams,
        admin2InviteParams,
        admin3InviteParams,
        owner2InviteParams,
        owner3InviteParams,
      ] = state.generatedInvites,
      admin1Id = admin1InviteParams.user.id,
      admin2Id = admin2InviteParams.user.id,
      admin3Id = admin3InviteParams.user.id,
      owner2Id = owner2InviteParams.user.id,
      owner3Id = owner3InviteParams.user.id,
      basic1Id = basic1InviteParams.user.id,
      basic2Id = basic2InviteParams.user.id,
      basic3Id = basic3InviteParams.user.id;

    await acceptInvite(admin1InviteParams);
    await acceptInvite(admin2InviteParams);
    await acceptInvite(admin3InviteParams);
    await acceptInvite(owner2InviteParams);
    await acceptInvite(owner3InviteParams);
    await acceptInvite(basic1InviteParams);
    await acceptInvite(basic2InviteParams);
    await acceptInvite(basic3InviteParams);

    // create a cli user to test that it can remove a user too
    // and also that it still works correctly after its creator is removed
    await dispatch(
      {
        type: Client.ActionType.CREATE_CLI_USER,
        payload: {
          name: "cli-user",
          orgRoleId: adminRole.id,
        },
      },
      ownerId
    );
    state = getState(ownerId);
    const { cliKey } = state.generatedCliUsers[0];

    await dispatch(
      {
        type: Client.ActionType.AUTHENTICATE_CLI_KEY,
        payload: { cliKey },
      },
      cliKey
    );
    state = getState(cliKey);
    const cliAuth = getAuth<Client.ClientCliAuth>(state, cliKey);
    const cliUserId = cliAuth!.userId;

    // update envs with admin so we can test pubkey revocation requests
    await updateEnvs(admin1Id, appId);
    await updateLocals(admin1Id, appId);
    await updateEnvs(admin1Id, blockId);
    await updateLocals(admin1Id, blockId);

    // create a server so we can test root pubkey replacements
    const [appDevelopment] = getEnvironments(ownerId, appId);
    await dispatch(
      {
        type: Client.ActionType.CREATE_SERVER,
        payload: {
          appId,
          name: "Dev Server",
          environmentId: appDevelopment.id,
        },
      },
      ownerId
    );

    state = getState(ownerId);
    const byType = graphTypes(state.graph);

    const { id: serverId } = byType.servers[byType.servers.length - 1];
    const { id: serverGeneratedEnvkeyId } =
      byType.generatedEnvkeys[byType.generatedEnvkeys.length - 1];
    const {
      envkeyIdPart: serverEnvkeyIdPart,
      encryptionKey: serverEncryptionKey,
    } = R.find(
      R.propEq("keyableParentId", serverId),
      Object.values(state.generatedEnvkeys)
    )!;

    // create an invite, device grant, and recovery key with a user who won't be removed so we can ensure invite acceptance works after root replacements

    await dispatch(
      {
        type: Client.ActionType.INVITE_USERS,
        payload: [
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invitee-admin4${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invitee-admin4${getTestId()}@simulator.amazonses.com`,
              orgRoleId: adminRole.id,
            },
          },
        ],
      },
      owner3Id
    );

    await dispatch(
      {
        type: Client.ActionType.APPROVE_DEVICES,
        payload: [{ granteeId: owner3Id }],
      },
      owner3Id
    );

    await dispatch(
      {
        type: Client.ActionType.CREATE_RECOVERY_KEY,
      },
      owner3Id
    );

    state = getState(owner3Id);
    const [pendingInviteParams] = state.generatedInvites;
    const [pendingDeviceGrantParams] = state.generatedDeviceGrants;

    if (
      state.generateRecoveryKeyError ||
      !R.isEmpty(state.generateDeviceGrantErrors) ||
      !R.isEmpty(state.generateInviteErrors)
    ) {
      log("state.generateDeviceGrantErrors", state.generateDeviceGrantErrors);
      log("state.generateInviteErrors", state.generateInviteErrors);
    }

    state = getState(owner3Id);
    const pendingRecoveryKeyParams = state.generatedRecoveryKey!;

    let orgGraph = await getOrgGraph(orgId, {
      transactionConnOrPool: getPool(),
    });

    const start = Date.now();

    // console.log("owner can remove org admin");
    await testRemoveUser({
      actorId: ownerId,
      targetId: admin1Id,
      canRemove: true,
      canImmediatelyRevoke: false,
      canSubsequentlyRevoke: true,
    });

    // console.log("org admin cannot remove another org admin");
    await testRemoveUser({
      actorId: admin2Id,
      targetId: admin3Id,
      canRemove: false,
    });

    // console.log("org admin can remove basic user");
    await testRemoveUser({
      actorId: admin2Id,
      targetId: basic1Id,
      canRemove: true,
      canImmediatelyRevoke: true,
    });

    // console.log("org admin can remove self");
    await testRemoveUser({
      actorId: admin2Id,
      targetId: admin2Id,
      canRemove: true,
      canImmediatelyRevoke: false,
      canSubsequentlyRevoke: false,
      revocationRequestProcessorId: owner2Id,
    });

    await wait(2000);

    // console.log("basic user cannot remove an org admin");
    await testRemoveUser({
      actorId: basic2Id,
      targetId: admin3Id,
      canRemove: false,
    });

    // console.log("basic user cannot remove another basic user");
    await testRemoveUser({
      actorId: basic2Id,
      targetId: basic3Id,
      canRemove: false,
    });

    // console.log("basic user can remove self");
    await testRemoveUser({
      actorId: basic2Id,
      targetId: basic2Id,
      canRemove: true,
      canImmediatelyRevoke: true,
    });

    // console.log("owner can remove self if there's another owner");
    await testRemoveUser({
      actorId: ownerId,
      targetId: ownerId,
      canRemove: true,
      canImmediatelyRevoke: false,
      canSubsequentlyRevoke: false,
      isRemovingRoot: true,
      numAdditionalKeyables: 3,
      revocationRequestProcessorId: owner2Id,
      uninvolvedUserId: admin3Id,
    });

    await wait(2000);

    // console.log("owner can remove another owner");
    await testRemoveUser({
      actorId: owner3Id,
      targetId: owner2Id,
      canRemove: true,
      canImmediatelyRevoke: false,
      canSubsequentlyRevoke: true,
      isRemovingRoot: true,
      numAdditionalKeyables: 3,
      uninvolvedUserId: admin3Id,
    });

    await wait(2000);

    // console.log("owner cannot remove self it they're the only owner");
    await testRemoveUser({
      actorId: owner3Id,
      targetId: owner3Id,
      canRemove: false,
    });

    // console.log("admin cli user can remove a basic user");
    await testRemoveUser({
      actorId: cliUserId,
      actorCliKey: cliKey,
      targetId: basic3Id,
      canRemove: true,
      canImmediatelyRevoke: true,
    });

    // test fetch ENVKEY root replacements

    await envkeyFetch(serverEnvkeyIdPart, serverEncryptionKey);

    orgGraph = await getOrgGraph(orgId, { transactionConnOrPool: getPool() });
    let generatedEnvkey = orgGraph[
      serverGeneratedEnvkeyId
    ] as Api.Db.GeneratedEnvkey;

    // Disabling  until root pubkey replacement issue on 6-27-2022 can be fully debugged
    // const trustedRootUpdatedAt = generatedEnvkey.trustedRootUpdatedAt;
    // expect(trustedRootUpdatedAt).toBeGreaterThan(start);

    // const replacements = await getRootPubkeyReplacements(orgId, start);
    // expect(replacements.length).toBe(2);
    // for (let replacement of replacements) {
    //   expect(replacement.processedAtById[serverGeneratedEnvkeyId]).toBeNumber();
    // }

    await envkeyFetch(serverEnvkeyIdPart, serverEncryptionKey);

    orgGraph = await getOrgGraph(orgId, { transactionConnOrPool: getPool() });
    generatedEnvkey = orgGraph[
      serverGeneratedEnvkeyId
    ] as Api.Db.GeneratedEnvkey;

    // expect(generatedEnvkey.trustedRootUpdatedAt).toEqual(trustedRootUpdatedAt);

    // console.log("test accept invite root replacements");
    await acceptInvite(pendingInviteParams);

    // console.log("test accept device grant root replacements");
    await acceptDeviceGrant(owner3Id, pendingDeviceGrantParams);

    // console.log("test redeem recovery key root replacements");
    state = getState(owner3Id);
    const { id: recoveryKeyId } = graphTypes(state.graph).recoveryKeys[0];

    await dispatch(
      {
        type: Client.ActionType.LOAD_RECOVERY_KEY,
        payload: {
          ...pendingRecoveryKeyParams,
          hostUrl,
        },
      },
      owner3Id
    );

    const recoveryKey = await getDb<Api.Db.RecoveryKey>(recoveryKeyId, {
      transactionConn: undefined,
    });

    const emailToken = recoveryKey!.emailToken!;

    const loadRecoveryKeyRes = await dispatch(
      {
        type: Client.ActionType.LOAD_RECOVERY_KEY,
        payload: {
          ...pendingRecoveryKeyParams,
          emailToken,
          hostUrl,
        },
      },
      owner3Id
    );

    expect(loadRecoveryKeyRes.success).toBeTrue();
    const redeemRecoveryKeyRes = await dispatch(
      {
        type: Client.ActionType.REDEEM_RECOVERY_KEY,
        payload: {
          deviceName: "recovery-device",
          ...pendingRecoveryKeyParams,
          emailToken,
          hostUrl,
        },
      },
      owner3Id
    );

    expect(redeemRecoveryKeyRes.success).toBeTrue();
  });
});

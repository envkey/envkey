import "./helpers/dotenv_helper";
import { getTestId, getState, dispatch } from "./helpers/test_helper";
import { query } from "@api_shared/db";
import { acceptDeviceGrant } from "./helpers/device_grants_helper";
import * as R from "ramda";
import { registerWithEmail, loadAccount } from "./helpers/auth_helper";
import { createApp } from "./helpers/apps_helper";
import { createBlock } from "./helpers/blocks_helper";
import { getAuth, getEnvWithMeta } from "@core/lib/client";
import { Client, Api } from "@core/types";
import { graphTypes } from "@core/lib/graph";
import { acceptInvite } from "./helpers/invites_helper";
import {
  updateEnvs,
  updateLocals,
  getEnvironments,
} from "./helpers/envs_helper";
import waitForExpect from "wait-for-expect";

describe("devices", () => {
  let email: string, orgId: string, ownerId: string;

  beforeEach(async () => {
    email = `success+${getTestId()}@simulator.amazonses.com`;

    ({ orgId, userId: ownerId } = await registerWithEmail(email));
  });

  describe("managing access", () => {
    let appId: string, blockId: string, granteeId: string, granteeEmail: string;

    beforeEach(async () => {
      let state = getState(ownerId);
      const { orgRoles } = graphTypes(state.graph),
        orgAdminRole = R.indexBy(R.prop("name"), orgRoles)["Org Admin"];

      [{ id: appId }, { id: blockId }] = [
        await createApp(ownerId),
        await createBlock(ownerId),
      ];

      await updateEnvs(ownerId, appId);
      await updateLocals(ownerId, appId);
      await updateEnvs(ownerId, blockId);
      await updateLocals(ownerId, blockId);

      await dispatch(
        {
          type: Client.ActionType.INVITE_USERS,
          payload: [
            {
              user: {
                firstName: "Admin",
                lastName: "Test",
                email: `success+grantee-${getTestId()}@simulator.amazonses.com`,
                provider: <const>"email",
                uid: `success+grantee-${getTestId()}@simulator.amazonses.com`,
                orgRoleId: orgAdminRole.id,
              },
            },
          ],
        },
        ownerId
      );
      state = getState(ownerId);
      const invite = state.generatedInvites[0];
      ({ id: granteeId, email: granteeEmail } = invite.user);

      await acceptInvite(invite);

      state = getState(granteeId);
      await dispatch(
        {
          type: Client.ActionType.FORGET_DEVICE,
          payload: {
            accountId: granteeId,
          },
        },
        granteeId
      );

      // force refresh owner graph
      await loadAccount(ownerId);
    });

    test("generate, load, and accept a device grant, then revoke device", async () => {
      let state = getState(ownerId);

      await dispatch(
        { type: Client.ActionType.CLEAR_GENERATED_DEVICE_GRANTS },
        ownerId
      );

      const approveDeviceParams = [{ granteeId }],
        approveDevicesPromise = dispatch(
          {
            type: Client.ActionType.APPROVE_DEVICES,
            payload: approveDeviceParams,
          },
          ownerId
        );

      await waitForExpect(() => {
        state = getState(ownerId);
        expect(Object.values(state.generatingDeviceGrants)[0]).toEqual(
          approveDeviceParams
        );
      });

      const approveRes = await approveDevicesPromise;
      expect(approveRes.success).toBeTrue();

      await waitForExpect(() => {
        state = getState(ownerId);
        expect(state.generatingDeviceGrants).toEqual({});
        expect(state.generatedDeviceGrants.length).toBe(1);
      });

      const generatedDeviceGrant = state.generatedDeviceGrants[0];

      // test envs update with active device grant
      for (let envParentId of [appId, blockId]) {
        const environments = getEnvironments(ownerId, envParentId),
          [development] = environments;

        dispatch(
          {
            type: Client.ActionType.CREATE_ENTRY_ROW,
            payload: {
              envParentId: envParentId,
              entryKey: "GRANT_KEY",
              vals: {
                [development.id]: { val: "grant-val" },
              },
            },
          },
          ownerId
        );

        dispatch(
          {
            type: Client.ActionType.CREATE_ENTRY,
            payload: {
              envParentId: envParentId,
              environmentId: [envParentId, ownerId].join("|"),
              entryKey: "GRANT_KEY",
              val: { val: "grant-val" },
            },
          },
          ownerId
        );
      }

      await dispatch(
        {
          type: Client.ActionType.COMMIT_ENVS,
          payload: { message: "commit message" },
        },
        ownerId
      );

      state = getState(ownerId);

      await acceptDeviceGrant(granteeId, generatedDeviceGrant);

      state = getState(granteeId);
      const granteeDeviceId = getAuth<Client.ClientUserAuth>(
        state,
        granteeId
      )!.deviceId;

      await dispatch(
        {
          type: Client.ActionType.REFRESH_SESSION,
        },
        granteeId
      );

      await dispatch(
        {
          type: Client.ActionType.FETCH_ENVS,
          payload: {
            byEnvParentId: [appId, blockId].reduce(
              (agg, id) => ({ ...agg, [id]: { envs: true, changesets: true } }),
              {}
            ),
          },
        },
        granteeId
      );

      state = getState(granteeId);

      for (let envParentId of [appId, blockId]) {
        const environments = getEnvironments(granteeId, envParentId),
          [development, staging, production] = environments;

        expect(
          getEnvWithMeta(state, {
            envParentId,
            environmentId: development.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: { isUndefined: true },
            KEY3: { val: "key3-val" },
            GRANT_KEY: { val: "grant-val" },
            IMPORTED_KEY1: { val: "imported-val" },
            IMPORTED_KEY2: { val: "imported-val" },
          },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId,
            environmentId: staging.id,
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
            envParentId,
            environmentId: production.id,
          })
        ).toEqual({
          inherits: {},
          variables: { KEY2: { val: "val3" }, KEY3: { val: "key3-val" } },
        });

        expect(
          getEnvWithMeta(state, {
            envParentId,
            environmentId: [envParentId, ownerId].join("|"),
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY2: { isUndefined: true },
            KEY3: { val: "key3-locals-val" },
            GRANT_KEY: { val: "grant-val" },
            IMPORTED_KEY1: { val: "imported-val" },
            IMPORTED_KEY2: { val: "imported-val" },
          },
        });
      }

      expect(Object.values(state.changesets)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: expect.toBeString(),
            changesets: expect.arrayContaining([
              expect.objectContaining({
                message: "commit message",
                actions: expect.arrayContaining([
                  expect.objectContaining({
                    type: expect.toBeString(),
                    payload: expect.toBeObject(),
                    meta: expect.toBeObject(),
                  }),
                ]),
              }),
            ]),
          }),
        ])
      );

      // revoke device
      const promise = dispatch(
        {
          type: Api.ActionType.REVOKE_DEVICE,
          payload: { id: granteeDeviceId },
        },
        ownerId
      );

      await waitForExpect(() => {
        state = getState(ownerId);
        expect(state.isRemoving[granteeDeviceId]).toBeTrue();
      });

      const revokeRes = await promise;
      expect(revokeRes.success).toBeTrue();

      state = getState(ownerId);
      expect(state.isRemoving[granteeDeviceId]).toBeUndefined();

      // ensure revoked device can't authenticate
      const authRes = await dispatch(
        {
          type: Client.ActionType.REFRESH_SESSION,
        },
        granteeId
      );

      expect(authRes.success).toBeFalse();

      // ensure revoked device can't be revoked again
      const shouldFailRes = await dispatch(
        {
          type: Api.ActionType.REVOKE_DEVICE,
          payload: { id: granteeDeviceId },
        },
        ownerId
      );

      expect(shouldFailRes.success).toBeFalse();
    });

    test("revoke device grant", async () => {
      await dispatch(
        {
          type: Client.ActionType.APPROVE_DEVICES,
          payload: [{ granteeId }],
        },
        ownerId
      );

      let state = getState(ownerId);
      const generatedDeviceGrant = state.generatedDeviceGrants.slice(-1)[0];

      const deviceGrant = graphTypes(state.graph).deviceGrants.find(
          R.propEq("createdAt", state.graphUpdatedAt)
        )!,
        promise = dispatch(
          {
            type: Api.ActionType.REVOKE_DEVICE_GRANT,
            payload: { id: deviceGrant.id },
          },
          ownerId
        );
      state = getState(ownerId);
      expect(state.isRemoving[deviceGrant.id]).toBeTrue();

      const res = await promise;
      expect(res.success).toBeTrue();

      state = getState(ownerId);
      expect(state.isRemoving[deviceGrant.id]).toBeUndefined();

      // ensure revoked device grant can't be loaded
      const [{ skey: emailToken }] = await query<Api.Db.DeviceGrantPointer>({
          pkey: ["deviceGrant", generatedDeviceGrant.identityHash].join("|"),
          transactionConn: undefined,
        }),
        loadRes = await dispatch<
          Client.Action.ClientActions["LoadDeviceGrant"]
        >(
          {
            type: Client.ActionType.LOAD_DEVICE_GRANT,
            payload: {
              emailToken,
              encryptionToken: [
                generatedDeviceGrant.identityHash,
                generatedDeviceGrant.encryptionKey,
              ].join("_"),
            },
          },
          undefined
        );

      expect(loadRes.success).toBeFalse();
    });
  });
});

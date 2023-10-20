import "./helpers/dotenv_helper";
import { getTestId, dispatch, getState } from "./helpers/test_helper";
import {
  updateEnvs,
  updateLocals,
  getEnvironments,
} from "./helpers/envs_helper";
import { createBlock } from "./helpers/blocks_helper";
import { registerWithEmail } from "./helpers/auth_helper";
import { createApp } from "./helpers/apps_helper";
import {
  inviteUsers,
  inviteBasicUser,
  acceptInvite,
} from "./helpers/invites_helper";
import { Client, Api } from "@core/types";
import { getUserEncryptedKeyOrBlobComposite } from "@core/lib/blob";
import { graphTypes } from "@core/lib/graph";
import { getEnvWithMeta } from "@core/lib/client";
import { query } from "@api_shared/db";
import { log } from "@core/lib/utils/logger";

describe("invites", () => {
  let email: string,
    app1Id: string,
    app2Id: string,
    blockId: string,
    ownerId: string,
    orgId: string;

  beforeEach(async () => {
    email = `success+${getTestId()}@simulator.amazonses.com`;

    ({ userId: ownerId, orgId } = await registerWithEmail(email));
    [{ id: app1Id }, { id: app2Id }, { id: blockId }] = [
      await createApp(ownerId, "Test App 1"),
      await createApp(ownerId, "Test App 2"),
      await createBlock(ownerId),
    ];
  });

  describe("with envs set", () => {
    beforeEach(async () => {
      await updateEnvs(ownerId, app1Id);
      await updateLocals(ownerId, app1Id);
      await updateEnvs(ownerId, app2Id);
      await updateLocals(ownerId, app2Id);
      await updateEnvs(ownerId, blockId);
      await updateLocals(ownerId, blockId);
    });

    test("invite users", async () => {
      await inviteUsers(ownerId);
    });

    test("accept invite", async () => {
      let state = getState(ownerId);

      const [app1Development, app1Staging, app1Production] = getEnvironments(
          ownerId,
          app1Id
        ),
        [app2Development, app2Staging, app2Production] = getEnvironments(
          ownerId,
          app2Id
        ),
        inviteParams = await inviteBasicUser(ownerId);

      // test envs update with active invite
      dispatch(
        {
          type: Client.ActionType.CREATE_ENTRY_ROW,
          payload: {
            envParentId: app1Id,
            entryKey: "INVITE_KEY",
            vals: {
              [app1Development.id]: {
                val: "invite-val",
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
            envParentId: app2Id,
            entryKey: "INVITE_KEY",
            vals: {
              [app2Production.id]: {
                val: "invite-val",
              },
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
            environmentId: [app1Id, ownerId].join("|"),
            entryKey: "INVITE_KEY",
            val: { val: "invite-val" },
          },
        },
        ownerId
      );

      await dispatch(
        {
          type: Client.ActionType.COMMIT_ENVS,
          payload: {
            message: "commit message",
          },
        },
        ownerId
      );

      await acceptInvite(inviteParams);

      await dispatch(
        {
          type: Client.ActionType.REFRESH_SESSION,
        },
        inviteParams.user.id
      );

      await dispatch(
        {
          type: Client.ActionType.FETCH_ENVS,
          payload: {
            byEnvParentId: [app1Id, app2Id].reduce(
              (agg, id) => ({ ...agg, [id]: { envs: true, changesets: true } }),
              {}
            ),
          },
        },
        inviteParams.user.id
      );

      state = getState(inviteParams.user.id);

      // app 1 environments (admin access)
      expect(
        getEnvWithMeta(state, {
          envParentId: app1Id,
          environmentId: app1Development.id,
        })
      ).toEqual({
        inherits: {},
        variables: {
          KEY2: { isUndefined: true },
          KEY3: { val: "key3-val" },
          INVITE_KEY: { val: "invite-val" },
          IMPORTED_KEY1: {
            val: "imported-val",
          },
          IMPORTED_KEY2: {
            val: "imported-val",
          },
        },
      });

      expect(
        getEnvWithMeta(state, {
          envParentId: app1Id,
          environmentId: app1Staging.id,
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
          envParentId: app1Id,
          environmentId: app1Production.id,
        })
      ).toEqual({
        inherits: {},
        variables: {
          KEY2: { val: "val3" },
          KEY3: { val: "key3-val" },
        },
      });

      // app 1 owner locals
      const creatorOrgUser = graphTypes(state.graph).orgUsers.filter(
          (ou) => ou.isCreator
        )[0],
        creatorId = creatorOrgUser.id,
        creatorLocalsComposite = [app1Id, creatorId].join("|");

      expect(
        getEnvWithMeta(state, {
          envParentId: app1Id,
          environmentId: creatorLocalsComposite,
        })
      ).toEqual({
        inherits: {},
        variables: {
          KEY2: { isUndefined: true },
          KEY3: { val: "key3-locals-val" },
          INVITE_KEY: { val: "invite-val" },
          IMPORTED_KEY1: {
            val: "imported-val",
          },
          IMPORTED_KEY2: {
            val: "imported-val",
          },
        },
      });

      // app 2 environments (development access)
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
          IMPORTED_KEY1: {
            val: "imported-val",
          },
          IMPORTED_KEY2: {
            val: "imported-val",
          },
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

      // production env meta only
      expect(
        getEnvWithMeta(state, {
          envParentId: app2Id,
          environmentId: app2Production.id,
        })
      ).toEqual({
        inherits: {},
        variables: {
          KEY2: {},
          KEY3: {},
          INVITE_KEY: {},
        },
      });

      // no access to locals
      expect(
        state.envs[
          getUserEncryptedKeyOrBlobComposite({
            environmentId: [app2Id, creatorId].join("|"),
          })
        ]
      ).toBeUndefined();

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
    });

    test("revoke invite", async () => {
      let state = getState(ownerId);

      const inviteParams = await inviteBasicUser(ownerId);
      state = getState(ownerId);
      const { invites } = graphTypes(state.graph),
        inviteId = invites[0].id,
        promise = dispatch(
          {
            type: Api.ActionType.REVOKE_INVITE,
            payload: { id: inviteId },
          },
          ownerId
        );
      state = getState(ownerId);
      expect(state.isRemoving[inviteId]).toBeTrue();

      const res = await promise;

      if (!res.success) {
        log("revoke invite failed", res.resultAction);
      }

      expect(res.success).toBeTrue();

      state = getState(ownerId);
      expect(state.isRemoving[inviteId]).toBeUndefined();

      // ensure revoked invite can't be loaded
      const [{ skey: inviteEmailToken }] = await query<Api.Db.InvitePointer>({
          pkey: ["invite", inviteParams.identityHash].join("|"),
          transactionConn: undefined,
        }),
        loadInviteRes = await dispatch<
          Client.Action.ClientActions["LoadInvite"]
        >(
          {
            type: Client.ActionType.LOAD_INVITE,
            payload: {
              emailToken: inviteEmailToken,
              encryptionToken: [
                inviteParams.identityHash,
                inviteParams.encryptionKey,
              ].join("_"),
            },
          },
          undefined
        );
      expect(loadInviteRes.success).toBeFalse();
    });
  });
});

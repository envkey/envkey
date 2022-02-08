import "./helpers/dotenv_helper";
import { getTestId, getState, dispatch, hostUrl } from "./helpers/test_helper";
import { registerWithEmail } from "./helpers/auth_helper";
import { createApp } from "./helpers/apps_helper";
import { createBlock } from "./helpers/blocks_helper";
import { getEnvWithMeta } from "@core/lib/client";
import { Client, Api } from "@core/types";
import { graphTypes } from "@core/lib/graph";
import {
  updateEnvs,
  updateLocals,
  getEnvironments,
} from "./helpers/envs_helper";

import { getDb } from "@api_shared/db";

describe("recovery keys", () => {
  let email: string,
    ownerId: string,
    orgId: string,
    appId: string,
    blockId: string;

  beforeEach(async () => {
    email = `success+${getTestId()}@simulator.amazonses.com`;

    ({ userId: ownerId, orgId } = await registerWithEmail(email));
  });

  test("generate, re-generate, load, and accept a recovery key", async () => {
    [{ id: appId }, { id: blockId }] = [
      await createApp(ownerId),
      await createBlock(ownerId),
    ];

    await updateEnvs(ownerId, appId);
    await updateLocals(ownerId, appId);
    await updateEnvs(ownerId, blockId);
    await updateLocals(ownerId, blockId);

    let state = getState(ownerId);

    const createPromise = dispatch(
      {
        type: Client.ActionType.CREATE_RECOVERY_KEY,
      },
      ownerId
    );

    state = getState(ownerId);
    expect(state.isGeneratingRecoveryKey).toBeTrue();

    const createRes = await createPromise;
    expect(createRes.success).toBeTrue();

    state = getState(ownerId);
    expect(state.isGeneratingRecoveryKey).toBeUndefined();
    expect(state.generatedRecoveryKey).toEqual({
      encryptionKey: expect.toBeString(),
    });

    expect(graphTypes(state.graph).recoveryKeys.length).toBe(1);

    // test envs update with active recovery key
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

    const updateEnvRes = await dispatch(
      {
        type: Client.ActionType.COMMIT_ENVS,
        payload: { message: "commit message" },
      },
      ownerId
    );

    expect(updateEnvRes.success).toBeTrue();

    state = getState(ownerId);

    // test regenerate recovery key
    const recreatePromise = dispatch(
      {
        type: Client.ActionType.CREATE_RECOVERY_KEY,
      },
      ownerId
    );

    state = getState(ownerId);
    expect(state.isGeneratingRecoveryKey).toBeTrue();

    const recreateRes = await recreatePromise;
    expect(recreateRes.success).toBeTrue();

    state = getState(ownerId);
    expect(state.isGeneratingRecoveryKey).toBeUndefined();
    expect(state.generatedRecoveryKey).toEqual({
      encryptionKey: expect.toBeString(),
    });

    const { recoveryKeys } = graphTypes(state.graph);
    expect(recoveryKeys.length).toBe(1);
    const recoveryKeyId = recoveryKeys[0].id,
      encryptionKey = state.generatedRecoveryKey!.encryptionKey;

    // redeeming recovery key
    await dispatch(
      {
        type: Client.ActionType.GET_SESSION,
      },
      ownerId
    );

    const firstLoadPromise = dispatch<
      Client.Action.ClientActions["LoadRecoveryKey"]
    >(
      {
        type: Client.ActionType.LOAD_RECOVERY_KEY,
        payload: {
          encryptionKey,
          hostUrl,
        },
      },
      ownerId
    );

    state = getState(ownerId);
    expect(state.isLoadingRecoveryKey).toBe(true);

    const firstLoadRes = await firstLoadPromise;
    expect(firstLoadRes.success).toBeFalse();

    expect((firstLoadRes.resultAction as any).payload.type).toBe(
      "requiresEmailAuthError"
    );

    const recoveryKey = await getDb<Api.Db.RecoveryKey>(recoveryKeyId, {
      transactionConn: undefined,
    });

    const emailToken = recoveryKey!.emailToken;

    expect(emailToken).toBeString();

    const secondLoadPromise = dispatch<
      Client.Action.ClientActions["LoadRecoveryKey"]
    >(
      {
        type: Client.ActionType.LOAD_RECOVERY_KEY,
        payload: {
          encryptionKey,
          hostUrl,
          emailToken,
        },
      },
      ownerId
    );

    state = getState(ownerId);
    expect(state.isLoadingRecoveryKey).toBe(true);

    const secondLoadRes = await secondLoadPromise;

    expect(secondLoadRes.success).toBeTrue();

    state = getState(ownerId);

    expect(state.isLoadingRecoveryKey).toBeUndefined();
    expect(state.loadedRecoveryPrivkey).toBeObject();
    expect(state.loadedRecoveryKey).toEqual(
      expect.objectContaining({
        encryptedPrivkey: expect.toBeObject(),
        pubkey: expect.toBeObject(),
        userId: expect.toBeString(),
        deviceId: expect.toBeString(),
        creatorDeviceId: expect.toBeString(),
      })
    );
    expect(state.loadedRecoveryKeyEmailToken).toBeString();
    expect(state.loadedRecoveryKeyIdentityHash).toBeString();
    expect(state.loadedRecoveryKeyHostUrl).toBeString();
    expect(state.loadedRecoveryKeyOrgId).toBeString();

    expect(state.graph).toBeObject();

    const redeemPromise = dispatch<
      Client.Action.ClientActions["RedeemRecoveryKey"]
    >(
      {
        type: Client.ActionType.REDEEM_RECOVERY_KEY,
        payload: {
          deviceName: "recovery-device",
          encryptionKey,
          hostUrl,
          emailToken: emailToken!,
        },
      },
      ownerId
    );

    state = getState(ownerId);
    expect(state.isRedeemingRecoveryKey).toBe(true);

    const acceptRes = await redeemPromise;
    expect(acceptRes.success).toBeTrue();

    state = getState(ownerId);
    expect(state.isRedeemingRecoveryKey).toBeUndefined();

    expect(state.isLoadingRecoveryKey).toBeUndefined();
    expect(state.loadedRecoveryPrivkey).toBeUndefined();
    expect(state.loadedRecoveryKey).toBeUndefined();
    expect(state.loadedRecoveryKeyEmailToken).toBeUndefined();
    expect(state.loadedRecoveryKeyIdentityHash).toBeUndefined();
    expect(state.loadedRecoveryKeyHostUrl).toBeUndefined();
    expect(state.loadedRecoveryKeyOrgId).toBeUndefined();

    expect(state.graph).toBeObject();

    await dispatch(
      {
        type: Client.ActionType.GET_SESSION,
      },
      ownerId
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
      ownerId
    );

    state = getState(ownerId);

    for (let envParentId of [appId, blockId]) {
      const environments = getEnvironments(ownerId, envParentId),
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
  });
});

import { envkeyFetch } from "./fetch_helper";
import { getEnvironmentsByEnvParentId } from "@core/lib/graph";
import * as R from "ramda";
import { getState, dispatch } from "./test_helper";
import { Client, Rbac, Model, Api, Fetch } from "@core/types";

import { getEnvironments } from "./envs_helper";
import { getAuth } from "@core/lib/client";

export const createServer = async (
    accountId: string,
    appId: string,
    testFetchAndUpdate = false
  ) => {
    let state = getState(accountId);

    const [development] = getEnvironments(accountId, appId),
      promise = dispatch<Client.Action.ClientActions["CreateServer"]>(
        {
          type: Client.ActionType.CREATE_SERVER,
          payload: {
            appId,
            name: "Development Server",
            environmentId: development.id,
          },
        },
        accountId
      );

    state = getState(accountId);

    const res = await promise;
    expect(res.success).toBeTrue();

    state = getState(accountId);

    expect(Object.values(state.graph)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "server",
          appId,
          environmentId: development.id,
        }),
        expect.objectContaining({
          type: "generatedEnvkey",
          appId,
          keyableParentType: "server",
          keyableParentId: expect.toBeString(),
          pubkey: expect.toBeObject(),
          envkeyShort: expect.toBeString(),
          creatorId: expect.toBeString(),
        }),
      ])
    );

    if (testFetchAndUpdate) {
      const { envkeyIdPart, encryptionKey } = Object.values(
          state.generatedEnvkeys
        )[0],
        envkeyFetchRes = await envkeyFetch(envkeyIdPart, encryptionKey);
      expect(envkeyFetchRes).toEqual({
        KEY3: "key3-val",
        IMPORTED_KEY1: "imported-val",
        IMPORTED_KEY2: "imported-val",
      });

      dispatch(
        {
          type: Client.ActionType.UPDATE_ENTRY_VAL,
          payload: {
            envParentId: appId,
            environmentId: development.id,
            entryKey: "KEY3",
            update: {
              val: "key3-val-updated",
            },
          },
        },
        accountId
      );
      await dispatch(
        {
          type: Client.ActionType.COMMIT_ENVS,
          payload: { message: "commit message" },
        },
        accountId
      );

      const updatedEnvkeyFetchRes = await envkeyFetch(
        envkeyIdPart,
        encryptionKey
      );
      expect(updatedEnvkeyFetchRes).toEqual({
        KEY3: "key3-val-updated",
        IMPORTED_KEY1: "imported-val",
        IMPORTED_KEY2: "imported-val",
      });
    }
  },
  createLocalKey = async (
    accountId: string,
    appId: string,
    testFetchAndUpdate = false,
    addTestFetchVals = {}
  ) => {
    let state = getState(accountId);

    const [development] = getEnvironments(accountId, appId),
      currentUserId = getAuth(state, accountId)!.userId;

    const promise = dispatch<Client.Action.ClientActions["CreateLocalKey"]>(
      {
        type: Client.ActionType.CREATE_LOCAL_KEY,
        payload: {
          appId,
          name: "Local Development Key",
          environmentId: development.id,
        },
      },
      accountId
    );

    state = getState(accountId);

    const res = await promise;
    expect(res.success).toBeTrue();

    state = getState(accountId);

    expect(Object.values(state.graph)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "localKey",
          appId,
          environmentId: development.id,
        }),
        expect.objectContaining({
          type: "generatedEnvkey",
          appId,
          keyableParentType: "localKey",
          keyableParentId: expect.toBeString(),
          pubkey: expect.toBeObject(),
          envkeyShort: expect.toBeString(),
          creatorId: expect.toBeString(),
        }),
      ])
    );

    expect(Object.values(state.generatedEnvkeys)).toEqual(
      expect.arrayContaining([
        {
          keyableParentId: expect.toBeString(),
          envkeyIdPart: expect.toBeString(),
          encryptionKey: expect.toBeString(),
        },
      ])
    );

    if (testFetchAndUpdate) {
      const { envkeyIdPart, encryptionKey } = Object.values(
          state.generatedEnvkeys
        )[0],
        envkeyFetchRes = await envkeyFetch(envkeyIdPart, encryptionKey);
      expect(envkeyFetchRes).toEqual({
        ...addTestFetchVals,
        KEY3: "key3-locals-val",
        IMPORTED_KEY1: "imported-val",
        IMPORTED_KEY2: "imported-val",
      });

      dispatch(
        {
          type: Client.ActionType.CREATE_ENTRY_ROW,
          payload: {
            envParentId: appId,
            entryKey: "KEY4",
            vals: {
              [development.id]: { val: "key4-val" },
            },
          },
        },
        accountId
      );

      dispatch(
        {
          type: Client.ActionType.UPDATE_ENTRY_VAL,
          payload: {
            envParentId: appId,
            environmentId: [appId, currentUserId].join("|"),
            entryKey: "KEY3",
            update: { val: "key3-locals-val-updated" },
          },
        },
        accountId
      );
      await dispatch(
        {
          type: Client.ActionType.COMMIT_ENVS,
          payload: { message: "commit message" },
        },
        accountId
      );

      const updatedEnvkeyFetchRes = await envkeyFetch(
        envkeyIdPart,
        encryptionKey
      );
      expect(updatedEnvkeyFetchRes).toEqual({
        ...addTestFetchVals,
        KEY3: "key3-locals-val-updated",
        KEY4: "key4-val",
        IMPORTED_KEY1: "imported-val",
        IMPORTED_KEY2: "imported-val",
      });
    }
  };

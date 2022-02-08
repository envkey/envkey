import "./helpers/dotenv_helper";
import { getTestId, getState, dispatch } from "./helpers/test_helper";
import {
  getServersByEnvironmentId,
  getLocalKeysByEnvironmentId,
} from "@core/lib/graph";
import * as R from "ramda";

import { registerWithEmail } from "./helpers/auth_helper";
import { createApp } from "./helpers/apps_helper";
import {
  updateLocals,
  updateEnvs,
  getEnvironments,
} from "./helpers/envs_helper";
import { Api, Client } from "@core/types";

import { createServer, createLocalKey } from "./helpers/keyable_parents_helper";
import { envkeyFetch } from "./helpers/fetch_helper";
import { wait } from "@core/lib/utils/wait";
import { log } from "@core/lib/utils/logger";

describe("keyable parents", () => {
  let email: string, ownerId: string, appId: string, orgId: string;

  beforeEach(async () => {
    email = `success+${getTestId()}@simulator.amazonses.com`;

    ({ userId: ownerId, orgId } = await registerWithEmail(email));

    ({ id: appId } = await createApp(ownerId));
  });

  describe("with no envs set", () => {
    test("server", async () => {
      await createServer(ownerId, appId);
      let state = getState(ownerId);
      const { envkeyIdPart, encryptionKey } = Object.values(
          state.generatedEnvkeys
        )[0],
        envkeyFetchRes = await envkeyFetch(envkeyIdPart, encryptionKey);
      expect(envkeyFetchRes).toEqual({});
    });

    test("local key", async () => {
      await createLocalKey(ownerId, appId);
      let state = getState(ownerId);
      const { envkeyIdPart, encryptionKey } = Object.values(
          state.generatedEnvkeys
        )[0],
        envkeyFetchRes = await envkeyFetch(envkeyIdPart, encryptionKey);
      expect(envkeyFetchRes).toEqual({});
    });
  });

  describe("with envs set", () => {
    beforeEach(async () => {
      await updateEnvs(ownerId, appId);
      await updateLocals(ownerId, appId);
    });

    describe("create and generate", () => {
      test("server", async () => {
        await createServer(ownerId, appId, true);
      });

      test("local key", async () => {
        await createLocalKey(ownerId, appId, true);
      });
    });

    describe("re-generate", () => {
      beforeEach(async () => {
        await createServer(ownerId, appId);
        await createLocalKey(ownerId, appId);
      });

      test("re-generated envkey", async () => {
        let state = getState(ownerId);

        const [development] = getEnvironments(ownerId, appId),
          [{ id: serverId }, { id: localKeyId }] = [
            R.last(
              R.sortBy(
                R.prop("createdAt"),
                getServersByEnvironmentId(state.graph)[development.id] ?? []
              )
            )!,
            R.last(
              R.sortBy(
                R.prop("createdAt"),
                getLocalKeysByEnvironmentId(state.graph)[development.id] ?? []
              )
            )!,
          ],
          [[serverRes], [localKeyRes]] = [
            await Promise.all([
              dispatch(
                {
                  type: Client.ActionType.GENERATE_KEY,
                  payload: {
                    appId,
                    keyableParentType: "server",
                    keyableParentId: serverId,
                  },
                },
                ownerId
              ),
              wait(2000),
            ]),
            await Promise.all([
              dispatch(
                {
                  type: Client.ActionType.GENERATE_KEY,
                  payload: {
                    appId,
                    keyableParentType: "localKey",
                    keyableParentId: localKeyId,
                  },
                },
                ownerId
              ),
              wait(2000),
            ]),
          ];

        expect(serverRes.success).toBeTrue();
        expect(localKeyRes.success).toBeTrue();

        state = getState(ownerId);

        const {
            envkeyIdPart: serverEnvkeyIdPart,
            encryptionKey: serverEncryptionKey,
          } = state.generatedEnvkeys[serverId],
          {
            envkeyIdPart: localKeyEnvkeyIdPart,
            encryptionKey: localKeyEncryptionKey,
          } = state.generatedEnvkeys[localKeyId];

        const serverFetchRes = await envkeyFetch(
          serverEnvkeyIdPart,
          serverEncryptionKey
        );
        expect(serverFetchRes).toEqual({
          KEY3: "key3-val",
          IMPORTED_KEY1: "imported-val",
          IMPORTED_KEY2: "imported-val",
        });
        const serverCheckRes = await dispatch(
          {
            type: Api.ActionType.CHECK_ENVKEY,
            payload: {
              envkeyIdPart: serverEnvkeyIdPart,
            },
          },
          ownerId
        );
        expect((serverCheckRes.resultAction as any)?.payload).toEqual({
          appId,
          orgId,
          type: "checkResult",
        });

        const localKeyFetchRes = await envkeyFetch(
          localKeyEnvkeyIdPart,
          localKeyEncryptionKey
        );
        expect(localKeyFetchRes).toEqual({
          KEY3: "key3-locals-val",
          IMPORTED_KEY1: "imported-val",
          IMPORTED_KEY2: "imported-val",
        });

        // test CHECK_ENVKEY action (used for CLI auth with ENVKEY to set default account/app)
        const localKeyCheckRes = await dispatch(
          {
            type: Api.ActionType.CHECK_ENVKEY,
            payload: {
              envkeyIdPart: localKeyEnvkeyIdPart,
            },
          },
          ownerId
        );
        expect((localKeyCheckRes.resultAction as any)?.payload).toEqual({
          appId,
          orgId,
          type: "checkResult",
        });

        dispatch(
          {
            type: Client.ActionType.UPDATE_ENTRY_VAL,
            payload: {
              envParentId: appId,
              environmentId: development.id,
              entryKey: "KEY3",
              update: { val: "key3-val-updated" },
            },
          },
          ownerId
        );

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
          ownerId
        );

        dispatch(
          {
            type: Client.ActionType.UPDATE_ENTRY_VAL,
            payload: {
              envParentId: appId,
              environmentId: [appId, ownerId].join("|"),
              entryKey: "KEY3",
              update: { val: "key3-locals-val-updated" },
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

        const updatedServerFetchRes = await envkeyFetch(
          serverEnvkeyIdPart,
          serverEncryptionKey
        );
        expect(updatedServerFetchRes).toEqual({
          KEY3: "key3-val-updated",
          KEY4: "key4-val",
          IMPORTED_KEY1: "imported-val",
          IMPORTED_KEY2: "imported-val",
        });

        const updatedLocalKeyFetchRes = await envkeyFetch(
          localKeyEnvkeyIdPart,
          localKeyEncryptionKey
        );
        expect(updatedLocalKeyFetchRes).toEqual({
          KEY3: "key3-locals-val-updated",
          KEY4: "key4-val",
          IMPORTED_KEY1: "imported-val",
          IMPORTED_KEY2: "imported-val",
        });
      });
    });

    test("inheritance overrides", async () => {
      const [development, staging, production] = getEnvironments(
        ownerId,
        appId
      );

      dispatch(
        {
          type: Client.ActionType.CREATE_ENTRY_ROW,
          payload: {
            envParentId: appId,
            entryKey: "INHERITANCE_OVERRIDE_TEST",
            vals: {
              [development.id]: { inheritsEnvironmentId: staging.id },
              [staging.id]: { val: "staging-val" },
              [production.id]: { isUndefined: true },
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

      await createLocalKey(ownerId, appId, true, {
        INHERITANCE_OVERRIDE_TEST: "staging-val",
      });
    });
  });
});

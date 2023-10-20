import "./helpers/dotenv_helper";
import { getTestId, dispatch, getState } from "./helpers/test_helper";
import { testExport } from "./helpers/export_helper";
import * as R from "ramda";
import { createBlock } from "./helpers/blocks_helper";
import { registerWithEmail } from "./helpers/auth_helper";
import { createApp } from "./helpers/apps_helper";
import { inviteAdminUser, acceptInvite } from "./helpers/invites_helper";
import {
  updateEnvs,
  updateLocals,
  fetchEnvs,
  fetchChangesets,
  fetchEnvsWithChangesets,
  revertEnvironment,
  getEnvironments,
} from "./helpers/envs_helper";
import { Api, Model, Client } from "@core/types";
import { graphTypes } from "@core/lib/graph";
import {
  getPendingEnvWithMeta,
  getEnvWithMeta,
  getEnvironmentPendingConflicts,
  getEarliestEnvUpdatePendingAt,
} from "@core/lib/client";

import { envkeyFetch } from "./helpers/fetch_helper";
import { log } from "@core/lib/utils/logger";

describe("envs", () => {
  let email: string, ownerId: string, appId: string, blockId: string;

  beforeEach(async () => {
    email = `success+${getTestId()}@simulator.amazonses.com`;
    ({ userId: ownerId } = await registerWithEmail(email));

    [{ id: appId }, { id: blockId }] = [
      await createApp(ownerId),
      await createBlock(ownerId),
    ];
  });

  for (let envParentType of [<const>"app", <const>"block"]) {
    let envParentId: string;
    beforeEach(async () => {
      envParentId = envParentType == "app" ? appId : blockId;
    });

    describe(`update ${envParentType} envs`, () => {
      test("with single user", async () => {
        await updateEnvs(ownerId, envParentId);
        await updateLocals(ownerId, envParentId);
      });
    });

    describe(`fetch ${envParentType} envs`, () => {
      beforeEach(async () => {
        await updateEnvs(ownerId, envParentId);
        await updateLocals(ownerId, envParentId);
      });

      test("fetch envs", async () => {
        await fetchEnvs(ownerId, envParentId);
      });

      test("fetch changesets", async () => {
        await fetchChangesets(ownerId, envParentId);
      });

      test("fetch envs with changesets", async () => {
        await fetchEnvsWithChangesets(ownerId, envParentId);
      });
    });

    describe(`revert ${envParentType} environment`, () => {
      beforeEach(async () => {
        await updateEnvs(ownerId, envParentId);
        await updateLocals(ownerId, envParentId);
      });

      test("revert environment", async () => {
        await fetchEnvsWithChangesets(ownerId, envParentId);
        await revertEnvironment(ownerId, envParentId);
      });
    });
  }

  describe("create environment", () => {
    beforeEach(async () => {
      await updateEnvs(ownerId, appId);
    });

    test("sub environment", async () => {
      let state = getState(ownerId);

      const productionRole = R.indexBy(
          R.prop("name"),
          graphTypes(state.graph).environmentRoles
        )["Production"],
        [_, __, production] = getEnvironments(ownerId, appId);

      const createPromise = dispatch(
        {
          type: Api.ActionType.CREATE_ENVIRONMENT,
          payload: {
            envParentId: appId,
            environmentRoleId: productionRole.id,
            isSub: true,
            parentEnvironmentId: production.id,
            subName: "prod-sub",
          },
        },
        ownerId
      );

      state = getState(ownerId);

      expect(Object.keys(state.isCreatingEnvironment)).toEqual([appId]);
      expect(Object.values(state.isCreatingEnvironment[appId]).length).toBe(1);

      const res = await createPromise;

      expect(res.success).toBeTrue();

      state = getState(ownerId);
      expect(state.isCreatingEnvironment).toEqual({});

      const newEnvironment = R.last(
        R.sortBy(R.prop("createdAt"), graphTypes(state.graph).environments)
      ) as Model.Environment;

      dispatch(
        {
          type: Client.ActionType.IMPORT_ENVIRONMENT,
          payload: {
            envParentId: appId,
            environmentId: newEnvironment.id,
            parsed: {
              IMPORTED_KEY1: "imported-val",
              IMPORTED_KEY2: "imported-val",
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
            entryKey: "NEW_ENVIRONMENT_KEY",
            vals: {
              [newEnvironment.id]: {
                val: "new-environment-val",
              },
            },
          },
        },
        ownerId
      );

      state = getState(ownerId);

      expect(
        getPendingEnvWithMeta(state, {
          envParentId: appId,
          environmentId: newEnvironment.id,
        })
      ).toEqual({
        inherits: {},
        variables: {
          NEW_ENVIRONMENT_KEY: {
            val: "new-environment-val",
          },
          IMPORTED_KEY1: { val: "imported-val" },
          IMPORTED_KEY2: { val: "imported-val" },
        },
      });

      await dispatch(
        {
          type: Client.ActionType.COMMIT_ENVS,
          payload: { message: "commit message" },
        },
        ownerId
      );

      await dispatch(
        {
          type: Client.ActionType.REFRESH_SESSION,
        },
        ownerId
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
        ownerId
      );

      state = getState(ownerId);

      expect(
        getEnvWithMeta(state, {
          envParentId: appId,
          environmentId: newEnvironment.id,
        })
      ).toEqual({
        inherits: {},
        variables: {
          NEW_ENVIRONMENT_KEY: {
            val: "new-environment-val",
          },
          IMPORTED_KEY1: { val: "imported-val" },
          IMPORTED_KEY2: { val: "imported-val" },
        },
      });

      expect(state.changesets[newEnvironment.id]).toEqual(
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
        })
      );

      const serverRes = await dispatch<
        Client.Action.ClientActions["CreateServer"]
      >(
        {
          type: Client.ActionType.CREATE_SERVER,
          payload: {
            appId,
            name: "New Environment Server",
            environmentId: newEnvironment.id,
          },
        },
        ownerId
      );

      expect(serverRes.success).toBeTrue();
      state = getState(ownerId);

      const { envkeyIdPart, encryptionKey } = Object.values(
          state.generatedEnvkeys
        )[0],
        envkeyFetchRes = await envkeyFetch(envkeyIdPart, encryptionKey);
      expect(envkeyFetchRes).toEqual({
        KEY2: "val3",
        KEY3: "key3-val",
        NEW_ENVIRONMENT_KEY: "new-environment-val",
        IMPORTED_KEY1: "imported-val",
        IMPORTED_KEY2: "imported-val",
      });

      await testExport(
        ownerId,
        {
          envParentId: appId,
          environmentId: newEnvironment.id,
        },
        {
          NEW_ENVIRONMENT_KEY: "new-environment-val",
          IMPORTED_KEY1: "imported-val",
          IMPORTED_KEY2: "imported-val",
        }
      );

      await testExport(
        ownerId,
        {
          envParentId: appId,
          environmentId: newEnvironment.id,
          includeAncestors: true,
        },
        {
          KEY2: "val3",
          KEY3: "key3-val",
          NEW_ENVIRONMENT_KEY: "new-environment-val",
          IMPORTED_KEY1: "imported-val",
          IMPORTED_KEY2: "imported-val",
        }
      );
    });
  });

  describe("pending changes and conflicts", () => {
    let development: Model.Environment,
      staging: Model.Environment,
      production: Model.Environment;

    beforeEach(async () => {
      // make updates to a couple environments
      [development, staging, production] = getEnvironments(ownerId, appId);

      dispatch(
        {
          type: Client.ActionType.IMPORT_ENVIRONMENT,
          payload: {
            envParentId: appId,
            environmentId: development.id,
            parsed: {
              IMPORTED_KEY1: "imported-val",
              IMPORTED_KEY2: "imported-val",
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
            entryKey: "KEY1",
            vals: {
              [development.id]: { val: "val1" },
              [staging.id]: { val: "val2" },
              [production.id]: {
                inheritsEnvironmentId: development.id,
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
            envParentId: appId,
            entryKey: "KEY2",
            vals: {
              [development.id]: { isUndefined: true },
              [staging.id]: { isEmpty: true, val: "" },
              [production.id]: { val: "val3" },
            },
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
            entryKey: "LOCALS_KEY",
            val: { val: "val" },
          },
        },
        ownerId
      );

      let state = getState(ownerId);

      // ensure pending envs are what we expect them to be
      expect(
        getPendingEnvWithMeta(state, {
          envParentId: appId,
          environmentId: development.id,
        })
      ).toEqual({
        inherits: {},
        variables: {
          IMPORTED_KEY1: { val: "imported-val" },
          IMPORTED_KEY2: { val: "imported-val" },
          KEY1: { val: "val1" },
          KEY2: { isUndefined: true },
        },
      });

      expect(
        getPendingEnvWithMeta(state, {
          envParentId: appId,
          environmentId: staging.id,
        })
      ).toEqual({
        inherits: {},
        variables: {
          KEY1: { val: "val2" },
          KEY2: { isEmpty: true, val: "" },
        },
      });

      expect(
        getPendingEnvWithMeta(state, {
          envParentId: appId,
          environmentId: production.id,
        })
      ).toEqual({
        inherits: {
          [development.id]: ["KEY1"],
        },
        variables: {
          KEY1: { inheritsEnvironmentId: development.id },
          KEY2: { val: "val3" },
        },
      });

      expect(
        getPendingEnvWithMeta(state, {
          envParentId: appId,
          environmentId: [appId, ownerId].join("|"),
        })
      ).toEqual({
        inherits: {},
        variables: {
          LOCALS_KEY: { val: "val" },
        },
      });

      state = getState(ownerId);
      expect(getEarliestEnvUpdatePendingAt(state, appId)).toBeNumber();
    });

    describe("reset pending changes", () => {
      test("single environment", () => {
        dispatch(
          {
            type: Client.ActionType.RESET_ENVS,
            payload: {
              pendingEnvironmentIds: [development.id],
            },
          },
          ownerId
        );

        let state = getState(ownerId);

        // development should reset
        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: development.id,
          })
        ).toEqual({
          inherits: {},
          variables: {},
        });

        // staging and production should stay the same
        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: staging.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY1: { val: "val2" },
            KEY2: { isEmpty: true, val: "" },
          },
        });

        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: production.id,
          })
        ).toEqual({
          inherits: {
            [development.id]: ["KEY1"],
          },
          variables: {
            KEY1: { inheritsEnvironmentId: development.id },
            KEY2: { val: "val3" },
          },
        });

        // locals should stay the same
        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: [appId, ownerId].join("|"),
          })
        ).toEqual({
          inherits: {},
          variables: {
            LOCALS_KEY: { val: "val" },
          },
        });
      });

      test("local overrides", () => {
        dispatch(
          {
            type: Client.ActionType.RESET_ENVS,
            payload: {
              pendingEnvironmentIds: [[appId, ownerId].join("|")],
            },
          },
          ownerId
        );

        let state = getState(ownerId);

        // locals should reset
        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: [appId, ownerId].join("|"),
          })
        ).toEqual({
          inherits: {},
          variables: {},
        });

        // development, staging, and production should stay the same
        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: development.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            IMPORTED_KEY1: { val: "imported-val" },
            IMPORTED_KEY2: { val: "imported-val" },
            KEY1: { val: "val1" },
            KEY2: { isUndefined: true },
          },
        });

        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: staging.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY1: { val: "val2" },
            KEY2: { isEmpty: true, val: "" },
          },
        });

        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: production.id,
          })
        ).toEqual({
          inherits: {
            [development.id]: ["KEY1"],
          },
          variables: {
            KEY1: { inheritsEnvironmentId: development.id },
            KEY2: { val: "val3" },
          },
        });
      });

      test("multiple environments", () => {
        dispatch(
          {
            type: Client.ActionType.RESET_ENVS,
            payload: {
              pendingEnvironmentIds: [development.id, staging.id],
            },
          },
          ownerId
        );

        let state = getState(ownerId);

        // development and staging should reset
        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: development.id,
          })
        ).toEqual({
          inherits: {},
          variables: {},
        });

        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: staging.id,
          })
        ).toEqual({
          inherits: {},
          variables: {},
        });

        // production should stay the same
        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: production.id,
          })
        ).toEqual({
          inherits: {
            [development.id]: ["KEY1"],
          },
          variables: {
            KEY1: { inheritsEnvironmentId: development.id },
            KEY2: { val: "val3" },
          },
        });

        // locals should stay the same
        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: [appId, ownerId].join("|"),
          })
        ).toEqual({
          inherits: {},
          variables: {
            LOCALS_KEY: { val: "val" },
          },
        });
      });

      test("all environments", () => {
        dispatch(
          {
            type: Client.ActionType.RESET_ENVS,
            payload: {},
          },
          ownerId
        );

        let state = getState(ownerId);

        // all environments should reset
        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: development.id,
          })
        ).toEqual({
          inherits: {},
          variables: {},
        });

        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: staging.id,
          })
        ).toEqual({
          inherits: {},
          variables: {},
        });

        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: production.id,
          })
        ).toEqual({
          inherits: {},
          variables: {},
        });

        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: [appId, ownerId].join("|"),
          })
        ).toEqual({
          inherits: {},
          variables: {},
        });
      });

      test("single environment, specific entry keys", () => {
        dispatch(
          {
            type: Client.ActionType.RESET_ENVS,
            payload: {
              pendingEnvironmentIds: [development.id],
              entryKeys: ["IMPORTED_KEY1", "KEY2"],
            },
          },
          ownerId
        );

        let state = getState(ownerId);

        // development should reset specified keys only
        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: development.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            IMPORTED_KEY2: { val: "imported-val" },
            KEY1: { val: "val1" },
          },
        });

        // staging and production should stay the same
        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: staging.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY1: { val: "val2" },
            KEY2: { isEmpty: true, val: "" },
          },
        });

        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: production.id,
          })
        ).toEqual({
          inherits: {
            [development.id]: ["KEY1"],
          },
          variables: {
            KEY1: { inheritsEnvironmentId: development.id },
            KEY2: { val: "val3" },
          },
        });
      });

      test("multiple environments, specific entry keys", () => {
        dispatch(
          {
            type: Client.ActionType.RESET_ENVS,
            payload: {
              pendingEnvironmentIds: [development.id, staging.id],
              entryKeys: ["IMPORTED_KEY1", "KEY2"],
            },
          },
          ownerId
        );

        let state = getState(ownerId);

        // development and staging should reset specified keys only
        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: development.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            IMPORTED_KEY2: { val: "imported-val" },
            KEY1: { val: "val1" },
          },
        });

        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: staging.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY1: { val: "val2" },
          },
        });

        // production should stay the same
        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: production.id,
          })
        ).toEqual({
          inherits: {
            [development.id]: ["KEY1"],
          },
          variables: {
            KEY1: { inheritsEnvironmentId: development.id },
            KEY2: { val: "val3" },
          },
        });
      });

      test("all environments, specific entry keys", () => {
        dispatch(
          {
            type: Client.ActionType.RESET_ENVS,
            payload: {
              entryKeys: ["IMPORTED_KEY1", "KEY2"],
            },
          },
          ownerId
        );

        let state = getState(ownerId);

        // all environmentss should reset specified keys only
        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: development.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            IMPORTED_KEY2: { val: "imported-val" },
            KEY1: { val: "val1" },
          },
        });

        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: staging.id,
          })
        ).toEqual({
          inherits: {},
          variables: {
            KEY1: { val: "val2" },
          },
        });

        expect(
          getPendingEnvWithMeta(state, {
            envParentId: appId,
            environmentId: production.id,
          })
        ).toEqual({
          inherits: {
            [development.id]: ["KEY1"],
          },
          variables: {
            KEY1: { inheritsEnvironmentId: development.id },
          },
        });
      });
    });

    test("getEnvironmentPotentialConflicts", async () => {
      let invitedAdminId;

      // invite another user
      const params = await inviteAdminUser(ownerId);
      invitedAdminId = params.user.id;
      await acceptInvite(params);

      // make some conflicting changes
      dispatch(
        {
          type: Client.ActionType.CREATE_ENTRY_ROW,
          payload: {
            envParentId: appId,
            entryKey: "KEY2",
            vals: {
              [development.id]: { val: "conflict" },
              [staging.id]: { val: "conflict" },
              [production.id]: { val: "conflict" },
            },
          },
        },
        invitedAdminId
      );

      dispatch(
        {
          type: Client.ActionType.UPDATE_ENTRY_VAL,
          payload: {
            envParentId: appId,
            environmentId: development.id,
            entryKey: "IMPORTED_KEY2",
            update: { val: "conflict" },
          },
        },
        invitedAdminId
      );

      dispatch(
        {
          type: Client.ActionType.UPDATE_ENTRY_VAL,
          payload: {
            envParentId: appId,
            environmentId: [appId, ownerId].join("|"),
            entryKey: "LOCALS_KEY",
            update: { val: "conflict" },
          },
        },
        invitedAdminId
      );

      // and some non-conflicting changes
      dispatch(
        {
          type: Client.ActionType.CREATE_ENTRY_ROW,
          payload: {
            envParentId: appId,
            entryKey: "NO_CONFLICT",
            vals: {
              [development.id]: { val: "no-conflict" },
              [staging.id]: { val: "no-conflict" },
              [production.id]: { val: "no-conflict" },
            },
          },
        },
        invitedAdminId
      );

      dispatch(
        {
          type: Client.ActionType.UPDATE_ENTRY_VAL,
          payload: {
            envParentId: appId,
            environmentId: development.id,
            entryKey: "ANOTHER_NO_CONFLICT",
            update: { val: "no-conflict" },
          },
        },
        invitedAdminId
      );

      dispatch(
        {
          type: Client.ActionType.UPDATE_ENTRY_VAL,
          payload: {
            envParentId: appId,
            environmentId: [appId, ownerId].join("|"),
            entryKey: "LOCALS_NO_CONFLICT",
            update: { val: "no-conflict" },
          },
        },
        invitedAdminId
      );

      await dispatch(
        {
          type: Client.ActionType.COMMIT_ENVS,
          payload: {},
        },
        invitedAdminId
      );

      await dispatch(
        {
          type: Client.ActionType.FETCH_ENVS,
          payload: {
            byEnvParentId: {
              [appId]: { envs: true },
            },
          },
        },
        ownerId
      );

      let state = getState(ownerId);

      expect(Object.keys(state.changesets).length).toBeGreaterThan(0);

      expect(getEnvironmentPendingConflicts(state, development.id).length).toBe(
        2
      );
      expect(getEnvironmentPendingConflicts(state, staging.id).length).toBe(1);
      expect(getEnvironmentPendingConflicts(state, production.id).length).toBe(
        1
      );
      expect(
        getEnvironmentPendingConflicts(state, [appId, ownerId].join("|")).length
      ).toBe(1);
    });

    describe("outdated graph / outdated envs", () => {
      let invitedAdminId: string;

      beforeEach(async () => {
        // invite another user
        const params = await inviteAdminUser(ownerId);
        invitedAdminId = params.user.id;
        await acceptInvite(params);
      });

      test("with conflict", async () => {
        // make some new changes
        dispatch(
          {
            type: Client.ActionType.CREATE_ENTRY_ROW,
            payload: {
              envParentId: appId,
              entryKey: "KEY2",
              vals: {
                [development.id]: { val: "conflict" },
                [staging.id]: { val: "conflict" },
                [production.id]: { val: "conflict" },
              },
            },
          },
          invitedAdminId
        );

        await dispatch(
          {
            type: Client.ActionType.COMMIT_ENVS,
            payload: {},
          },
          invitedAdminId
        );

        const res = await dispatch(
          {
            type: Client.ActionType.COMMIT_ENVS,
            payload: {},
          },
          ownerId
        );

        expect(res.success).toBeFalse();
      });

      test("without conflict", async () => {
        // make some non-conflicting changes
        dispatch(
          {
            type: Client.ActionType.CREATE_ENTRY_ROW,
            payload: {
              envParentId: appId,
              entryKey: "NO_CONFLICT",
              vals: {
                [development.id]: { val: "conflict" },
                [staging.id]: { val: "conflict" },
                [production.id]: { val: "conflict" },
              },
            },
          },
          invitedAdminId
        );

        await dispatch(
          {
            type: Client.ActionType.COMMIT_ENVS,
            payload: {},
          },
          invitedAdminId
        );

        const res = await dispatch(
          {
            type: Client.ActionType.COMMIT_ENVS,
            payload: {},
          },
          ownerId
        );

        expect(res.success).toBeTrue();
      });
    });
  });
});

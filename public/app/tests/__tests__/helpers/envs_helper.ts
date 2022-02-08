import { dispatch, getState } from "./test_helper";
import { Api, Client, Rbac, Model } from "@core/types";
import * as R from "ramda";
import { getEnvironmentsByEnvParentId } from "@core/lib/graph";
import {
  getPendingEnvWithMeta,
  getEnvWithMeta,
  getAuth,
} from "@core/lib/client";
import { log } from "@core/lib/utils/logger";
import { wait } from "@core/lib/utils/wait";

export const getEnvironments = (accountId: string, envParentId: string) => {
    const state = getState(accountId),
      environmentsByRoleName = R.indexBy(
        ({ environmentRoleId }) =>
          (state.graph[environmentRoleId] as Rbac.EnvironmentRole).name,
        (getEnvironmentsByEnvParentId(state.graph)[envParentId] ?? []).filter(
          R.complement(R.prop("isSub"))
        )
      );

    return R.props<string, Model.Environment>(
      ["Development", "Staging", "Production"],
      environmentsByRoleName
    );
  },
  updateEnvs = async (
    accountId: string,
    envParentId: string,
    noCommit?: true
  ) => {
    let state = getState(accountId);

    const environments = getEnvironments(accountId, envParentId),
      [development, staging, production] = environments;

    dispatch(
      {
        type: Client.ActionType.IMPORT_ENVIRONMENT,
        payload: {
          envParentId,
          environmentId: development.id,
          parsed: {
            IMPORTED_KEY1: "imported-val",
            IMPORTED_KEY2: "imported-val",
          },
        },
      },
      accountId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY_ROW,
        payload: {
          envParentId,
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
      accountId
    );
    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY_ROW,
        payload: {
          envParentId,
          entryKey: "KEY2",
          vals: {
            [development.id]: { isUndefined: true },
            [staging.id]: { isEmpty: true, val: "" },
            [production.id]: { val: "val3" },
          },
        },
      },
      accountId
    );
    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY_ROW,
        payload: {
          envParentId,
          entryKey: "KEY3",
          vals: {
            [development.id]: { val: "key3-val" },
            [staging.id]: { val: "key3-val" },
            [production.id]: { val: "key3-val" },
          },
        },
      },
      accountId
    );

    state = getState(accountId);

    expect(
      getPendingEnvWithMeta(state, {
        envParentId,
        environmentId: development.id,
      })
    ).toEqual({
      inherits: {},
      variables: {
        KEY1: { val: "val1" },
        KEY2: { isUndefined: true },
        KEY3: { val: "key3-val" },
        IMPORTED_KEY1: { val: "imported-val" },
        IMPORTED_KEY2: { val: "imported-val" },
      },
    });

    expect(
      getPendingEnvWithMeta(state, {
        envParentId,
        environmentId: staging.id,
      })
    ).toEqual({
      inherits: {},
      variables: {
        KEY1: { val: "val2" },
        KEY2: { isEmpty: true, val: "" },
        KEY3: { val: "key3-val" },
      },
    });

    expect(
      getPendingEnvWithMeta(state, {
        envParentId,
        environmentId: production.id,
      })
    ).toEqual({
      inherits: { [development.id]: ["KEY1"] },
      variables: {
        KEY1: { inheritsEnvironmentId: development.id },
        KEY2: { val: "val3" },
        KEY3: { val: "key3-val" },
      },
    });

    await dispatch(
      {
        type: Client.ActionType.UPDATE_ENTRY_ROW,
        payload: {
          envParentId,
          entryKey: "KEY1",
          newEntryKey: "KEY1-RENAMED",
        },
      },
      accountId
    );
    state = getState(accountId);

    expect(
      getPendingEnvWithMeta(state, {
        envParentId,
        environmentId: development.id,
      })
    ).toEqual({
      inherits: {},
      variables: {
        "KEY1-RENAMED": { val: "val1" },
        KEY2: { isUndefined: true },
        KEY3: { val: "key3-val" },
        IMPORTED_KEY1: { val: "imported-val" },
        IMPORTED_KEY2: { val: "imported-val" },
      },
    });

    expect(
      getPendingEnvWithMeta(state, {
        envParentId,
        environmentId: staging.id,
      })
    ).toEqual({
      inherits: {},
      variables: {
        "KEY1-RENAMED": { val: "val2" },
        KEY2: { isEmpty: true, val: "" },
        KEY3: { val: "key3-val" },
      },
    });

    expect(
      getPendingEnvWithMeta(state, {
        envParentId,
        environmentId: production.id,
      })
    ).toEqual({
      inherits: { [development.id]: ["KEY1-RENAMED"] },
      variables: {
        "KEY1-RENAMED": { inheritsEnvironmentId: development.id },
        KEY2: { val: "val3" },
        KEY3: { val: "key3-val" },
      },
    });

    dispatch(
      {
        type: Client.ActionType.UPDATE_ENTRY_VAL,
        payload: {
          envParentId,
          environmentId: development.id,
          entryKey: "KEY1-RENAMED",
          update: { val: "val1-updated" },
        },
      },
      accountId
    );
    state = getState(accountId);

    expect(
      getPendingEnvWithMeta(state, {
        envParentId,
        environmentId: development.id,
      })
    ).toEqual({
      inherits: {},
      variables: {
        "KEY1-RENAMED": { val: "val1-updated" },
        KEY2: { isUndefined: true },
        KEY3: { val: "key3-val" },
        IMPORTED_KEY1: { val: "imported-val" },
        IMPORTED_KEY2: { val: "imported-val" },
      },
    });

    dispatch(
      {
        type: Client.ActionType.REMOVE_ENTRY_ROW,
        payload: {
          envParentId,
          entryKey: "KEY1-RENAMED",
        },
      },
      accountId
    );
    state = getState(accountId);

    expect(
      getPendingEnvWithMeta(state, {
        envParentId,
        environmentId: development.id,
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
      getPendingEnvWithMeta(state, {
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
      getPendingEnvWithMeta(state, {
        envParentId,
        environmentId: production.id,
      })
    ).toEqual({
      inherits: {},
      variables: { KEY2: { val: "val3" }, KEY3: { val: "key3-val" } },
    });

    if (!noCommit) {
      const promise = dispatch(
        {
          type: Client.ActionType.COMMIT_ENVS,
          payload: { message: "commit message" },
        },
        accountId
      );
      state = getState(accountId);

      const res = await promise;
      state = getState(accountId);

      expect(res.success).toBeTrue();
      for (let { id } of environments) {
        expect(state.isUpdatingEnvs[id]).toBeUndefined();
        expect(
          (state.graph[id] as Model.Environment).envUpdatedAt
        ).toBeNumber();
      }
      expect(
        (state.graph[envParentId] as Model.EnvParent).envsUpdatedAt
      ).toBeNumber();
      expect(state.pendingEnvUpdates).toBeEmpty();
    }
  },
  updateLocals = async (
    accountId: string,
    envParentId: string,
    userId?: string,
    noCommit?: true
  ) => {
    let state = getState(accountId);

    const localsUserId = userId ?? getAuth(state, accountId)!.userId,
      environmentId = [envParentId, localsUserId].join("|");

    dispatch(
      {
        type: Client.ActionType.IMPORT_ENVIRONMENT,
        payload: {
          envParentId,
          environmentId,
          parsed: {
            IMPORTED_KEY1: "imported-val",
            IMPORTED_KEY2: "imported-val",
          },
        },
      },
      accountId
    );

    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId,
          environmentId,
          entryKey: "KEY1",
          val: { val: "val1" },
        },
      },
      accountId
    );
    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId,
          environmentId,
          entryKey: "KEY2",
          val: { isUndefined: true },
        },
      },
      accountId
    );
    dispatch(
      {
        type: Client.ActionType.CREATE_ENTRY,
        payload: {
          envParentId,
          environmentId,
          entryKey: "KEY3",
          val: { val: "key3-locals-val" },
        },
      },
      accountId
    );
    state = getState(accountId);

    expect(
      getPendingEnvWithMeta(state, {
        envParentId,
        environmentId,
      })
    ).toEqual({
      inherits: {},
      variables: {
        KEY1: { val: "val1" },
        KEY2: { isUndefined: true },
        KEY3: { val: "key3-locals-val" },
        IMPORTED_KEY1: { val: "imported-val" },
        IMPORTED_KEY2: { val: "imported-val" },
      },
    });

    dispatch(
      {
        type: Client.ActionType.UPDATE_ENTRY,
        payload: {
          envParentId,
          environmentId,
          entryKey: "KEY1",
          newEntryKey: "KEY1-RENAMED",
        },
      },
      accountId
    );
    state = getState(accountId);

    expect(
      getPendingEnvWithMeta(state, {
        envParentId,
        environmentId,
      })
    ).toEqual({
      inherits: {},
      variables: {
        "KEY1-RENAMED": { val: "val1" },
        KEY2: { isUndefined: true },
        KEY3: { val: "key3-locals-val" },
        IMPORTED_KEY1: { val: "imported-val" },
        IMPORTED_KEY2: { val: "imported-val" },
      },
    });

    dispatch(
      {
        type: Client.ActionType.UPDATE_ENTRY_VAL,
        payload: {
          envParentId,
          environmentId,
          entryKey: "KEY1-RENAMED",
          update: { val: "val1-updated" },
        },
      },
      accountId
    );
    state = getState(accountId);

    expect(
      getPendingEnvWithMeta(state, {
        envParentId,
        environmentId,
      })
    ).toEqual({
      inherits: {},
      variables: {
        "KEY1-RENAMED": { val: "val1-updated" },
        KEY2: { isUndefined: true },
        KEY3: { val: "key3-locals-val" },
        IMPORTED_KEY1: { val: "imported-val" },
        IMPORTED_KEY2: { val: "imported-val" },
      },
    });

    dispatch(
      {
        type: Client.ActionType.REMOVE_ENTRY,
        payload: {
          envParentId,
          environmentId,
          entryKey: "KEY1-RENAMED",
        },
      },
      accountId
    );
    state = getState(accountId);

    expect(
      getPendingEnvWithMeta(state, {
        envParentId,
        environmentId,
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

    if (!noCommit) {
      const promise = dispatch(
        {
          type: Client.ActionType.COMMIT_ENVS,
          payload: { message: "commit message" },
        },
        accountId
      );

      state = getState(accountId);

      expect(state.isUpdatingEnvs[environmentId]).toBeTrue();
      expect(state.pendingEnvUpdates.length).not.toBeEmpty();

      const res = await promise;
      state = getState(accountId);

      expect(res.success).toBeTrue();
      expect(state.isUpdatingEnvs[environmentId]).toBeUndefined();
      expect(state.pendingEnvUpdates).toBeEmpty();

      expect(
        Object.values(
          (state.graph[envParentId] as Model.EnvParent).localsUpdatedAtByUserId
        )[0]
      ).toBeNumber();
    }
  },
  fetchEnvs = async (
    accountId: string,
    envParentId: string,
    userId?: string
  ) => {
    const promise = dispatch(
      {
        type: Client.ActionType.FETCH_ENVS,
        payload: {
          byEnvParentId: {
            [envParentId]: { envs: true },
          },
        },
      },
      accountId
    );

    let state = getState(accountId);
    const environments = getEnvironments(accountId, envParentId),
      [development, staging, production] = environments,
      localsUserId = userId ?? getAuth(state, accountId)!.userId;

    expect(state.isFetchingEnvs[envParentId]).toBeTrue();

    await promise;
    state = getState(accountId);

    expect(state.isFetchingEnvs[envParentId]).toBeUndefined();
    expect(state.envsFetchedAt).toEqual({
      [envParentId]: expect.toBeNumber(),
    });
    expect(
      (state.graph[envParentId] as Model.EnvParent).envsUpdatedAt
    ).toBeNumber();
    expect(
      Object.values(
        (state.graph[envParentId] as Model.EnvParent).localsUpdatedAtByUserId
      )[0]
    ).toBeNumber();

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
        environmentId: [envParentId, localsUserId].join("|"),
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
  },
  fetchChangesets = async (accountId: string, envParentId: string) => {
    const promise = dispatch(
      {
        type: Client.ActionType.FETCH_ENVS,
        payload: {
          byEnvParentId: {
            [envParentId]: { changesets: true },
          },
        },
      },
      accountId
    );

    let state = getState(accountId);
    expect(state.isFetchingChangesets[envParentId]).toBeTrue();

    await promise;
    state = getState(accountId);

    expect(state.isFetchingChangesets[envParentId]).toBeUndefined();

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
  },
  fetchEnvsWithChangesets = async (
    accountId: string,
    envParentId: string,
    userId?: string
  ) => {
    const promise = dispatch(
      {
        type: Client.ActionType.FETCH_ENVS,
        payload: {
          byEnvParentId: {
            [envParentId]: {
              envs: true,
              changesets: true,
            },
          },
        },
      },
      accountId
    );

    let state = getState(accountId);
    const environments = getEnvironments(accountId, envParentId),
      [development, staging, production] = environments,
      localsUserId = userId ?? getAuth(state, accountId)!.userId;

    expect(state.isFetchingEnvs[envParentId]).toBeTrue();
    expect(state.isFetchingChangesets[envParentId]).toBeTrue();

    await promise;
    state = getState(accountId);

    expect(state.isFetchingEnvs[envParentId]).toBeUndefined();
    expect(state.isFetchingChangesets[envParentId]).toBeUndefined();

    expect(state.envsFetchedAt).toEqual(
      expect.objectContaining({
        [envParentId]: expect.toBeNumber(),
      })
    );
    expect(
      (state.graph[envParentId] as Model.EnvParent).envsUpdatedAt
    ).toBeNumber();
    expect(
      Object.values(
        (state.graph[envParentId] as Model.EnvParent).localsUpdatedAtByUserId
      )[0]
    ).toBeNumber();

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
        environmentId: [envParentId, localsUserId].join("|"),
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
  },
  revertEnvironment = async (accountId: string, envParentId: string) => {
    let state = getState(accountId);

    const environments = getEnvironments(accountId, envParentId),
      [development] = environments,
      environmentId = development.id;

    dispatch(
      {
        type: Client.ActionType.REVERT_ENVIRONMENT,
        payload: {
          envParentId,
          environmentId,
          version: 5,
        },
      },
      accountId
    );
    state = getState(accountId);

    expect(
      getPendingEnvWithMeta(state, {
        envParentId,
        environmentId,
      })
    ).toEqual({
      inherits: {},
      variables: {
        "KEY1-RENAMED": { val: "val1" },
        KEY2: { isUndefined: true },
        KEY3: { val: "key3-val" },
        IMPORTED_KEY1: { val: "imported-val" },
        IMPORTED_KEY2: { val: "imported-val" },
      },
    });

    dispatch(
      {
        type: Client.ActionType.REVERT_ENVIRONMENT,
        payload: {
          envParentId,
          environmentId,
          entryKeys: ["KEY1"],
          version: 1,
        },
      },
      accountId
    );
    state = getState(accountId);

    expect(
      getPendingEnvWithMeta(state, {
        envParentId,
        environmentId,
      })
    ).toEqual({
      inherits: {},
      variables: {
        KEY1: { val: "val1" },
        "KEY1-RENAMED": { val: "val1" },
        KEY2: { isUndefined: true },
        KEY3: { val: "key3-val" },
        IMPORTED_KEY1: { val: "imported-val" },
        IMPORTED_KEY2: { val: "imported-val" },
      },
    });

    await dispatch(
      {
        type: Client.ActionType.COMMIT_ENVS,
        payload: {},
      },
      accountId
    );

    await dispatch(
      {
        type: Client.ActionType.FETCH_ENVS,
        payload: {
          byEnvParentId: {
            [envParentId]: { changesets: true },
          },
        },
      },
      accountId
    );

    state = getState(accountId);

    // test version rollbacks
    dispatch(
      {
        type: Client.ActionType.REVERT_ENVIRONMENT,
        payload: {
          envParentId,
          environmentId,
          version: -1,
          reverse: true,
        },
      },
      accountId
    );
    state = getState(accountId);

    expect(
      getPendingEnvWithMeta(state, {
        envParentId,
        environmentId,
      })
    ).toEqual({
      inherits: {},
      variables: {
        "KEY1-RENAMED": { val: "val1" },
        KEY2: { isUndefined: true },
        KEY3: { val: "key3-val" },
        IMPORTED_KEY1: { val: "imported-val" },
        IMPORTED_KEY2: { val: "imported-val" },
      },
    });

    await dispatch(
      {
        type: Client.ActionType.COMMIT_ENVS,
        payload: {},
      },
      accountId
    );

    await dispatch(
      {
        type: Client.ActionType.FETCH_ENVS,
        payload: {
          byEnvParentId: {
            [envParentId]: { changesets: true },
          },
        },
      },
      accountId
    );

    state = getState(accountId);

    dispatch(
      {
        type: Client.ActionType.REVERT_ENVIRONMENT,
        payload: {
          envParentId,
          environmentId,
          version: -3,
          reverse: true,
        },
      },
      accountId
    );
    state = getState(accountId);

    expect(
      getPendingEnvWithMeta(state, {
        envParentId,
        environmentId,
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

    return;
  };

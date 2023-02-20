import "./helpers/dotenv_helper";
import { getTestId, getState, dispatch } from "./helpers/test_helper";
import * as R from "ramda";
import { registerWithEmail } from "./helpers/auth_helper";
import { createApp } from "./helpers/apps_helper";
import { createBlock } from "./helpers/blocks_helper";
import { getAuth, getEnvWithMeta } from "@core/lib/client";
import { Client, Api } from "@core/types";
import { graphTypes } from "@core/lib/graph";
import {
  updateEnvs,
  updateLocals,
  getEnvironments,
  fetchEnvsWithChangesets,
} from "./helpers/envs_helper";
import { testRemoveUser } from "./helpers/org_helper";

describe("cli users", () => {
  let email: string,
    orgId: string,
    ownerId: string,
    ownerDeviceId: string,
    appId: string,
    blockId: string;

  beforeEach(async () => {
    email = `success+${getTestId()}@simulator.amazonses.com`;

    ({
      orgId,
      userId: ownerId,
      deviceId: ownerDeviceId,
    } = await registerWithEmail(email));

    // console.log("create app and block");
    [{ id: appId }, { id: blockId }] = [
      await createApp(ownerId),
      await createBlock(ownerId),
    ];

    // console.log("update envs");
    await updateEnvs(ownerId, appId);
    // console.log("update locals");
    await updateLocals(ownerId, appId);
    // console.log("update envs");
    await updateEnvs(ownerId, blockId);
    // console.log("update locals");
    await updateLocals(ownerId, blockId);
  });

  test("creating a cli user, then authenticating with cli key, then deleting", async () => {
    let state = getState(ownerId);

    const { orgRoles } = graphTypes(state.graph),
      orgAdminRole = R.indexBy(R.prop("name"), orgRoles)["Org Admin"];

    // console.log("create cli user");
    const createPromise = dispatch(
      {
        type: Client.ActionType.CREATE_CLI_USER,
        payload: {
          name: "cli-user",
          orgRoleId: orgAdminRole.id,
        },
      },
      ownerId
    );
    state = getState(ownerId);
    expect(Object.values(state.generatingCliUsers).length).toBe(1);
    const createRes = await createPromise;
    expect(createRes.success).toBeTrue();

    state = getState(ownerId);
    expect(state.generatingCliUsers).toEqual({});
    expect(state.generatedCliUsers.length).toBe(1);

    const { cliKey } = state.generatedCliUsers[0];

    // console.log("test envs update with cli user");
    // test envs update with cli user
    for (let envParentId of [appId, blockId]) {
      const environments = getEnvironments(ownerId, envParentId),
        [development] = environments;

      dispatch(
        {
          type: Client.ActionType.CREATE_ENTRY_ROW,
          payload: {
            envParentId,
            entryKey: "CLI_USER_KEY",
            vals: {
              [development.id]: { val: "cli-user-val" },
            },
          },
        },
        ownerId
      );

      dispatch(
        {
          type: Client.ActionType.CREATE_ENTRY,
          payload: {
            envParentId,
            environmentId: [envParentId, ownerId].join("|"),
            entryKey: "CLI_USER_KEY",
            val: { val: "cli-user-val" },
          },
        },
        ownerId
      );
    }

    // console.log("commit envs");
    await dispatch(
      {
        type: Client.ActionType.COMMIT_ENVS,
        payload: { message: "commit message" },
      },
      ownerId
    );

    let cliUserId: string;

    // console.log("authenticate cli user");
    const authPromise = dispatch(
      {
        type: Client.ActionType.AUTHENTICATE_CLI_KEY,
        payload: { cliKey },
      },
      cliKey
    );
    state = getState(cliKey);
    expect(state.isAuthenticatingCliKey).toBeTrue();

    const authRes = await authPromise;

    expect(authRes.success).toBeTrue();

    state = getState(cliKey);
    expect(state.isAuthenticatingCliKey).toBeUndefined();

    const cliAuth = getAuth<Client.ClientCliAuth>(state, cliKey);

    expect(cliAuth).toBeObject();

    cliUserId = cliAuth!.userId;

    // console.log("fetch envs with changesets");
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
      cliKey
    );

    state = getState(cliKey);

    for (let envParentId of [appId, blockId]) {
      const environments = getEnvironments(cliKey, envParentId),
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
          CLI_USER_KEY: { val: "cli-user-val" },
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
          CLI_USER_KEY: { val: "cli-user-val" },
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

    // console.log("create app with cli user");
    const { id: newAppId } = await createApp(cliKey);

    // console.log("update new app envs with cli user");
    await updateEnvs(cliKey, newAppId);
    // console.log("update new app locals with cli user");
    await updateLocals(cliKey, newAppId);

    // console.log("fetch envs with changesets with cli user");
    await fetchEnvsWithChangesets(cliKey, newAppId);

    // console.log("delete cli user");
    await testRemoveUser({
      actorId: ownerId,
      targetId: cliUserId,
      targetCliKey: cliKey,
      canRemove: true,
      canImmediatelyRevoke: false,
      canSubsequentlyRevoke: true,
    });

    state = getState(ownerId);

    // cannot delete the same cli user again
    const shouldFailDeleteRes = await dispatch(
      {
        type: Api.ActionType.DELETE_CLI_USER,
        payload: { id: cliUserId },
      },
      ownerId
    );

    expect(shouldFailDeleteRes.success).toBeFalse();
  });
});

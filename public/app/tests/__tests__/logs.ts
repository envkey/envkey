import "./helpers/dotenv_helper";
import { getTestId, dispatch, getState } from "./helpers/test_helper";
import { envkeyFetch } from "./helpers/fetch_helper";
import { graphTypes } from "@core/lib/graph";
import { getAuth } from "@core/lib/client";
import * as R from "ramda";
import { createBlock } from "./helpers/blocks_helper";
import { registerWithEmail, loadAccount } from "./helpers/auth_helper";
import { createApp } from "./helpers/apps_helper";
import { Api, Model, Logs, Client } from "@core/types";
import {
  updateEnvs,
  updateLocals,
  getEnvironments,
} from "./helpers/envs_helper";

import { acceptInvite } from "./helpers/invites_helper";
import { acceptDeviceGrant } from "./helpers/device_grants_helper";
import { log } from "@core/lib/utils/logger";

describe("fetching logs", () => {
  let ownerId: string,
    ownerDeviceId: string,
    orgId: string,
    appId: string,
    appToDeleteId: string,
    blockId: string,
    inviteeId: string,
    inviteeOriginalDeviceId: string,
    inviteeNewDeviceId: string,
    development: Model.Environment,
    staging: Model.Environment,
    localEnvkeyIdPart: string,
    localEncryptionKey: string,
    developmentEnvkeyIdPart: string,
    developmentEncryptionKey: string,
    stagingEnvkeyIdPart: string,
    stagingEncryptionKey: string,
    testStart: number,
    time1: number,
    time2: number;

  beforeEach(async () => {
    testStart = Date.now();

    const email = `success+${getTestId()}@simulator.amazonses.com`;

    ({
      orgId,
      userId: ownerId,
      deviceId: ownerDeviceId,
    } = await registerWithEmail(email));

    let state = getState(ownerId);

    // to test deleted graph
    const { id: toDeleteId } = await createApp(ownerId);
    await dispatch(
      {
        type: Api.ActionType.DELETE_APP,
        payload: {
          id: toDeleteId,
        },
      },
      ownerId
    );

    ({ id: appId } = await createApp(ownerId));
    ({ id: blockId } = await createBlock(ownerId));

    await updateEnvs(ownerId, appId);
    await updateLocals(ownerId, appId);
    await updateEnvs(ownerId, blockId);
    await updateLocals(ownerId, blockId);

    time1 = Date.now();

    const { orgRoles } = graphTypes(state.graph),
      adminRole = R.indexBy(R.prop("name"), orgRoles)["Org Admin"];

    await dispatch<Client.Action.ClientActions["InviteUsers"]>(
      {
        type: Client.ActionType.INVITE_USERS,
        payload: [
          {
            user: {
              firstName: "Invited",
              lastName: "User",
              email: `success+invited-user-${getTestId()}@simulator.amazonses.com`,
              provider: <const>"email",
              uid: `success+invited-user-${getTestId()}@simulator.amazonses.com`,
              orgRoleId: adminRole.id,
            },
          },
        ],
      },
      ownerId
    );
    state = getState(ownerId);
    const inviteParams = state.generatedInvites[0];
    inviteeId = inviteParams.user.id;

    await acceptInvite(inviteParams);

    state = getState(inviteeId);
    inviteeOriginalDeviceId = getAuth<Client.ClientUserAuth>(
      state,
      inviteeId
    )!.deviceId;

    [development, staging] = getEnvironments(inviteeId, appId);

    await dispatch(
      {
        type: Client.ActionType.CREATE_LOCAL_KEY,
        payload: {
          appId,
          name: "Development Key",
          environmentId: development.id,
        },
      },
      inviteeId
    );

    await dispatch<Client.Action.ClientActions["CreateServer"]>(
      {
        type: Client.ActionType.CREATE_SERVER,
        payload: {
          appId,
          name: "Development Server",
          environmentId: development.id,
        },
      },
      inviteeId
    );

    await dispatch<Client.Action.ClientActions["CreateServer"]>(
      {
        type: Client.ActionType.CREATE_SERVER,
        payload: {
          appId,
          name: "Staging Server",
          environmentId: staging.id,
        },
      },
      inviteeId
    );

    state = getState(inviteeId);

    [
      { envkeyIdPart: localEnvkeyIdPart, encryptionKey: localEncryptionKey },
      {
        envkeyIdPart: developmentEnvkeyIdPart,
        encryptionKey: developmentEncryptionKey,
      },
      {
        envkeyIdPart: stagingEnvkeyIdPart,
        encryptionKey: stagingEncryptionKey,
      },
    ] = Object.values(state.generatedEnvkeys);

    state = getState(ownerId);
    await dispatch(
      {
        type: Client.ActionType.FORGET_DEVICE,
        payload: {
          accountId: inviteeId,
        },
      },
      inviteeId
    );

    await loadAccount(ownerId);

    await dispatch(
      {
        type: Client.ActionType.APPROVE_DEVICES,
        payload: [{ granteeId: inviteeId }],
      },
      ownerId
    );
    state = getState(ownerId);
    const generatedDeviceGrant = state.generatedDeviceGrants[0];

    await acceptDeviceGrant(inviteeId, generatedDeviceGrant);

    state = getState(inviteeId);

    inviteeNewDeviceId = getAuth<Client.ClientUserAuth>(
      state,
      inviteeId
    )!.deviceId;

    await updateEnvs(inviteeId, appId);
    await updateEnvs(inviteeId, blockId);

    ({ id: appToDeleteId } = await createApp(ownerId));
    await dispatch(
      {
        type: Api.ActionType.DELETE_APP,
        payload: { id: appToDeleteId },
      },
      ownerId
    );

    time2 = Date.now();

    await Promise.all([
      envkeyFetch(developmentEnvkeyIdPart, developmentEncryptionKey),
      envkeyFetch(stagingEnvkeyIdPart, stagingEncryptionKey),
    ]);
  });

  test("paging, filtering, sorting, clearing", async () => {
    await loadAccount(ownerId);

    let state = getState(ownerId);

    const firstPagePromise = dispatch(
      {
        type: Api.ActionType.FETCH_LOGS,
        payload: {
          pageNum: 0,
          pageSize: 9,
          scope: <const>"org",
          loggableTypes: Logs.ORG_LOGGABLE_TYPES,
        },
      },
      ownerId
    );

    state = getState(ownerId);
    expect(state.isFetchingLogs).toBeTrue();
    expect(state.fetchLogParams).toBeUndefined();

    const firstPageRes = await firstPagePromise;

    expect(firstPageRes.success).toBe(true);

    state = getState(ownerId);

    expect(state.isFetchingLogs).toBeUndefined();
    expect(state.fetchLogParams).toEqual({
      pageSize: 9,
      scope: <const>"org",
      loggableTypes: Logs.ORG_LOGGABLE_TYPES,
    });
    expect(state.loggedActionsWithTransactionIds.length).toBe(9);

    expect(state.logsTotalCount).toBeNumber();
    expect(Object.keys(state.deletedGraph).length).toBeGreaterThan(0);

    expect(
      state.loggedActionsWithTransactionIds.flatMap(([, actions]) =>
        actions.map(R.prop("actionType"))
      )
    ).toEqual([
      Api.ActionType.REGISTER,
      Api.ActionType.CREATE_DEVICE_GRANT,
      Api.ActionType.LOAD_DEVICE_GRANT,
      Api.ActionType.ACCEPT_DEVICE_GRANT,
      Api.ActionType.CREATE_APP,
      Api.ActionType.UPDATE_ENVS,
      Api.ActionType.DELETE_APP,
      Api.ActionType.CREATE_APP,
      Api.ActionType.UPDATE_ENVS,
    ]);

    const secondPagePromise = dispatch(
      {
        type: Api.ActionType.FETCH_LOGS,
        payload: {
          pageNum: 1,
          pageSize: 9,
          scope: <const>"org",
          loggableTypes: Logs.ORG_LOGGABLE_TYPES,
        },
      },
      ownerId
    );

    state = getState(ownerId);

    expect(state.isFetchingLogs).toBeTrue();
    expect(state.logsTotalCount).toBeNumber();
    expect(state.fetchLogParams).toEqual({
      pageSize: 9,
      scope: <const>"org",
      loggableTypes: Logs.ORG_LOGGABLE_TYPES,
    });

    expect(
      state.loggedActionsWithTransactionIds.flatMap(([, actions]) =>
        actions.map(R.prop("actionType"))
      )
    ).toEqual([
      Api.ActionType.REGISTER,
      Api.ActionType.CREATE_DEVICE_GRANT,
      Api.ActionType.LOAD_DEVICE_GRANT,
      Api.ActionType.ACCEPT_DEVICE_GRANT,
      Api.ActionType.CREATE_APP,
      Api.ActionType.UPDATE_ENVS,
      Api.ActionType.DELETE_APP,
      Api.ActionType.CREATE_APP,
      Api.ActionType.UPDATE_ENVS,
    ]);

    const secondPageRes = await secondPagePromise;
    expect(secondPageRes.success).toBe(true);
    state = getState(ownerId);

    expect(state.isFetchingLogs).toBeUndefined();
    expect(state.loggedActionsWithTransactionIds.length).toBe(18);

    expect(
      state.loggedActionsWithTransactionIds.flatMap(([, actions]) =>
        actions.map(R.prop("actionType"))
      )
    ).toEqual([
      Api.ActionType.REGISTER,
      Api.ActionType.CREATE_DEVICE_GRANT,
      Api.ActionType.LOAD_DEVICE_GRANT,
      Api.ActionType.ACCEPT_DEVICE_GRANT,
      Api.ActionType.CREATE_APP,
      Api.ActionType.UPDATE_ENVS,
      Api.ActionType.DELETE_APP,
      Api.ActionType.CREATE_APP,
      Api.ActionType.UPDATE_ENVS,
      Api.ActionType.CREATE_BLOCK,
      Api.ActionType.UPDATE_ENVS,
      Api.ActionType.UPDATE_ENVS,
      Api.ActionType.UPDATE_ENVS,
      Api.ActionType.UPDATE_ENVS,
      Api.ActionType.UPDATE_ENVS,
      Api.ActionType.FETCH_ENVS,
      Api.ActionType.CREATE_INVITE,
      Api.ActionType.LOAD_INVITE,
    ]);

    // update filters - ensure that logs get cleared
    const updateFiltersPromise = dispatch(
      {
        type: Api.ActionType.FETCH_LOGS,
        payload: {
          pageNum: 0,
          pageSize: 2,
          scope: <const>"org",
          loggableTypes: ["orgAction"],
        },
      },
      ownerId
    );

    state = getState(ownerId);
    expect(state.isFetchingLogs).toBeTrue();
    expect(state.deletedGraph).toBeObject();
    expect(state.logsTotalCount).toBeUndefined();
    expect(state.loggedActionsWithTransactionIds).toEqual([]);

    const updateFiltersRes = await updateFiltersPromise;
    expect(updateFiltersRes.success).toBe(true);
    state = getState(ownerId);

    expect(state.isFetchingLogs).toBeUndefined();
    expect(state.logsTotalCount).toBeNumber();
    expect(state.loggedActionsWithTransactionIds.length).toBeGreaterThan(0);

    expect(
      state.loggedActionsWithTransactionIds.flatMap(([, actions]) =>
        actions.map(R.prop("actionType"))
      )
    ).toEqual([
      Api.ActionType.CREATE_DEVICE_GRANT,
      Api.ActionType.ACCEPT_DEVICE_GRANT,
    ]);

    // clear logs
    await dispatch({ type: Client.ActionType.CLEAR_LOGS }, ownerId);

    state = getState(ownerId);
    expect(state.fetchLogParams).toBeUndefined();
    expect(state.loggedActionsWithTransactionIds).toEqual([]);
    expect(state.deletedGraph).toEqual({});
    expect(state.logsTotalCount).toBeUndefined();

    // sort descending
    await dispatch(
      {
        type: Api.ActionType.FETCH_LOGS,
        payload: {
          pageNum: 0,
          pageSize: 5,
          scope: <const>"org",
          loggableTypes: Logs.ORG_LOGGABLE_TYPES,
          sortDesc: true,
        },
      },
      ownerId
    );

    state = getState(ownerId);
    expect(
      state.loggedActionsWithTransactionIds.flatMap(([, actions]) =>
        actions.map(R.prop("actionType"))
      )
    ).toIncludeAllMembers([
      Api.ActionType.FETCH_LOGS,
      Api.ActionType.FETCH_LOGS,
      Api.ActionType.FETCH_LOGS,
    ]);

    // time range
    await dispatch(
      {
        type: Api.ActionType.FETCH_LOGS,
        payload: {
          pageNum: 0,
          pageSize: 6,
          scope: <const>"org",
          loggableTypes: Logs.ORG_LOGGABLE_TYPES,
          startsAt: time1,
          endsAt: time2,
        },
      },
      ownerId
    );

    state = getState(ownerId);
    expect(
      state.loggedActionsWithTransactionIds.flatMap(([, actions]) =>
        actions.map(R.prop("actionType"))
      )
    ).toEqual([
      Api.ActionType.FETCH_ENVS,
      Api.ActionType.CREATE_INVITE,
      Api.ActionType.LOAD_INVITE,
      Api.ActionType.ACCEPT_INVITE,
      Api.ActionType.CREATE_LOCAL_KEY,
      Api.ActionType.GENERATE_KEY,
    ]);

    // time range deleted graph
    await dispatch(
      {
        type: Api.ActionType.FETCH_LOGS,
        payload: {
          pageNum: 0,
          pageSize: 100,
          scope: <const>"org",
          loggableTypes: Logs.ORG_LOGGABLE_TYPES,
          startsAt: time1,
          endsAt: time2,
        },
      },
      ownerId
    );
    state = getState(ownerId);

    // user logs
    await dispatch(
      {
        type: Api.ActionType.FETCH_LOGS,
        payload: {
          pageNum: 0,
          pageSize: 3,
          scope: <const>"org",
          loggableTypes: Logs.ORG_LOGGABLE_TYPES,
          userIds: [inviteeId],
        },
      },
      ownerId
    );

    state = getState(ownerId);

    expect(
      state.loggedActionsWithTransactionIds.flatMap(([, actions]) =>
        actions.map(R.prop("actionType"))
      )
    ).toEqual([
      Api.ActionType.CREATE_INVITE,
      Api.ActionType.LOAD_INVITE,
      Api.ActionType.ACCEPT_INVITE,
    ]);

    await dispatch(
      {
        type: Api.ActionType.FETCH_LOGS,
        payload: {
          pageNum: 0,
          pageSize: 4,
          scope: <const>"org",
          loggableTypes: ["fetchMetaAction"],
          userIds: [ownerId, inviteeId],
        },
      },
      ownerId
    );

    state = getState(ownerId);
    expect(
      state.loggedActionsWithTransactionIds.flatMap(([, actions]) =>
        actions.map(R.prop("actionType"))
      )
    ).toEqual([
      Api.ActionType.LOAD_DEVICE_GRANT,
      Api.ActionType.FETCH_ENVS,
      Api.ActionType.LOAD_INVITE,
      Api.ActionType.GET_SESSION,
    ]);

    // device
    await dispatch(
      {
        type: Api.ActionType.FETCH_LOGS,
        payload: {
          pageNum: 0,
          pageSize: 3,
          scope: <const>"org",
          loggableTypes: ["orgAction"],
          deviceIds: [inviteeNewDeviceId],
        },
      },
      ownerId
    );

    state = getState(ownerId);

    expect(
      state.loggedActionsWithTransactionIds.flatMap(([, actions]) =>
        actions.map(R.prop("actionType"))
      )
    ).toEqual([
      Api.ActionType.ACCEPT_DEVICE_GRANT,
      Api.ActionType.UPDATE_ENVS,
      Api.ActionType.UPDATE_ENVS,
    ]);

    await dispatch(
      {
        type: Api.ActionType.FETCH_LOGS,
        payload: {
          pageNum: 0,
          pageSize: 3,
          scope: <const>"org",
          loggableTypes: ["fetchMetaAction"],
          actionTypes: [Api.ActionType.LOAD_INVITE, Api.ActionType.GET_SESSION],
          deviceIds: [ownerDeviceId, inviteeOriginalDeviceId],
        },
      },
      ownerId
    );

    state = getState(ownerId);
    expect(
      state.loggedActionsWithTransactionIds.flatMap(([, actions]) =>
        actions.map(R.prop("actionType"))
      )
    ).toEqual([
      Api.ActionType.LOAD_INVITE,
      Api.ActionType.GET_SESSION,
      Api.ActionType.GET_SESSION,
    ]);

    // targets
    await dispatch(
      {
        type: Api.ActionType.FETCH_LOGS,
        payload: {
          pageNum: 0,
          pageSize: 3,
          scope: <const>"org",
          loggableTypes: Logs.ORG_LOGGABLE_TYPES,
          targetIds: [appId],
        },
      },
      ownerId
    );

    state = getState(ownerId);
    expect(
      state.loggedActionsWithTransactionIds.flatMap(([, actions]) =>
        actions.map(R.prop("actionType"))
      )
    ).toEqual([
      Api.ActionType.CREATE_APP,
      Api.ActionType.UPDATE_ENVS,
      Api.ActionType.UPDATE_ENVS,
    ]);

    await dispatch(
      {
        type: Api.ActionType.FETCH_LOGS,
        payload: {
          pageNum: 0,
          pageSize: 3,
          scope: <const>"org",
          loggableTypes: ["fetchEnvkeyAction"],
          targetIds: [development.id],
        },
      },
      ownerId
    );

    state = getState(ownerId);
    expect(
      state.loggedActionsWithTransactionIds.flatMap(([, actions]) =>
        actions.map(R.prop("actionType"))
      )
    ).toEqual([Api.ActionType.FETCH_ENVKEY]);

    // host logs - this doesn't play nice with parallel tests :-/
    // await dispatch(
    //   {
    //     type: Api.ActionType.FETCH_LOGS,
    //     payload: {
    //       pageNum: 0,
    //       pageSize: 3,
    //       scope: <const>"host",
    //       orgIds: [orgId],
    //       startsAt: testStart,
    //     },
    //   },
    //   ownerId
    // );

    // state = getState(ownerId);
    // expect(state.loggedActionsWithTransactionIds.flatMap(([,actions])=> actions.map(R.prop("actionType")))).toEqual([
    //   Api.ActionType.CREATE_EMAIL_VERIFICATION,
    //   Api.ActionType.REGISTER,
    // ]);
  });

  test("fetch deleted graph", async () => {
    await loadAccount(ownerId);

    let state = getState(ownerId);

    const promise = dispatch(
      {
        type: Api.ActionType.FETCH_DELETED_GRAPH,
        payload: {},
      },
      ownerId
    );

    state = getState(ownerId);
    expect(state.isFetchingDeletedGraph).toBeTrue();

    const res = await promise;

    expect(res.success).toBe(true);

    state = getState(ownerId);

    expect(state.isFetchingDeletedGraph).toBeUndefined();
    expect(Object.keys(state.deletedGraph).length).toBeGreaterThan(0);
  });
});
